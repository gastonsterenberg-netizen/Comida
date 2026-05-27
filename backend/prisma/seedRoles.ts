import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding roles...');
  
  const roles = [
    { Id: 1, Nombre: 'ADMIN' },
    { Id: 2, Nombre: 'GERENTE' },
    { Id: 3, Nombre: 'JEFE_SERVICIO' },
  ];

  for (const role of roles) {
    await prisma.roles.upsert({
      where: { Id: role.Id },
      update: { Nombre: role.Nombre },
      create: { Id: role.Id, Nombre: role.Nombre },
    });
  }

  console.log('Roles seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
