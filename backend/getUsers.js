const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.usuarios.findMany();
  console.log(users);
}

main().finally(() => prisma.$disconnect());
