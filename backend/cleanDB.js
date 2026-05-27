const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  console.log("Limpiando PedidosComida...");
  await prisma.pedidosComida.deleteMany();

  console.log("Limpiando Personal...");
  await prisma.personal.deleteMany();

  console.log("Limpiando Usuarios (excepto admin)...");
  await prisma.usuarios.deleteMany({
    where: { NombreUsuario: { not: 'admin' } }
  });

  console.log("Limpiando Servicios...");
  await prisma.servicios.deleteMany();

  console.log("Limpiando Hospitales...");
  await prisma.hospitales.deleteMany();

  console.log("¡Base de datos limpiada con éxito! Solo queda el admin y los roles.");
}

clean()
  .catch(e => {
    console.error("Error limpiando:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
