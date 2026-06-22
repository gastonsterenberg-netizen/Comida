const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const personalIds = [3];
  const solicitadoPorUsuarioId = 1004;

  try {
    await prisma.pedidosComida.deleteMany({
      where: {
        FechaPedido: today,
        PersonalId: { in: personalIds },
        SolicitadoPorUsuarioId: solicitadoPorUsuarioId
      }
    });
    console.log("Deleted");
    
    const newOrders = [
      {
        FechaPedido: today,
        TipoComida: 'Almuerzo',
        TipoDieta: 'Normal',
        PersonalId: 3,
        SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
        Estado: 'Aprobado'
      }
    ];
    
    await prisma.pedidosComida.createMany({ data: newOrders });
    console.log("Created");
  } catch (e) {
    console.error("Error:", e);
  }
}

main().finally(() => prisma.$disconnect());
