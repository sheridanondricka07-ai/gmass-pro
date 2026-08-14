import prisma from '@/lib/prisma';

// Registers (or renews) Gmail push notifications for an account and persists
// the resulting historyId/expiration. Requires GOOGLE_CLOUD_PROJECT_ID and
// GMAIL_PUBSUB_TOPIC to be configured.
export async function startWatch(gmail, accountId) {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const topic = process.env.GMAIL_PUBSUB_TOPIC;
  if (!projectId || !topic) {
    console.warn('GOOGLE_CLOUD_PROJECT_ID/GMAIL_PUBSUB_TOPIC not set - skipping Gmail watch registration');
    return null;
  }

  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: `projects/${projectId}/topics/${topic}`,
    }
  });

  await prisma.seedAccount.update({
    where: { id: accountId },
    data: {
      historyId: String(res.data.historyId),
      watchExpiration: res.data.expiration ? BigInt(res.data.expiration) : null,
    }
  });

  return res.data;
}

export function labelsToFolder(labelIds) {
  if (labelIds.includes('SPAM')) return 'Spam';
  if (labelIds.includes('CATEGORY_UPDATES')) return 'Updates';
  if (labelIds.includes('CATEGORY_PROMOTIONS')) return 'Promotions';
  if (labelIds.includes('CATEGORY_SOCIAL')) return 'Social';
  if (labelIds.includes('CATEGORY_FORUMS')) return 'Forums';
  return 'Primary';
}

// The message's own "Date" header (and sometimes even Gmail's internalDate)
// can be forged/inherited from a replayed message - spam relays commonly
// resend old captured mail with the original headers intact. The topmost
// "Received" header is stamped by Google's own MX server at the moment it
// actually accepted the message, so it can't be forged by the sender.
function getActualReceivedDate(headers) {
  const received = headers.find(h => h.name === 'Received');
  if (!received) return null;
  const lastSemicolon = received.value.lastIndexOf(';');
  if (lastSemicolon === -1) return null;
  const date = new Date(received.value.slice(lastSemicolon + 1).trim());
  return isNaN(date.getTime()) ? null : date;
}

export async function saveMessage(gmail, accountId, messageId) {
  const msgData = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Date', 'Received']
  });

  const labelIds = msgData.data.labelIds || [];
  if (labelIds.some(l => ['DRAFT', 'SENT', 'TRASH', 'CHAT'].includes(l))) {
    return false;
  }

  const headers = msgData.data.payload.headers || [];
  const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
  const from = headers.find(h => h.name === 'From')?.value || '(Unknown Sender)';

  const internalDate = msgData.data.internalDate;
  let date = getActualReceivedDate(headers)
    || (internalDate ? new Date(parseInt(internalDate)) : new Date());
  if (isNaN(date.getTime())) date = new Date();

  const inInbox = labelIds.includes('INBOX');

  await prisma.emailCache.upsert({
    where: { messageId },
    update: {
      sender: from,
      subject: subject,
      snippet: msgData.data.snippet || '',
      date: date,
      folder: labelsToFolder(labelIds),
      inInbox
    },
    create: {
      accountId,
      messageId,
      sender: from,
      subject: subject,
      snippet: msgData.data.snippet || '',
      date: date,
      folder: labelsToFolder(labelIds),
      inInbox
    }
  });

  return true;
}

// Full mailbox scan, used for the initial connect and as a nightly backstop.
export async function fullSync(gmail, accountId) {
  const res = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 100,
    includeSpamTrash: true
  });

  const messages = res.data.messages || [];
  const messageIds = messages.map(m => m.id);
  const existing = await prisma.emailCache.findMany({
    where: { messageId: { in: messageIds } },
    select: { messageId: true }
  });
  const existingIds = new Set(existing.map(e => e.messageId));

  let savedCount = 0;
  for (const msg of messages) {
    if (existingIds.has(msg.id)) continue;
    try {
      if (await saveMessage(gmail, accountId, msg.id)) savedCount++;
    } catch (err) {
      console.error(`Failed to save message ${msg.id}:`, err);
    }
  }
  return { messagesFound: messages.length, messagesSaved: savedCount };
}

// Incremental sync using Gmail's history API, driven by push notifications.
// Returns false if the stored historyId is too old/invalid and a full resync is needed.
export async function historySync(gmail, accountId, startHistoryId) {
  let pageToken;
  let savedCount = 0;
  let latestHistoryId = startHistoryId;

  do {
    let res;
    try {
      res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        pageToken
      });
    } catch (err) {
      const status = err.code || err.response?.status;
      if (Number(status) === 404) return { ok: false };
      throw err;
    }

    if (res.data.historyId) latestHistoryId = res.data.historyId;

    const historyRecords = res.data.history || [];
    const seen = new Set();
    for (const record of historyRecords) {
      for (const added of record.messagesAdded || []) {
        const msgId = added.message?.id;
        if (!msgId || seen.has(msgId)) continue;
        seen.add(msgId);
        try {
          if (await saveMessage(gmail, accountId, msgId)) savedCount++;
        } catch (err) {
          console.error(`Failed to save message ${msgId}:`, err);
        }
      }
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return { ok: true, savedCount, latestHistoryId };
}
