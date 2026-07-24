const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const all = await prisma.personal.findMany();
  console.log("Total Personal in DB:", all.length);
  if (all.length > 0) console.log(all[0]);
}

check().catch(console.error).finally(() => prisma.$disconnect());
