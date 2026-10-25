const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const padronCount = await prisma.padronHabilitados.count();
  const personalCount = await prisma.personal.count();
  const pedidosCount = await prisma.pedidosComida.count();
  const pedidosConAgente = await prisma.pedidosComida.count({ where: { AgenteId: { not: null } } });
  const personalConAgente = await prisma.personal.count({ where: { AgenteId: { not: null } } });
  console.log({
    padronCount,
    personalCount,
    pedidosCount,
    pedidosConAgente,
    personalConAgente,
    coberturaPedidos: (pedidosConAgente / pedidosCount * 100).toFixed(2) + '%',
    coberturaPersonal: (personalConAgente / personalCount * 100).toFixed(2) + '%'
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
