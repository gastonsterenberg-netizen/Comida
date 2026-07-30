const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
  try {
    console.log("Migrating Personal...");
    const personal = await prisma.personal.findMany();
    for (const p of personal) {
      const nombreCompleto = p.Apellido && p.Nombre ? `${p.Apellido} ${p.Nombre}` : (p.Apellido || p.Nombre || '');
      await prisma.personal.update({
        where: { Id: p.Id },
        data: { NombreCompleto: nombreCompleto }
      });
    }
    console.log(`Migrated ${personal.length} Personal records.`);

    console.log("Migrating PedidosComida...");
    const pedidos = await prisma.pedidosComida.findMany();
    for (const p of pedidos) {
      if (p.EmergenciaNombre || p.EmergenciaApellido) {
        const nombreCompleto = p.EmergenciaApellido && p.EmergenciaNombre ? `${p.EmergenciaApellido} ${p.EmergenciaNombre}` : (p.EmergenciaApellido || p.EmergenciaNombre || '');
        await prisma.pedidosComida.update({
          where: { Id: p.Id },
          data: { EmergenciaNombreCompleto: nombreCompleto }
        });
      }
    }
    console.log(`Migrated ${pedidos.length} PedidosComida records.`);

    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    await prisma.$disconnect();
  }
}
migrate();
