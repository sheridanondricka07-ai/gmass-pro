import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('q');
  const mine = searchParams.get('mine') === 'true';

  try {
    let whereClause = {};
    if (search) {
      whereClause = {
        OR: [
          { sender: { contains: search, mode: 'insensitive' } },
          { subject: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    // The public dashboard shows every connected seed account (shared team
    // view); the admin panel passes ?mine=true to only manage its own.
    const accountFilter = { status: 'active' };
    if (mine) {
      const currentUser = await getCurrentUser(request);
      if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      accountFilter.userId = currentUser.userId;
    }

    // Without an explicit order, Postgres can return rows in a different
    // order after any UPDATE (e.g. the real-time sync refreshing tokens),
    // which made the account cards visibly reshuffle on the dashboard.
    const accounts = await prisma.seedAccount.findMany({
      where: accountFilter,
      select: { id: true, email: true },
      orderBy: { id: 'asc' }
    });

    // Get latest 50 emails for each account
    const accountsWithEmails = await Promise.all(
      accounts.map(async (account) => {
        const emails = await prisma.emailCache.findMany({
          where: { ...whereClause, accountId: account.id },
          orderBy: { date: 'desc' },
          take: 50,
        });
        
        return {
          ...account,
          emails
        };
      })
    );

    return NextResponse.json({ accounts: accountsWithEmails });
  } catch (error) {
    console.error('Error fetching emails from DB:', error);
    return NextResponse.json({ error: 'Failed to fetch emails' }, { status: 500 });
  }
}
