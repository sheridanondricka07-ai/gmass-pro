import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { fullSync, startWatch } from '@/lib/gmailSync';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json({ error: 'No code provided' }, { status: 400 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user email
    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2',
    });
    
    const { data } = await oauth2.userinfo.get();
    const email = data.email;

    if (!email) {
      throw new Error("Could not get email from Google");
    }

    // Save to DB
    const account = await prisma.seedAccount.upsert({
      where: { email },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined, // Only update if new refresh token provided
        expiryDate: tokens.expiry_date,
        status: 'active'
      },
      create: {
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
      }
    });

    // Pull existing mail immediately and start real-time push notifications
    // so new mail shows up within seconds instead of waiting for the next poll.
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      await fullSync(gmail, account.id);
      await startWatch(gmail, account.id);
    } catch (syncErr) {
      console.error(`Initial sync/watch failed for ${email}:`, syncErr);
    }

    return NextResponse.redirect(new URL('/admin', request.url));
  } catch (error) {
    console.error('OAuth Callback Error:', error);
    return NextResponse.json({ error: 'Failed to authenticate', details: error.message }, { status: 500 });
  }
}
