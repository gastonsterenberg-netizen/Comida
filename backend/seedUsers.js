const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const password = "password123";
  const hashedPassword = await bcrypt.hash(password, 10);

  // Crear Hospital
  const hospital = await prisma.hospitales.create({
    data: { Nombre: "Hospital Central", Codigo: "HOSP1" }
  });

  // Crear Gerente
  const gerente = await prisma.usuarios.create({
    data: {
      NombreUsuario: "gerente",
      ContrasenaHash: hashedPassword,
      RolId: 2, // GERENTE
      HospitalId: hospital.Id
    }
  });

  console.log("Credenciales creadas:");
  console.log("Usuario: gerente");
  console.log("Contraseña: password123");
}

main().finally(() => prisma.$disconnect());
