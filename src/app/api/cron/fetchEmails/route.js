import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request) {
  try {
    // Note: In production, you'd want to secure this endpoint with a secret key
    // e.g. if (request.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) return 401;

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

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // Fetch latest messages using a query to ensure we get both Inbox and Spam
        const res = await gmail.users.messages.list({
          userId: 'me',
          maxResults: 20,
          q: 'label:inbox OR label:spam'
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

            const headers = msgData.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
            const from = headers.find(h => h.name === 'From')?.value || '(Unknown Sender)';
            const dateStr = headers.find(h => h.name === 'Date')?.value;
            const date = dateStr ? new Date(dateStr) : new Date();
            
            const labelIds = msgData.data.labelIds || [];
            let folder = 'Primary Inbox';
            
            if (labelIds.includes('SPAM')) {
              folder = 'Spam';
            } else if (labelIds.includes('CATEGORY_UPDATES') || labelIds.includes('CATEGORY_PROMOTIONS')) {
              folder = 'Updates';
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
