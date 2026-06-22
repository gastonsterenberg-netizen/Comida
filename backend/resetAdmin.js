const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('123', 10);
  await prisma.usuarios.update({
    where: { NombreUsuario: 'admin' },
    data: {
      ContrasenaHash: hash,
      TwoFactorHabilitado: false
    }
  });
  console.log('Admin password updated to 123 and 2FA disabled');
}
main().finally(() => prisma.$disconnect());
