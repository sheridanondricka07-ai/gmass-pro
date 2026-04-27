import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('q');

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

    // Get all accounts
    const accounts = await prisma.seedAccount.findMany({
      where: { status: 'active' },
      select: { id: true, email: true }
    });

    // Get latest 10 emails for each account
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
