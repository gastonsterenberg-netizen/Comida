const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.personal.updateMany({ data: { PeriodoFin: new Date('2026-12-31T00:00:00.000Z') } });
  
  const personal = await prisma.personal.findMany();
  console.log('PERSONAL FIJADO:', personal);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
