import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({ error: 'Account ID required' }, { status: 400 });
  }

  try {
    const account = await prisma.seedAccount.findUnique({
      where: { id: parseInt(accountId) }
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

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

    // Fetch latest messages (no filter to ensure we get everything)
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 100
    });

    const messages = res.data.messages || [];
    let savedCount = 0;
    const foundSubjects = [];

    for (const msg of messages) {
      try {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date']
        });

        const headers = msgData.data.payload.headers || [];
        const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
        const from = headers.find(h => h.name === 'From')?.value || '(Unknown Sender)';
        const dateStr = headers.find(h => h.name === 'Date')?.value;
        let date = dateStr ? new Date(dateStr) : new Date();
        if (isNaN(date.getTime())) date = new Date();
        
        foundSubjects.push({ subject, id: msg.id, date: date.toISOString() });

        const labelIds = msgData.data.labelIds || [];
        const isRelevant = labelIds.some(l => ['INBOX', 'SPAM', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_SOCIAL'].includes(l));
        
        if (!isRelevant) continue;

        let folder = 'Primary Inbox';
        if (labelIds.includes('SPAM')) folder = 'Spam';
        else if (labelIds.includes('CATEGORY_UPDATES') || labelIds.includes('CATEGORY_PROMOTIONS') || labelIds.includes('CATEGORY_SOCIAL')) folder = 'Updates';

        // Use upsert to FORCE update the data and timestamp
        await prisma.emailCache.upsert({
          where: { messageId: msg.id },
          update: {
            sender: from,
            subject: subject,
            snippet: msgData.data.snippet || '',
            date: date,
            folder: folder
          },
          create: {
            accountId: account.id,
            messageId: msg.id,
            sender: from,
            subject: subject,
            snippet: msgData.data.snippet || '',
            date: date,
            folder: folder
          }
        });
        savedCount++;
      } catch (e) {
        console.error(`Failed to process message ${msg.id}`, e);
      }
    }

    return NextResponse.json({ success: true, savedCount, foundSubjects: foundSubjects.slice(0, 10) });
  } catch (error) {
    console.error('Individual Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
