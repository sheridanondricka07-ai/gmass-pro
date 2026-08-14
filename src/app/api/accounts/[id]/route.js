import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export async function DELETE(request, { params }) {
  const id = parseInt(params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid account id' }, { status: 400 });
  }

  const currentUser = await getCurrentUser(request);
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const account = await prisma.seedAccount.findUnique({ where: { id } });
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  if (account.userId !== currentUser.userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Best-effort: revoke the OAuth grant at Google so the stored tokens can't
  // be used again, even though we're about to delete them anyway.
  if (account.refreshToken) {
    try {
      await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `token=${encodeURIComponent(account.refreshToken)}`
      });
    } catch (err) {
      console.error(`Failed to revoke Google token for ${account.email}:`, err);
    }
  }

  await prisma.emailCache.deleteMany({ where: { accountId: id } });
  await prisma.seedAccount.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
