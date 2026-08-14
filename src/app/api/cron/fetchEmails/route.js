import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import prisma from '@/lib/prisma';

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
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
          access_token: account.accessToken,
          refresh_token: account.refreshToken,
        });

        oauth2Client.on('tokens', (tokens) => {
          prisma.seedAccount.update({
            where: { id: account.id },
            data: {
              accessToken: tokens.access_token || undefined,
              refreshToken: tokens.refresh_token || undefined,
              expiryDate: tokens.expiry_date || undefined,
            }
          }).catch(err => console.error(`Failed to persist refreshed tokens for ${account.email}:`, err));
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Fetch latest messages (no filter to ensure we get everything)
        const res = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 100,
          includeSpamTrash: true 
        });

        const messages = res.data.messages || [];
        accountReport.messagesFound = messages.length;
        console.log(`Found ${messages.length} potential messages for ${account.email}`);

        for (const msg of messages) {
          console.log(`Processing message ${msg.id}...`);
          // Check if message is already in cache
          const existing = await prisma.emailCache.findUnique({
            where: { messageId: msg.id }
          });

          if (!existing) {
            // Fetch full message details
            const msgData = await gmail.users.messages.get({
              userId: 'me',
              id: msg.id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date']
            });

            const headers = msgData.data.payload.headers || [];
            const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const from = headers.find(h => h.name === 'From')?.value || '(Unknown Sender)';
            
            // Use Gmail's internalDate (arrival time) for perfect sorting
            const internalDate = msgData.data.internalDate;
            let date = internalDate ? new Date(parseInt(internalDate)) : new Date();
            if (isNaN(date.getTime())) date = new Date();
            
            const labelIds = msgData.data.labelIds || [];

            // Skip outgoing or deleted messages only
            if (labelIds.some(l => ['DRAFT', 'SENT', 'TRASH', 'CHAT'].includes(l))) continue;

            let folder = 'Primary';
            if (labelIds.includes('SPAM')) {
              folder = 'Spam';
            } else if (labelIds.includes('CATEGORY_UPDATES')) {
              folder = 'Updates';
            } else if (labelIds.includes('CATEGORY_PROMOTIONS')) {
              folder = 'Promotions';
            } else if (labelIds.includes('CATEGORY_SOCIAL')) {
              folder = 'Social';
            } else if (labelIds.includes('CATEGORY_FORUMS')) {
              folder = 'Forums';
            }

            await prisma.emailCache.create({
              data: {
                accountId: account.id,
                messageId: msg.id,
                sender: from,
                subject: subject,
                snippet: msgData.data.snippet || '',
                date: date,
                folder: folder
              }
            });
            accountReport.messagesSaved++;
            console.log(`Saved email ${msg.id} to database.`);
          } else {
            console.log(`Email ${msg.id} already exists in database.`);
          }
        }
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
