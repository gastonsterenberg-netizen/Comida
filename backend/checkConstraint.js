const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const res = await prisma.$queryRaw`SELECT definition FROM sys.check_constraints WHERE name = 'CK__PedidosCo__TipoD__4E88ABD4'`;
  console.log(res);
}
main().finally(() => prisma.$disconnect());
