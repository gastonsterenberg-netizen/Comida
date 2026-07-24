const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    console.log("Querying with today:", today);
    const staff = await prisma.personal.findMany({
      where: {
        ServicioId: 1,
        Activo: true,
        PeriodoInicio: { lte: today },
        PeriodoFin: { gte: today }
      }
    });
    console.log("Found:", staff.length);
}
check().catch(console.error).finally(() => prisma.$disconnect());
