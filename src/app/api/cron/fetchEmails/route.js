import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';
import { startWatch, fullSync } from '@/lib/gmailSync';

async function isAuthorized(request) {
  // Allow Vercel Cron (or any caller) that presents the shared cron secret
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }

  // Allow an already-logged-in admin (e.g. the "Force Fetch Emails" button)
  const token = request.cookies.get('admin_token')?.value;
  if (token && process.env.JWT_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

export async function GET(request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const accounts = await prisma.seedAccount.findMany({
      where: { status: 'active' }
    });

    const report = [];

    for (const account of accounts) {
      const accountReport = { email: account.email, messagesFound: 0, messagesSaved: 0, error: null };
      try {
    // Initialize OAuth2 client and refresh access token if needed
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Set the refresh token
    oauth2Client.setCredentials({
      refresh_token: account.refreshToken,
    });

    // Unconditionally refresh the access token to avoid expiry issues
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update the DB with the new tokens
      await prisma.seedAccount.update({
        where: { id: account.id },
        data: {
          accessToken: credentials.access_token,
          expiryDate: credentials.expiry_date,
          // Update refresh token if a new one is provided (rare, but good practice)
          ...(credentials.refresh_token && { refreshToken: credentials.refresh_token })
        },
      });
      
      oauth2Client.setCredentials(credentials);
      console.log(`Refreshed token for ${account.email}`);
    } catch (refreshErr) {
      console.error(`Failed to refresh token for ${account.email}:`, refreshErr);
      // If refresh fails, we might as well skip this account or let it fail naturally below
      accountReport.error = 'Token refresh failed: ' + refreshErr.message;
      report.push(accountReport);
      continue;
    }

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Gmail push notification watches expire after 7 days - renew if
        // missing or expiring within the next 24h so real-time sync keeps working.
        const dayFromNow = Date.now() + 24 * 60 * 60 * 1000;
        if (!account.watchExpiration || Number(account.watchExpiration) < dayFromNow) {
          try {
            await startWatch(gmail, account.id);
            console.log(`Renewed Gmail watch for ${account.email}`);
          } catch (watchErr) {
            console.error(`Failed to renew watch for ${account.email}:`, watchErr);
          }
        }

        // Full nightly backstop scan - upserts, so it's safe to run even if
        // the webhook is concurrently writing the same messages.
        const { messagesFound, messagesSaved } = await fullSync(gmail, account.id);
        accountReport.messagesFound = messagesFound;
        accountReport.messagesSaved = messagesSaved;
      } catch (err) {
        console.error(`Error processing account ${account.email}:`, err);
        accountReport.error = err.message;
      }
      report.push(accountReport);
    }

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Failed to fetch emails', details: error.message }, { status: 500 });
  }
}
