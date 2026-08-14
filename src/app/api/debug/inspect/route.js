import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const emails = await prisma.emailCache.findMany({
      orderBy: { date: 'desc' },
      take: 100,
      include: {
        account: true
      }
    });

    return NextResponse.json({
      totalInCache: await prisma.emailCache.count(),
      latestItems: emails.map(e => ({
        subject: e.subject,
        sender: e.sender,
        date: e.date,
        account: e.account.email,
        folder: e.folder
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
