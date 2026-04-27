const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emails = await prisma.emailCache.findMany({
    where: { accountId: 1 },
    orderBy: { date: 'desc' },
    take: 20
  });
  console.log(JSON.stringify(emails, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
