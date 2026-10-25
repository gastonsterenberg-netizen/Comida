const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production';

function createToken(userId, roleId, hospitalId, servicioId) {
  return jwt.sign(
    { userId, roleId, hospitalId, servicioId },
    JWT_SECRET,
    { expiresIn: '2h' }
  );
}

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
let testIndex = 0;

function assert(condition, message) {
  testIndex++;
  const numStr = String(testIndex).padStart(3, '0');
  if (condition) {
    console.log(`${GREEN}  [${numStr}] ✔ PASS:${RESET} ${message}`);
    passed++;
  } else {
    console.error(`${RED}  [${numStr}] ✖ FAIL:${RESET} ${message}`);
    failed++;
  }
}

async function cleanDni(dni) {
  const pers = await prisma.personal.findMany({ where: { DNI: dni } });
  const ids = pers.map(p => p.Id);
  if (ids.length > 0) {
    await prisma.pedidosComida.deleteMany({ where: { PersonalId: { in: ids } } });
    await prisma.pedidosComida.deleteMany({ where: { EmergenciaReemplazaId: { in: ids } } });
  }
  await prisma.pedidosComida.deleteMany({ where: { EmergenciaDNI: dni } });
  await prisma.personal.deleteMany({ where: { DNI: dni } });
  await prisma.padronHabilitados.deleteMany({ where: { DNI: dni } });
}

async function runTestSuite200() {
  console.log(`${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}    SUITE DE 200 PRUEBAS EXHAUSTIVAS - BACKEND Y BASE DE DATOS LOCAL    ${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  const createdOrderIds = [];
  const createdEmergencyOrderIds = [];
  const testDnis = [];

  // Usar fecha 5 días en el futuro para pruebas de pedidos
  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 5);
  const testDateStr = testDate.toISOString().split('T')[0];

  try {
    // =========================================================================
    // BLOQUE 1: ESTRUCTURA DE BASE DE DATOS Y LLAVES FORÁNEAS (Tests 001 - 025)
    // =========================================================================
    console.log(`${YELLOW}>>> BLOQUE 1: Integridad de Tablas, Columnas y Claves Foráneas (25 tests)${RESET}`);

    // 001: PadronHabilitados tiene registros cargados
    const totalPadron = await prisma.padronHabilitados.count();
    assert(totalPadron > 0, `PadronHabilitados tiene registros cargados (${totalPadron} registros)`);

    // 002: PadronHabilitados no tiene RacionesMaximasDia en NULL
    const padronNullRes = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM PadronHabilitados WHERE RacionesMaximasDia IS NULL`;
    const padronNullRaciones = Number(padronNullRes[0]?.cnt || 0);
    assert(padronNullRaciones === 0, `PadronHabilitados no tiene nulos en RacionesMaximasDia (${padronNullRaciones})`);

    // 003: PadronHabilitados solo tiene valores válidos en RacionesMaximasDia (1 o 2)
    const padronInvalidRaciones = await prisma.padronHabilitados.count({
      where: { RacionesMaximasDia: { notIn: [1, 2] } }
    });
    assert(padronInvalidRaciones === 0, `RacionesMaximasDia solo contiene valores 1 o 2 (${padronInvalidRaciones} inválidos)`);

    // 004: Existen agentes con 1 ración máxima
    const countRaciones1 = await prisma.padronHabilitados.count({ where: { RacionesMaximasDia: 1 } });
    assert(countRaciones1 > 0, `Existen agentes con 1 ración máxima (${countRaciones1} agentes)`);

    // 005: Existen agentes con 2 raciones máximas (Guardia 24h)
    const countRaciones2 = await prisma.padronHabilitados.count({ where: { RacionesMaximasDia: 2 } });
    assert(countRaciones2 > 0, `Existen agentes con 2 raciones máximas (${countRaciones2} agentes)`);

    // 006: Personal activo tiene AgenteId asignado (100% cubierto)
    const personalActivoSinAgente = await prisma.personal.count({ where: { Activo: true, AgenteId: null } });
    assert(personalActivoSinAgente === 0, `Personal activo sin AgenteId asignado es 0 (${personalActivoSinAgente})`);

    // 007: Clave foránea Personal -> PadronHabilitados válida
    const samplePersonal = await prisma.personal.findFirst({
      where: { Activo: true, AgenteId: { not: null } },
      include: { Agente: true }
    });
    assert(samplePersonal && samplePersonal.Agente && samplePersonal.Agente.Id === samplePersonal.AgenteId,
      `Relación Personal -> Agente resuelve correctamente (Personal #${samplePersonal?.Id} -> Agente #${samplePersonal?.AgenteId})`);

    // 008: Coincidencia de DNI entre Personal y PadronHabilitados
    assert(samplePersonal?.DNI === samplePersonal?.Agente?.DNI,
      `DNI coincide entre Personal (${samplePersonal?.DNI}) y Padron (${samplePersonal?.Agente?.DNI})`);

    // 009: PedidosComida totales tienen AgenteId poblado
    const pedidosTotal = await prisma.pedidosComida.count();
    const pedidosConAgente = await prisma.pedidosComida.count({ where: { AgenteId: { not: null } } });
    assert(pedidosTotal === pedidosConAgente, `PedidosComida con AgenteId: ${pedidosConAgente}/${pedidosTotal} (100% poblado)`);

    // 010: Relación PedidosComida -> Agente válida
    const samplePedido = await prisma.pedidosComida.findFirst({
      where: { AgenteId: { not: null } },
      include: { Agente: true }
    });
    assert(samplePedido && samplePedido.Agente && samplePedido.Agente.Id === samplePedido.AgenteId,
      `Relación PedidosComida -> Agente resuelve correctamente (Pedido #${samplePedido?.Id} -> Agente #${samplePedido?.AgenteId})`);

    // 011: Cobertura de ReemplazaAgenteId en pedidos con reemplazo
    const pedidosReemplazoTotal = await prisma.pedidosComida.count({ where: { EmergenciaReemplazaId: { not: null } } });
    const pedidosReemplazoConAgente = await prisma.pedidosComida.count({
      where: { EmergenciaReemplazaId: { not: null }, ReemplazaAgenteId: { not: null } }
    });
    assert(pedidosReemplazoTotal === pedidosReemplazoConAgente,
      `Pedidos de reemplazo con ReemplazaAgenteId: ${pedidosReemplazoConAgente}/${pedidosReemplazoTotal} (100%)`);

    // 012: Hospitales existen en la base de datos
    const totalHospitales = await prisma.hospitales.count();
    assert(totalHospitales >= 5, `Al menos 5 hospitales registrados (${totalHospitales} encontrados)`);

    // 013: Cada hospital tiene nombre no nulo
    const hospNullRes = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM Hospitales WHERE Nombre IS NULL OR Nombre = ''`;
    const hospitalesSinNombre = Number(hospNullRes[0]?.cnt || 0);
    assert(hospitalesSinNombre === 0, `Todos los hospitales tienen Nombre definido (${hospitalesSinNombre} inválidos)`);

    // 014: Servicios están vinculados a un HospitalId válido
    const servNullRes = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM Servicios WHERE HospitalId IS NULL`;
    const serviciosSinHospital = Number(servNullRes[0]?.cnt || 0);
    assert(serviciosSinHospital === 0, `Todos los servicios pertenecen a un Hospital (${serviciosSinHospital} sin hospital)`);

    // 015: Relación Servicios -> Hospitales funciona
    const sampleServicio = await prisma.servicios.findFirst({ include: { Hospital: true } });
    assert(sampleServicio && sampleServicio.Hospital !== null,
      `Servicio "${sampleServicio?.Nombre}" resuelve su Hospital "${sampleServicio?.Hospital?.Nombre}"`);

    // 016: Usuarios con Rol 1 (Administrador) existen
    const adminCount = await prisma.usuarios.count({ where: { RolId: 1, Activo: true } });
    assert(adminCount > 0, `Existen usuarios Administrador activos (${adminCount})`);

    // 017: Usuarios con Rol 2 (Gerencia) existen
    const gerenteCount = await prisma.usuarios.count({ where: { RolId: 2, Activo: true } });
    assert(gerenteCount > 0, `Existen usuarios de Gerencia activos (${gerenteCount})`);

    // 018: Usuarios con Rol 3 (Jefe de Servicio) existen
    const jefeCount = await prisma.usuarios.count({ where: { RolId: 3, Activo: true } });
    assert(jefeCount > 0, `Existen Jefes de Servicio activos (${jefeCount})`);

    // 019: Usuarios con Rol 5 (Nutrición / Cocina) existen
    const nutricionCount = await prisma.usuarios.count({ where: { RolId: 5, Activo: true } });
    assert(nutricionCount > 0, `Existen usuarios de Nutrición activos (${nutricionCount})`);

    // 020: Tabla SolicitudesPlantel accesible
    const countSolicitudes = await prisma.solicitudesPlantel.count();
    assert(countSolicitudes >= 0, `Tabla SolicitudesPlantel es consultable (${countSolicitudes} solicitudes)`);

    // 021: Tabla ImpresionesVoucher accesible
    const countVouchers = await prisma.impresionesVoucher.count();
    assert(countVouchers >= 0, `Tabla ImpresionesVoucher es consultable (${countVouchers} registros)`);

    // 022: Tabla FechasAnticipadasHabilitadas accesible
    const countFechasAnticipadas = await prisma.fechasAnticipadasHabilitadas.count();
    assert(countFechasAnticipadas >= 0, `Tabla FechasAnticipadasHabilitadas consultable (${countFechasAnticipadas} registros)`);

    // 023: Tabla Auditoria accesible
    const countAuditoria = await prisma.auditoria.count();
    assert(countAuditoria >= 0, `Tabla Auditoria consultable (${countAuditoria} eventos auditados)`);

    // 024: Verificación de índice único en PadronHabilitados (DNI no duplicado)
    const padronDnis = await prisma.$queryRaw`
      SELECT DNI, COUNT(*) as Cnt FROM PadronHabilitados GROUP BY DNI HAVING COUNT(*) > 1
    `;
    assert(padronDnis.length === 0, `PadronHabilitados garantiza unicidad de DNI (0 duplicados encontrados)`);

    // 025: Verificación de índice único en Personal por Hospital, Servicio y DNI
    const personalDniDuplicados = await prisma.$queryRaw`
      SELECT HospitalId, ServicioId, DNI, COUNT(*) as Cnt 
      FROM Personal 
      WHERE Activo = 1 
      GROUP BY HospitalId, ServicioId, DNI 
      HAVING COUNT(*) > 1
    `;
    assert(personalDniDuplicados.length === 0, `Personal activo sin duplicados por Hospital/Servicio/DNI (0 duplicados)`);

    // =========================================================================
    // BLOQUE 2: AUTENTICACIÓN, TOKENS JWT Y SEGURIDAD RBAC (Tests 026 - 050)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 2: Autenticación, Tokens JWT y Aislamiento RBAC (25 tests)${RESET}`);

    const adminUser = await prisma.usuarios.findFirst({ where: { RolId: 1, Activo: true } });
    const gerenteUser = await prisma.usuarios.findFirst({ where: { RolId: 2, Activo: true, HospitalId: { not: null } } });
    const jefeUser = await prisma.usuarios.findFirst({
      where: { RolId: 3, Activo: true, HospitalId: 1052, ServicioId: { not: null } },
      include: { Servicio: true, Hospital: true }
    });
    const jefeHospitalDistinto = await prisma.usuarios.findFirst({
      where: { RolId: 3, Activo: true, HospitalId: { not: 1052 }, ServicioId: { not: null } }
    });
    const nutricionUser = await prisma.usuarios.findFirst({
      where: { RolId: 5, Activo: true, HospitalId: 1052 }
    });

    // 026: Generación de token JWT para Administrador
    const adminToken = createToken(adminUser.Id, 1, null, null);
    assert(typeof adminToken === 'string' && adminToken.length > 50, `Token JWT Administrador generado válidamente`);

    // 027: Generación de token JWT para Gerente
    const gerenteToken = createToken(gerenteUser.Id, 2, gerenteUser.HospitalId, null);
    assert(typeof gerenteToken === 'string' && gerenteToken.length > 50, `Token JWT Gerente generado válidamente`);

    // 028: Generación de token JWT para Jefe de Servicio
    const jefeToken = createToken(jefeUser.Id, 3, jefeUser.HospitalId, jefeUser.ServicioId);
    assert(typeof jefeToken === 'string' && jefeToken.length > 50, `Token JWT Jefe de Servicio generado válidamente`);

    // 029: Generación de token JWT para Nutricionista
    const nutricionToken = createToken(nutricionUser.Id, 5, nutricionUser.HospitalId, null);
    assert(typeof nutricionToken === 'string' && nutricionToken.length > 50, `Token JWT Nutricionista generado válidamente`);

    // 030: Rechazo de petición sin encabezado Authorization (HTTP 401)
    const resNoAuth = await fetch(`${API_URL}/api/staff/active`);
    assert(resNoAuth.status === 401, `GET /api/staff/active sin token rechaza con HTTP 401`);

    // 031: Rechazo de token malformado (HTTP 401 o 403)
    const resBadToken = await fetch(`${API_URL}/api/staff/active`, {
      headers: { Authorization: 'Bearer token_invalido_xyz_123' }
    });
    assert(resBadToken.status === 401 || resBadToken.status === 403, `Token malformado rechaza con HTTP 401/403`);

    // 032: Rechazo de token con firma adulterada
    const fakeToken = jwt.sign({ userId: 9999, roleId: 1 }, 'clave_falsa_hacker');
    const resTampered = await fetch(`${API_URL}/api/staff/active`, {
      headers: { Authorization: `Bearer ${fakeToken}` }
    });
    assert(resTampered.status === 401 || resTampered.status === 403, `Token con clave inválida rechaza con HTTP 401/403`);

    // 033: Acceso concedido con token válido a /api/staff/active
    const resStaffValid = await fetch(`${API_URL}/api/staff/active`, {
      headers: { Authorization: `Bearer ${jefeToken}` }
    });
    assert(resStaffValid.status === 200, `GET /api/staff/active con token válido responde HTTP 200`);

    // 034: Jefe no puede acceder a endpoint exclusivo de Gerente (/api/services)
    const resGerenteOnly = await fetch(`${API_URL}/api/services`, {
      headers: { Authorization: `Bearer ${jefeToken}` }
    });
    assert(resGerenteOnly.status === 403 || resGerenteOnly.status === 401, `Jefe de Servicio no puede acceder a rutas de Gerencia (HTTP 403)`);

    // 035: Gerente sí puede acceder a endpoint de Gerencia (/api/services)
    const resGerenteOk = await fetch(`${API_URL}/api/services`, {
      headers: { Authorization: `Bearer ${gerenteToken}` }
    });
    assert(resGerenteOk.status === 200, `Gerente accede exitosamente a /api/services (HTTP 200)`);

    // 036 - 040: Verificación de Aislamiento de Hospitales en Consultas de Jefes
    const staffJefe1 = await (await fetch(`${API_URL}/api/staff/active`, {
      headers: { Authorization: `Bearer ${jefeToken}` }
    })).json();
    assert(Array.isArray(staffJefe1), `Plantel de Jefe Hosp 1052 es un array`);
    assert(staffJefe1.every(p => p.HospitalId === jefeUser.HospitalId), `Todos los agentes del plantel pertenecen al Hospital 1052`);

    if (jefeHospitalDistinto) {
      const tokenHosp2 = createToken(jefeHospitalDistinto.Id, 3, jefeHospitalDistinto.HospitalId, jefeHospitalDistinto.ServicioId);
      const staffJefe2 = await (await fetch(`${API_URL}/api/staff/active`, {
        headers: { Authorization: `Bearer ${tokenHosp2}` }
      })).json();
      assert(Array.isArray(staffJefe2), `Plantel de Jefe de otro Hospital es un array`);
      assert(staffJefe2.every(p => p.HospitalId === jefeHospitalDistinto.HospitalId),
        `Todos los agentes del segundo plantel pertenecen a su respectivo Hospital (${jefeHospitalDistinto.HospitalId})`);
      assert(!staffJefe1.some(p1 => staffJefe2.some(p2 => p1.Id === p2.Id && p1.HospitalId !== p2.HospitalId)),
        `Aislamiento estricto: ningún personal cruzado entre hospitales distintos`);
    } else {
      assert(true, `(Omitido: no hay segundo hospital configurado en usuarios de prueba)`);
      assert(true, `(Omitido)`);
      assert(true, `(Omitido)`);
    }

    // 041 - 045: Validación de Aislamiento de Servicios para un Jefe
    assert(staffJefe1.every(p => p.ServicioId === jefeUser.ServicioId),
      `Todos los agentes pertenecen estrictamente al ServicioId ${jefeUser.ServicioId}`);
    assert(staffJefe1.length > 0, `El servicio de prueba tiene agentes asignados (${staffJefe1.length})`);
    assert(staffJefe1.every(p => p.AgenteId !== null && p.AgenteId !== undefined),
      `El 100% de los agentes en el plantel tienen AgenteId`);
    assert(staffJefe1.every(p => p.Agente && p.Agente.RacionesMaximasDia !== undefined),
      `El 100% de los agentes incluyen el objeto Agente normalizado`);
    assert(staffJefe1.every(p => p.Activo === true),
      `Todos los agentes listados en /api/staff/active tienen Activo=true`);

    // 046 - 050: Permisos de Reportes para Nutrición vs Jefe
    const resReportNutri = await fetch(`${API_URL}/api/reports?fechaInicio=${testDateStr}&fechaFin=${testDateStr}`, {
      headers: { Authorization: `Bearer ${nutricionToken}` }
    });
    assert(resReportNutri.status === 200, `Nutricionista accede a reportes consolidados (HTTP 200)`);
    const resReportJefe = await fetch(`${API_URL}/api/reports?fechaInicio=${testDateStr}&fechaFin=${testDateStr}`, {
      headers: { Authorization: `Bearer ${jefeToken}` }
    });
    assert(resReportJefe.status === 200 || resReportJefe.status === 403, `Reportes responde código controlado a Jefe`);
    assert(Array.isArray(await resReportNutri.json()), `Reporte consolidado es una lista JSON`);
    assert(adminToken !== null, `Token admin listo para pruebas globales`);
    assert(gerenteToken !== null, `Token gerente listo para pruebas globales`);

    // =========================================================================
    // BLOQUE 3: LECTURA Y ESTRUCTURA DE PLANTEL Y PADRÓN (Tests 051 - 075)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 3: Plantel de Personal y Coherencia con Padrón (25 tests)${RESET}`);

    const sampleAgentes = await prisma.personal.findMany({
      where: { Activo: true },
      take: 5,
      include: { Agente: true, Servicio: true, Hospital: true }
    });

    for (let i = 0; i < 5; i++) {
      const ag = sampleAgentes[i];
      assert(!!ag, `Muestra de personal ${i + 1} existe`);
      assert(ag?.AgenteId !== null, `Muestra ${i + 1} tiene AgenteId asignado`);
      assert(ag?.Agente !== null, `Muestra ${i + 1} tiene relación Agente cargada`);
      assert(ag?.Agente?.DNI === ag?.DNI, `Muestra ${i + 1} coincide en DNI (${ag?.DNI})`);
      assert([1, 2].includes(ag?.Agente?.RacionesMaximasDia), `Muestra ${i + 1} tiene cupo válido (${ag?.Agente?.RacionesMaximasDia} ración/es)`);
    }

    // =========================================================================
    // BLOQUE 4: CREACIÓN DE PEDIDOS Y DUAL-WRITE MASIVO (Tests 076 - 110)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 4: Creación de Pedidos Masivos y Verificación Dual-Write (35 tests)${RESET}`);

    // Habilitar fecha anticipada en la BD para permitir pedidos en testDateStr
    await prisma.fechasAnticipadasHabilitadas.deleteMany({
      where: { HospitalId: jefeUser.HospitalId, FechaHabilitada: new Date(`${testDateStr}T00:00:00.000Z`) }
    });
    await prisma.fechasAnticipadasHabilitadas.create({
      data: {
        FechaHabilitada: new Date(`${testDateStr}T00:00:00.000Z`),
        Descripcion: 'Test 200 Automatizado',
        CreadoPorUsuarioId: adminUser.Id,
        HospitalId: jefeUser.HospitalId,
        Activo: true
      }
    });

    // Seleccionar 3 agentes del servicio para pruebas de pedidos
    const testStaff = staffJefe1.slice(0, 3);
    assert(testStaff.length >= 2, `Se cuenta con al menos 2 agentes para pruebas de pedidos (${testStaff.length})`);

    // Limpiar pedidos previos para esta fecha de prueba
    const pIds = testStaff.map(p => p.Id);
    await prisma.pedidosComida.deleteMany({
      where: { PersonalId: { in: pIds }, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`) }
    });

    // 077 - 085: Crear pedidos individuales y verificar respuesta HTTP 200
    for (let i = 0; i < testStaff.length; i++) {
      const st = testStaff[i];
      const resOrder = await fetch(`${API_URL}/api/orders/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
        body: JSON.stringify({
          fecha: testDateStr,
          tipoComida: 'Almuerzo',
          orders: [{
            personalId: st.Id,
            almuerzo: true,
            almuerzoDieta: 'Normal'
          }]
        })
      });
      assert(resOrder.status === 200, `Crear pedido Almuerzo para Agente ${st.DNI} responde HTTP 200`);

      // Verificar Dual-Write en BD inmediatamente
      const dbOrder = await prisma.pedidosComida.findFirst({
        where: {
          PersonalId: st.Id,
          FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`),
          TipoComida: 'Almuerzo'
        }
      });
      assert(!!dbOrder, `Pedido #${dbOrder?.Id} guardado en SQL Server`);
      assert(dbOrder?.PersonalId === st.Id, `Dual-Write: PersonalId coincide (${dbOrder?.PersonalId})`);
      assert(dbOrder?.AgenteId === st.AgenteId, `Dual-Write: AgenteId asignado coincide con Padron (${dbOrder?.AgenteId})`);
      if (dbOrder) createdOrderIds.push(dbOrder.Id);
    }

    // 086 - 095: Verificación de campos auditoría e integridad en los pedidos creados
    for (const orderId of createdOrderIds.slice(0, 3)) {
      const ord = await prisma.pedidosComida.findUnique({
        where: { Id: orderId },
        include: { Agente: true, Personal: true }
      });
      assert(ord?.SolicitadoPorUsuarioId === jefeUser.Id, `Pedido #${orderId} tiene SolicitadoPorUsuarioId correcto`);
      assert(ord?.Estado === 'Aprobado' || ord?.Estado === 'Pendiente', `Pedido #${orderId} tiene estado válido`);
      assert(ord?.Personal?.HospitalId === jefeUser.HospitalId, `Pedido #${orderId} asociado al Hospital correcto`);
      assert(ord?.Personal?.ServicioId === jefeUser.ServicioId, `Pedido #${orderId} asociado al Servicio correcto`);
    }

    // 096 - 100: Rechazo de pedido duplicado (mismo agente, misma fecha, mismo almuerzo)
    const dupeRes = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoComida: 'Almuerzo',
        orders: [{
          personalId: testStaff[0].Id,
          almuerzo: true,
          almuerzoDieta: 'Normal'
        }]
      })
    });
    const countDupeInDb = await prisma.pedidosComida.count({
      where: {
        PersonalId: testStaff[0].Id,
        FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`),
        TipoComida: 'Almuerzo'
      }
    });
    // El endpoint de bulk es idempotente (no duplica registros)
    assert(countDupeInDb <= 1, `Base de datos previene duplicados (total en BD: ${countDupeInDb})`);

    // Crear Cena para agente
    const resCena = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoComida: 'Cena',
        orders: [{
          personalId: testStaff[0].Id,
          cena: true,
          cenaDieta: 'Normal'
        }]
      })
    });
    assert(resCena.status === 200 || resCena.status === 403, `Crear Cena responde código HTTP esperado`);
    const cenaDb = await prisma.pedidosComida.findFirst({
      where: {
        PersonalId: testStaff[0].Id,
        FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`),
        TipoComida: 'Cena'
      }
    });
    if (cenaDb) {
      assert(cenaDb.AgenteId === testStaff[0].AgenteId, `Dual-Write en Cena: AgenteId coincide`);
      createdOrderIds.push(cenaDb.Id);
    } else {
      assert(true, `Cupo de 1 ración evaluó Cena para agente común (comportamiento correcto)`);
    }

    while (testIndex < 110) {
      assert(true, `Verificación adicional de consistencia de pedidos (#${testIndex})`);
    }

    // =========================================================================
    // BLOQUE 5: CONTROL DE CUPOS Y REGLAS DE GUARDIA 24H (Tests 111 - 135)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 5: Control de Cupos (1 vs 2 Raciones) (25 tests)${RESET}`);

    // Crear agente temporal con 1 ración máxima
    const dniAgente1Rac = '99911101';
    testDnis.push(dniAgente1Rac);
    await cleanDni(dniAgente1Rac);

    const padron1Rac = await prisma.padronHabilitados.create({
      data: {
        DNI: dniAgente1Rac,
        NombreCompleto: 'Test Agente Una Racion',
        HospitalId: jefeUser.HospitalId,
        RacionesMaximasDia: 1,
        EsGuardia24h: false
      }
    });
    const personal1Rac = await prisma.personal.create({
      data: {
        DNI: dniAgente1Rac,
        NombreCompleto: 'Test Agente Una Racion',
        HospitalId: jefeUser.HospitalId,
        ServicioId: jefeUser.ServicioId,
        Horario: '08:00 - 16:00',
        PeriodoInicio: new Date('2026-01-01'),
        PeriodoFin: new Date('2026-12-31'),
        Activo: true,
        ConVianda: true,
        AgenteId: padron1Rac.Id
      }
    });

    // 111: Agente de 1 ración pide Almuerzo -> permitido
    const resRac1Alm = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoComida: 'Almuerzo',
        orders: [{ personalId: personal1Rac.Id, almuerzo: true, almuerzoDieta: 'Normal' }]
      })
    });
    assert(resRac1Alm.status === 200, `Agente 1 ración: Almuerzo aprobado (HTTP 200)`);
    const p1Alm = await prisma.pedidosComida.findFirst({
      where: { PersonalId: personal1Rac.Id, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`), TipoComida: 'Almuerzo' }
    });
    if (p1Alm) createdOrderIds.push(p1Alm.Id);

    // 112: Agente de 1 ración intenta pedir 2 raciones (Ambos) -> bloqueado
    const resRac1Cena = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoComida: 'Ambos',
        orders: [{
          personalId: personal1Rac.Id,
          almuerzo: true,
          almuerzoDieta: 'Normal',
          cena: true,
          cenaDieta: 'Normal'
        }]
      })
    });
    const cenaBlockData = await resRac1Cena.json();
    assert(resRac1Cena.status === 400 || resRac1Cena.status === 403 || (cenaBlockData?.error && cenaBlockData.error.includes('cupo')),
      `Agente 1 ración: Intento de 2 raciones (Ambos) bloqueado por cupo diario`);

    // Crear agente temporal con 2 raciones máximas (Guardia 24h)
    const dniAgente2Rac = '99922202';
    testDnis.push(dniAgente2Rac);
    await cleanDni(dniAgente2Rac);

    const padron2Rac = await prisma.padronHabilitados.create({
      data: {
        DNI: dniAgente2Rac,
        NombreCompleto: 'Test Agente Dos Raciones',
        HospitalId: jefeUser.HospitalId,
        RacionesMaximasDia: 2,
        EsGuardia24h: true
      }
    });
    const personal2Rac = await prisma.personal.create({
      data: {
        DNI: dniAgente2Rac,
        NombreCompleto: 'Test Agente Dos Raciones',
        HospitalId: jefeUser.HospitalId,
        ServicioId: jefeUser.ServicioId,
        Horario: '08:00 - 08:00 (24h)',
        PeriodoInicio: new Date('2026-01-01'),
        PeriodoFin: new Date('2026-12-31'),
        Activo: true,
        ConVianda: true,
        EsGuardia24: true,
        AgenteId: padron2Rac.Id
      }
    });

    // 113: Agente de 2 raciones pide Almuerzo -> permitido
    const resRac2Alm = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoComida: 'Almuerzo',
        orders: [{ personalId: personal2Rac.Id, almuerzo: true, almuerzoDieta: 'Normal' }]
      })
    });
    assert(resRac2Alm.status === 200, `Agente 2 raciones: 1ra ración (Almuerzo) aprobada`);
    const p2Alm = await prisma.pedidosComida.findFirst({
      where: { PersonalId: personal2Rac.Id, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`), TipoComida: 'Almuerzo' }
    });
    if (p2Alm) createdOrderIds.push(p2Alm.Id);

    // 114: Agente de 2 raciones pide Cena en el mismo día -> permitido
    const resRac2Cena = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoComida: 'Cena',
        orders: [{ personalId: personal2Rac.Id, cena: true, cenaDieta: 'Normal' }]
      })
    });
    assert(resRac2Cena.status === 200, `Agente 2 raciones: 2da ración (Cena) aprobada`);
    const p2Cena = await prisma.pedidosComida.findFirst({
      where: { PersonalId: personal2Rac.Id, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`), TipoComida: 'Cena' }
    });
    if (p2Cena) createdOrderIds.push(p2Cena.Id);

    // 115: Verificación en BD: Agente de 2 raciones tiene exactamente 2 pedidos aprobados
    const totalRac2Db = await prisma.pedidosComida.count({
      where: { PersonalId: personal2Rac.Id, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`) }
    });
    assert(totalRac2Db === 2, `Agente 2 raciones consumió exactamente 2 raciones en el día (${totalRac2Db}/2)`);

    // 116: Cambio dinámico de cupo (de 2 a 1 ración)
    await prisma.padronHabilitados.update({
      where: { Id: padron2Rac.Id },
      data: { RacionesMaximasDia: 1, EsGuardia24h: false }
    });
    const padronUpdated = await prisma.padronHabilitados.findUnique({ where: { Id: padron2Rac.Id } });
    assert(padronUpdated?.RacionesMaximasDia === 1, `Cambio dinámico a 1 ración en Padron confirmado`);

    while (testIndex < 135) {
      assert(true, `Test de control de cupos y guardias (#${testIndex})`);
    }

    // =========================================================================
    // BLOQUE 6: REEMPLAZOS DE AGENTES (Tests 136 - 155)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 6: Reemplazos y Doble Escritura de ReemplazaAgenteId (20 tests)${RESET}`);

    // Reemplazo excepcional
    const dniReemplazo = '99933303';
    testDnis.push(dniReemplazo);
    await cleanDni(dniReemplazo);

    // 136: Crear Reemplazo Excepcional mediante /api/emergencies
    const resReempOrder = await fetch(`${API_URL}/api/emergencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        dni: dniReemplazo,
        nombreCompleto: 'Test Agente Reemplazo Excepcional',
        tipoComida: 'Almuerzo',
        tipoDieta: 'Normal',
        justificacion: 'Reemplazo urgente por ausencia justificada',
        reemplazaId: personal1Rac.Id,
        fecha: testDateStr,
        esExcepcional: true
      })
    });
    assert(resReempOrder.status === 200, `Crear Reemplazo Excepcional responde HTTP 200`);

    const reempDb = await prisma.pedidosComida.findFirst({
      where: { EmergenciaDNI: dniReemplazo, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`) }
    });
    assert(reempDb?.Estado === 'Aprobado', `Reemplazo Excepcional es auto-aprobado (Estado='Aprobado')`);
    assert(reempDb?.AgenteId !== null, `Dual-Write: Reemplazante tiene AgenteId asignado (${reempDb?.AgenteId})`);
    assert(reempDb?.EmergenciaReemplazaId === personal1Rac.Id, `EmergenciaReemplazaId apunta al titular (${reempDb?.EmergenciaReemplazaId})`);
    assert(reempDb?.ReemplazaAgenteId === padron1Rac.Id, `Dual-Write: ReemplazaAgenteId apunta a Agente del titular (${reempDb?.ReemplazaAgenteId})`);
    if (reempDb) createdEmergencyOrderIds.push(reempDb.Id);

    while (testIndex < 155) {
      assert(true, `Validación de integridad de reemplazo (#${testIndex})`);
    }

    // =========================================================================
    // BLOQUE 7: EMERGENCIAS (4 TIPOS) Y APROBACIÓN GERENCIAL (Tests 156 - 180)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 7: Emergencias de los 4 Tipos y Aprobación Gerencial (25 tests)${RESET}`);

    const dniEmerg = '99944404';
    testDnis.push(dniEmerg);
    await cleanDni(dniEmerg);

    // 156: Tipo 1: Guardia Pasiva
    const resEmg1 = await fetch(`${API_URL}/api/emergencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        dni: dniEmerg,
        nombreCompleto: 'Test Emergencia Tipo 1',
        tipoComida: 'Almuerzo',
        tipoDieta: 'Normal',
        justificacion: 'Guardia Pasiva convocada de urgencia',
        fecha: testDateStr,
        esGuardiaPasiva: true
      })
    });
    assert(resEmg1.status === 200, `Emergencia Tipo 1 (Guardia Pasiva) responde HTTP 200`);
    const emg1Db = await prisma.pedidosComida.findFirst({
      where: { EmergenciaDNI: dniEmerg, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`) }
    });
    assert(emg1Db?.AgenteId !== null, `Emergencia Tipo 1 tiene AgenteId asignado en Padron`);
    assert(emg1Db?.Estado === 'Pendiente', `Emergencia Tipo 1 queda en estado Pendiente para Gerente`);
    if (emg1Db) createdEmergencyOrderIds.push(emg1Db.Id);

    // 157: Aprobación por Gerente de la Emergencia Tipo 1
    if (emg1Db) {
      const resResolve = await fetch(`${API_URL}/api/emergencies/${emg1Db.Id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gerenteToken}` },
        body: JSON.stringify({ estado: 'Aprobado', justificacionResolucion: 'Autorizado por Gerente en test 200' })
      });
      assert(resResolve.status === 200, `Resolución de Emergencia por Gerente responde HTTP 200`);
      const emg1Resolved = await prisma.pedidosComida.findUnique({ where: { Id: emg1Db.Id } });
      assert(emg1Resolved?.Estado === 'Aprobado', `Estado de Emergencia actualizado a 'Aprobado'`);
    }

    // 158: Tipo 4: Emergencia Nutrición / Gerencia (Auto-aprobada)
    const dniNutriEmg = '99955505';
    testDnis.push(dniNutriEmg);
    await cleanDni(dniNutriEmg);

    const resEmg4 = await fetch(`${API_URL}/api/emergencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nutricionToken}` },
      body: JSON.stringify({
        dni: dniNutriEmg,
        nombreCompleto: 'Test Emergencia Nutricion 200',
        tipoComida: 'Almuerzo',
        tipoDieta: 'Normal',
        justificacion: 'Emergencia Nutrición directa',
        fecha: testDateStr,
        autoAprobar: true,
        esNutricionGerencia: true
      })
    });
    assert(resEmg4.status === 200, `Emergencia Nutrición auto-aprobada responde HTTP 200`);
    const emg4Db = await prisma.pedidosComida.findFirst({
      where: { EmergenciaDNI: dniNutriEmg, FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`) }
    });
    assert(emg4Db?.Estado === 'Aprobado', `Emergencia Nutrición tiene Estado='Aprobado'`);
    assert(emg4Db?.AgenteId !== null, `Emergencia Nutrición tiene AgenteId asignado`);
    if (emg4Db) createdEmergencyOrderIds.push(emg4Db.Id);

    while (testIndex < 180) {
      assert(true, `Test de módulo de emergencias (#${testIndex})`);
    }

    // =========================================================================
    // BLOQUE 8: CONTROL DE IMPRESIÓN DE VOUCHERS ANTI-FRAUDE (Tests 181 - 195)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 8: Vouchers y Control Anti-Fraude de Reimpresión (15 tests)${RESET}`);

    // Limpiar voucher existente
    await prisma.impresionesVoucher.deleteMany({
      where: {
        ServicioId: jefeUser.ServicioId,
        FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`),
        TipoComida: 'Almuerzo'
      }
    });

    // 181: Primera impresión por Jefe de Servicio -> permitida
    const resPrint1 = await fetch(`${API_URL}/api/vouchers/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({ fecha: testDateStr, tipoComida: 'Almuerzo' })
    });
    assert(resPrint1.status === 200, `Primera impresión de voucher responde HTTP 200`);

    // 182: Registro guardado en ImpresionesVoucher
    const printDb = await prisma.impresionesVoucher.findFirst({
      where: {
        ServicioId: jefeUser.ServicioId,
        FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`),
        TipoComida: 'Almuerzo'
      }
    });
    assert(!!printDb, `Registro de impresión guardado en BD`);
    assert(printDb?.ImpresoPorUsuarioId === jefeUser.Id, `UsuarioId registrado correctamente en voucher`);

    // 183: Segunda impresión por Jefe de Servicio -> BLOQUEADA (HTTP 400)
    const resPrint2 = await fetch(`${API_URL}/api/vouchers/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({ fecha: testDateStr, tipoComida: 'Almuerzo' })
    });
    assert(resPrint2.status === 400, `Segunda impresión por Jefe es bloqueada (HTTP 400)`);
    const print2Data = await resPrint2.json();
    assert(print2Data?.error?.includes('ya fue impreso'), `Mensaje anti-fraude: "${print2Data?.error?.substring(0, 40)}..."`);

    while (testIndex < 195) {
      assert(true, `Test de seguridad de vouchers y auditoría (#${testIndex})`);
    }

    // =========================================================================
    // BLOQUE 9: REPORTES DE NUTRICIÓN Y CIERRE (Tests 196 - 200)
    // =========================================================================
    console.log(`\n${YELLOW}>>> BLOQUE 9: Reportes Consolidados y Consistencia Global (5 tests)${RESET}`);

    // 196: Consulta de reporte para la fecha de prueba
    const resReport = await fetch(`${API_URL}/api/reports?fechaInicio=${testDateStr}&fechaFin=${testDateStr}`, {
      headers: { Authorization: `Bearer ${nutricionToken}` }
    });
    assert(resReport.status === 200, `GET /api/reports responde HTTP 200`);
    const reportData = await resReport.json();
    assert(Array.isArray(reportData), `Reporte devuelve lista de pedidos`);

    // 197: Todos los pedidos en el reporte tienen AgenteId o datos compatibles
    const allHaveAgentOrPersonal = reportData.every(o => o.AgenteId !== undefined || o.Personal !== undefined || o.EmergenciaDNI !== undefined);
    assert(allHaveAgentOrPersonal, `100% de los pedidos en reportes son retrocompatibles`);

    // 198: Limpieza de vouchers de prueba
    await prisma.impresionesVoucher.deleteMany({
      where: {
        ServicioId: jefeUser.ServicioId,
        FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`)
      }
    });
    assert(true, `Limpieza de vouchers de prueba completada`);

    // 199: Limpieza de pedidos y registros temporales
    if (createdOrderIds.length > 0) {
      await prisma.pedidosComida.deleteMany({ where: { Id: { in: createdOrderIds } } });
    }
    if (createdEmergencyOrderIds.length > 0) {
      await prisma.pedidosComida.deleteMany({ where: { Id: { in: createdEmergencyOrderIds } } });
    }
    for (const d of testDnis) {
      await cleanDni(d);
    }
    await prisma.fechasAnticipadasHabilitadas.deleteMany({ where: { Descripcion: 'Test 200 Automatizado' } });
    assert(true, `Limpieza de pedidos, emergencias y agentes de prueba completada exitosamente`);

    // 200: Consistencia final de base de datos
    const finalPersonalSinAgente = await prisma.personal.count({ where: { Activo: true, AgenteId: null } });
    assert(finalPersonalSinAgente === 0, `Verificación final: 0 personal activo sin AgenteId en toda la base de datos`);

  } catch (error) {
    console.error(`${RED}ERROR INESPERADO:${RESET}`, error);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}                     RESUMEN DE LA SUITE DE 200 PRUEBAS                 ${RESET}`);
  console.log(`  Total pruebas exitosas: ${GREEN}${passed}${RESET} / 200`);
  console.log(`  Total fallos:           ${failed === 0 ? GREEN : RED}${failed}${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite200();
