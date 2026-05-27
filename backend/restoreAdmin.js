const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const password = "admin123";
  const hashedPassword = await bcrypt.hash(password, 10);

  const adminUser = await prisma.usuarios.upsert({
    where: { NombreUsuario: "admin" },
    update: {
      ContrasenaHash: hashedPassword,
      RolId: 1,
      TwoFactorHabilitado: false,
      TwoFactorSecret: null
    },
    create: {
      NombreUsuario: "admin",
      ContrasenaHash: hashedPassword,
      RolId: 1, // ADMIN
    }
  });

  console.log("Admin account restored:", adminUser);
}

main().catch(console.error).finally(() => prisma.$disconnect());
