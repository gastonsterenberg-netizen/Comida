const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.usuarios.findMany();
  console.log('USERS:', users);
  const services = await prisma.servicios.findMany();
  console.log('SERVICES:', services);
}
main().finally(() => prisma.$disconnect());
