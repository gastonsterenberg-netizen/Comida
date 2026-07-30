const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const row = {
      efector: "Test Hospital",
      servicio: "Test Servicio",
      documento: "12345678",
      agente: "Perez, Juan",
      idpuesto: "123",
      tipofuncion: "test",
      tipoplanta: "test",
      con_vianda: "S",
      esguardia12: "N",
      esguardia24: "N"
    };

    let hospital = await prisma.hospitales.findFirst({ where: { Nombre: String(row.efector).trim() } });
    if (!hospital) {
      hospital = await prisma.hospitales.create({
        data: { Nombre: String(row.efector).trim(), Codigo: String(row.efector).trim().substring(0,5).toUpperCase() }
      });
    }

    let servicio = await prisma.servicios.findFirst({ where: { Nombre: String(row.servicio).trim(), HospitalId: hospital.Id } });
    if (!servicio) {
      servicio = await prisma.servicios.create({
        data: { Nombre: String(row.servicio).trim(), HospitalId: hospital.Id }
      });
    }

    const partes = String(row.agente).split(',');
    const apellido = partes[0] ? partes[0].trim() : '';
    const nombre = partes[1] ? partes[1].trim() : (partes[0] ? partes[0].trim() : '');

    const isTruthy = (v) => v === 'S' || v === true || v === 1 || String(v).toLowerCase() === 'true';

    await prisma.personal.upsert({
      where: { DNI: String(row.documento) },
      update: {
        Nombre: nombre,
        Apellido: apellido,
        HospitalId: hospital.Id,
        ServicioId: servicio.Id,
        IdPuesto: String(row.idpuesto || ''),
        TipoFuncion: String(row.tipofuncion || ''),
        TipoPlanta: String(row.tipoplanta || ''),
        ConVianda: isTruthy(row.con_vianda),
        EsGuardia12: isTruthy(row.esguardia12),
        EsGuardia24: isTruthy(row.esguardia24),
      },
      create: {
        DNI: String(row.documento),
        Nombre: nombre,
        Apellido: apellido,
        HospitalId: hospital.Id,
        ServicioId: servicio.Id,
        IdPersonal: String(row.idagente || ''),
        Horario: '08:00 a 16:00',
        PeriodoInicio: new Date(),
        PeriodoFin: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        IdPuesto: String(row.idpuesto || ''),
        TipoFuncion: String(row.tipofuncion || ''),
        TipoPlanta: String(row.tipoplanta || ''),
        ConVianda: isTruthy(row.con_vianda),
        EsGuardia12: isTruthy(row.esguardia12),
        EsGuardia24: isTruthy(row.esguardia24),
      }
    });

    console.log("Success");
  } catch (err) {
    console.error("ERROR CAUGHT:");
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}
test();
