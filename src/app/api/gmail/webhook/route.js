import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { historySync, fullSync } from '@/lib/gmailSync';

// Gmail Pub/Sub push notifications land here. Configure the push subscription's
// endpoint as: https://<domain>/api/gmail/webhook?token=<PUBSUB_VERIFICATION_TOKEN>
export async function POST(request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get('token') !== process.env.PUBSUB_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const data = body?.message?.data;
  if (!data) {
    // Pub/Sub sometimes sends validation pings with no payload; ack them.
    return NextResponse.json({ ok: true });
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64').toString('utf-8'));
  } catch (err) {
    console.error('Failed to decode Pub/Sub message:', err);
    return NextResponse.json({ ok: true }); // malformed payload, nothing to retry
  }

  const { emailAddress } = payload;
  if (!emailAddress) {
    return NextResponse.json({ ok: true });
  }

  const account = await prisma.seedAccount.findUnique({ where: { email: emailAddress } });
  if (!account || account.status !== 'active') {
    // Not one of our seed accounts, or disconnected - ack and move on.
    return NextResponse.json({ ok: true });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: account.refreshToken });
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);

    await prisma.seedAccount.update({
      where: { id: account.id },
      data: { accessToken: credentials.access_token, expiryDate: credentials.expiry_date }
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    if (!account.historyId) {
      // No baseline yet - fall back to a full scan and establish one.
      await fullSync(gmail, account.id);
      const profile = await gmail.users.getProfile({ userId: 'me' });
      await prisma.seedAccount.update({
        where: { id: account.id },
        data: { historyId: String(profile.data.historyId) }
      });
      return NextResponse.json({ ok: true, mode: 'full-bootstrap' });
    }

    const result = await historySync(gmail, account.id, account.historyId);

    if (!result.ok) {
      // Stored historyId is stale (>7 days / garbage-collected) - resync fully.
      await fullSync(gmail, account.id);
      const profile = await gmail.users.getProfile({ userId: 'me' });
      await prisma.seedAccount.update({
        where: { id: account.id },
        data: { historyId: String(profile.data.historyId) }
      });
      return NextResponse.json({ ok: true, mode: 'full-fallback' });
    }

    await prisma.seedAccount.update({
      where: { id: account.id },
      data: { historyId: String(result.latestHistoryId) }
    });

    return NextResponse.json({ ok: true, saved: result.savedCount });
  } catch (error) {
    console.error(`Webhook processing failed for ${emailAddress}:`, error);
    // Let Pub/Sub retry transient failures.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
