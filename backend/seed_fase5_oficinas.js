const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedFase5() {
  console.log('--- SEMILLADO DE FASE 5: OFICINAS PÚBLICAS Y CATERING VERSÁTIL ---');

  // 1. Verificar Tablas nuevas
  const tables = await prisma.$queryRaw`
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME IN ('MenuOficinaOpciones', 'MenuOficinaGuarniciones', 'ConsolidadosProveedor')
  `;
  console.log('Tablas detectadas:', tables.map(t => t.TABLE_NAME));

  // 2. Crear o Actualizar Oficina de Prueba
  let oficina = await prisma.hospitales.findFirst({
    where: { Codigo: 'OFIC-CENTRAL' }
  });

  if (!oficina) {
    oficina = await prisma.hospitales.create({
      data: {
        Nombre: 'Casa Central - SIPROSA',
        Codigo: 'OFIC-CENTRAL',
        LimiteAlmuerzo: '10:30',
        LimiteCena: '18:00',
        TipoEntidad: 'OFICINA',
        ProveedorNombre: 'Catering Sabores Gourmet',
        ProveedorTelefono: '+5493815551234'
      }
    });
    console.log(`Oficina creada: #${oficina.Id} - ${oficina.Nombre}`);
  } else {
    oficina = await prisma.hospitales.update({
      where: { Id: oficina.Id },
      data: {
        Nombre: 'Casa Central - SIPROSA',
        TipoEntidad: 'OFICINA',
        ProveedorNombre: 'Catering Sabores Gourmet',
        ProveedorTelefono: '+5493815551234'
      }
    });
    console.log(`Oficina existente actualizada: #${oficina.Id} - ${oficina.Nombre}`);
  }

  // 3. Crear Sectores/Pisos (Servicios)
  let sectorSistemas = await prisma.servicios.findFirst({
    where: { HospitalId: oficina.Id, Nombre: 'Piso 3 - Informática y Sistemas' }
  });
  if (!sectorSistemas) {
    sectorSistemas = await prisma.servicios.create({
      data: {
        HospitalId: oficina.Id,
        Nombre: 'Piso 3 - Informática y Sistemas'
      }
    });
  }

  let sectorAdmin = await prisma.servicios.findFirst({
    where: { HospitalId: oficina.Id, Nombre: 'Piso 2 - Administración General' }
  });
  if (!sectorAdmin) {
    sectorAdmin = await prisma.servicios.create({
      data: {
        HospitalId: oficina.Id,
        Nombre: 'Piso 2 - Administración General'
      }
    });
  }
  console.log(`Sectores configurados: [${sectorSistemas.Nombre}], [${sectorAdmin.Nombre}]`);

  // 4. Crear Usuario Encargado de Oficina (Rol 4)
  const hashedPw = await bcrypt.hash('Admin1234!', 10);
  let encargadoUser = await prisma.usuarios.findFirst({
    where: { NombreUsuario: 'encargado.central' }
  });
  if (!encargadoUser) {
    encargadoUser = await prisma.usuarios.create({
      data: {
        NombreUsuario: 'encargado.central',
        ContrasenaHash: hashedPw,
        RolId: 4, // Encargado_Oficina
        HospitalId: oficina.Id,
        Activo: true
      }
    });
    console.log(`Usuario Encargado creado: ${encargadoUser.NombreUsuario} (Pass: Admin1234!)`);
  } else {
    console.log(`Usuario Encargado ya existe: ${encargadoUser.NombreUsuario}`);
  }

  // 5. Crear Empleados de Oficina con PIN de 4 dígitos
  const empleadosMock = [
    { dni: '40111222', nombre: 'Juan Pérez (Desarrollo)', pin: '1234', servicioId: sectorSistemas.Id },
    { dni: '40333444', nombre: 'María González (Soporte)', pin: '4321', servicioId: sectorSistemas.Id },
    { dni: '40555666', nombre: 'Carlos Benítez (Contabilidad)', pin: '1111', servicioId: sectorAdmin.Id }
  ];

  for (const emp of empleadosMock) {
    let padron = await prisma.padronHabilitados.findUnique({ where: { DNI: emp.dni } });
    if (!padron) {
      padron = await prisma.padronHabilitados.create({
        data: {
          DNI: emp.dni,
          NombreCompleto: emp.nombre,
          HospitalId: oficina.Id,
          ServicioId: emp.servicioId,
          RacionesMaximasDia: 1,
          EsGuardia24h: false,
          PinAcceso: emp.pin,
          OrigenAlta: 'OFICINA_PORTAL'
        }
      });
    } else {
      padron = await prisma.padronHabilitados.update({
        where: { Id: padron.Id },
        data: { PinAcceso: emp.pin, HospitalId: oficina.Id, ServicioId: emp.servicioId }
      });
    }

    let personal = await prisma.personal.findFirst({
      where: { HospitalId: oficina.Id, DNI: emp.dni }
    });
    if (!personal) {
      await prisma.personal.create({
        data: {
          DNI: emp.dni,
          NombreCompleto: emp.nombre,
          HospitalId: oficina.Id,
          ServicioId: emp.servicioId,
          Horario: '08:00 - 16:00',
          PeriodoInicio: new Date('2026-01-01'),
          PeriodoFin: new Date('2026-12-31'),
          Activo: true,
          ConVianda: true,
          AgenteId: padron.Id
        }
      });
    }
  }
  console.log(`Empleados de prueba cargados con PIN (DNI 40111222 PIN 1234, DNI 40333444 PIN 4321, DNI 40555666 PIN 1111)`);

  // 6. Configurar Menú del Día de Mañana (Platos Fijos y Menú para Armar)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  const targetDate = new Date(`${tomorrowStr}T00:00:00.000Z`);

  // Limpiar menú anterior de mañana si lo hubiera
  await prisma.$executeRawUnsafe(
    `DELETE FROM MenuOficinaOpciones WHERE HospitalId = ${oficina.Id} AND Fecha = '${tomorrowStr}'`
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM MenuOficinaGuarniciones WHERE HospitalId = ${oficina.Id} AND Fecha = '${tomorrowStr}'`
  );

  // Platos Fijos Diarios (Sin guarnición)
  await prisma.$executeRawUnsafe(`
    INSERT INTO MenuOficinaOpciones (HospitalId, Fecha, TipoPlato, NumeroOpcion, NombrePlato, PermiteGuarnicion, Descripcion, CreadoPorUsuarioId)
    VALUES 
    (${oficina.Id}, '${tomorrowStr}', 'PLATO_DEL_DIA', 1, 'Tarta Pascualina con Ensalada Rusa', 0, 'Masa casera, espinaca fresca, huevo y queso parmesano.', ${encargadoUser.Id}),
    (${oficina.Id}, '${tomorrowStr}', 'PLATO_DEL_DIA', 2, 'Pastel de Papas Tradicional', 0, 'Carne picada seleccionada, especias y suave puré gratinado.', ${encargadoUser.Id})
  `);

  // Platos Principales (Permiten elegir guarnición)
  await prisma.$executeRawUnsafe(`
    INSERT INTO MenuOficinaOpciones (HospitalId, Fecha, TipoPlato, NumeroOpcion, NombrePlato, PermiteGuarnicion, Descripcion, CreadoPorUsuarioId)
    VALUES 
    (${oficina.Id}, '${tomorrowStr}', 'PRINCIPAL', 3, 'Suprema de Pollo Grillada al Limón', 1, 'Pechuga a la plancha marinada con hierbas y limón.', ${encargadoUser.Id}),
    (${oficina.Id}, '${tomorrowStr}', 'PRINCIPAL', 4, 'Milanesa de Ternera al Horno', 1, 'Corte tierno empanado con perejil y ajo.', ${encargadoUser.Id})
  `);

  // Guarniciones disponibles
  await prisma.$executeRawUnsafe(`
    INSERT INTO MenuOficinaGuarniciones (HospitalId, Fecha, NombreGuarnicion, CreadoPorUsuarioId)
    VALUES 
    (${oficina.Id}, '${tomorrowStr}', 'Puré de Papas Crema', ${encargadoUser.Id}),
    (${oficina.Id}, '${tomorrowStr}', 'Papas Fritas Bastón', ${encargadoUser.Id}),
    (${oficina.Id}, '${tomorrowStr}', 'Ensalada Mixta (Lechuga, Tomate y Zanahoria)', ${encargadoUser.Id}),
    (${oficina.Id}, '${tomorrowStr}', 'Arroz Primavera Salteado', ${encargadoUser.Id})
  `);

  console.log(`Menú para fecha ${tomorrowStr} configurado exitosamente:`);
  console.log('  - 2 Platos del Día (Tarta Pascualina, Pastel de Papas)');
  console.log('  - 2 Platos Principales (Suprema al Limón, Milanesa de Ternera)');
  console.log('  - 4 Guarniciones a elección (Puré, Papas Fritas, Ensalada Mixta, Arroz Primavera)');

  console.log('--- SEMILLADO COMPLETADO CON ÉXITO ---');
}

seedFase5()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
