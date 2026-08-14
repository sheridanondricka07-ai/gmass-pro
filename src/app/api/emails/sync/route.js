import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    // 1. BULLETPROOF LOGIC: Fetch the absolute newest 100 emails across ALL folders
    // By omitting 'labelIds' and 'q', Google guarantees this returns the newest 100 emails 
    // received anywhere in the account (Inbox, Spam, Updates, Forums, etc.)
    // This fetches the latest 100 messages including those in Spam and Trash
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 100,
      includeSpamTrash: true 
    });

    const uniqueMessages = res.data.messages || [];
    
    // HUGE OPTIMIZATION: Check which messages we already have BEFORE making 150 API calls
    const messageIds = uniqueMessages.map(m => m.id);
    const existingEmails = await prisma.emailCache.findMany({
      where: { messageId: { in: messageIds } },
      select: { messageId: true }
    });
    const existingMessageIds = new Set(existingEmails.map(e => e.messageId));
    
    const messagesToFetch = uniqueMessages.filter(m => !existingMessageIds.has(m.id));

    let savedCount = 0;
    const foundSubjects = [];

    // Process existing messages for the debug report (so we know they were found)
    for (const msg of uniqueMessages) {
      if (existingMessageIds.has(msg.id)) {
        foundSubjects.push({ subject: '(Already in DB)', from: '(Known)', id: msg.id });
      }
    }

    // Now only fetch the NEW messages from the Gmail API
    for (const msg of messagesToFetch) {
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
        
        const internalDate = msgData.data.internalDate;
        let date = internalDate ? new Date(parseInt(internalDate)) : new Date();
        if (isNaN(date.getTime())) date = new Date();
        
        const labelIds = msgData.data.labelIds || [];
        
        // Skip outgoing or deleted messages
        if (labelIds.includes('DRAFT') || labelIds.includes('SENT') || labelIds.includes('TRASH') || labelIds.includes('CHAT')) {
          continue;
        }

        foundSubjects.push({ subject, from, labels: labelIds, date: date.toISOString(), id: msg.id });

        // Force 'Updates' folder for these specific senders to ensure they match Gmail UI
        let folder = 'Primary';
        if (labelIds.includes('SPAM')) folder = 'Spam';
        else if (labelIds.includes('CATEGORY_UPDATES')) folder = 'Updates';
        else if (labelIds.includes('CATEGORY_PROMOTIONS')) folder = 'Promotions';
        else if (labelIds.includes('CATEGORY_SOCIAL')) folder = 'Social';
        else if (labelIds.includes('CATEGORY_FORUMS')) folder = 'Forums';

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

    return NextResponse.json({ 
      success: true, 
      syncingAccount: account.email,
      savedCount, 
      foundSubjects: foundSubjects.slice(0, 50) 
    });
  } catch (error) {
    console.error('Individual Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
