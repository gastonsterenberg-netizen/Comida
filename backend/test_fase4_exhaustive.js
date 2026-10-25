const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production';

// Helper to generate auth token
function createToken(userId, roleId, hospitalId, servicioId) {
  return jwt.sign(
    { userId, roleId, hospitalId, servicioId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`${GREEN}  ✔ PASS:${RESET} ${message}`);
    passed++;
  } else {
    console.error(`${RED}  ✖ FAIL:${RESET} ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log(`${CYAN}================================================================${RESET}`);
  console.log(`${CYAN} INICIANDO TESTING EXHAUSTIVO DE FASE 4: HOSPITALES NORMALIZADOS ${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  const createdOrderIds = [];
  const createdEmergencyOrderIds = [];
  let testAgenteDni = '99988877';

  try {
    // -------------------------------------------------------------
    // PRUEBA 1: Integridad de la Base de Datos y Claves Foráneas
    // -------------------------------------------------------------
    console.log(`${YELLOW}[TEST 1] Verificando Integridad de Esquema y Llaves Foráneas en SQL Server...${RESET}`);
    
    // Verificar PadronHabilitados.RacionesMaximasDia
    const padronSample = await prisma.padronHabilitados.findFirst({
      where: { RacionesMaximasDia: { in: [1, 2] } }
    });
    assert(!!padronSample, 'Columna PadronHabilitados.RacionesMaximasDia tiene valores válidos (1 o 2)');

    // Verificar Personal.AgenteId
    const personalSinAgente = await prisma.personal.count({
      where: { Activo: true, AgenteId: null }
    });
    assert(personalSinAgente === 0, `Personal activo sin AgenteId asignado: ${personalSinAgente} (debe ser 0)`);

    // Verificar PedidosComida.AgenteId cobertura
    const pedidosTotal = await prisma.pedidosComida.count();
    const pedidosConAgente = await prisma.pedidosComida.count({ where: { AgenteId: { not: null } } });
    assert(pedidosTotal === pedidosConAgente, `PedidosComida con AgenteId: ${pedidosConAgente}/${pedidosTotal} (100% cubierto)`);

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // PRUEBA 2: Consulta de Plantel por Jefe de Servicio (GET /api/staff/active)
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 2] Verificando lectura de Plantel para Jefe de Servicio...${RESET}`);
    
    // Seleccionar jefe de Hospital 1052 que cuenta con Nutricionista y Gerente
    const jefeUser = await prisma.usuarios.findFirst({
      where: { RolId: 3, Activo: true, HospitalId: 1052, ServicioId: { not: null } },
      include: { Hospital: true, Servicio: true }
    });
    assert(!!jefeUser, `Usuario Jefe encontrado: ${jefeUser?.NombreUsuario} (Hospital: ${jefeUser?.HospitalId}, Servicio: ${jefeUser?.ServicioId})`);

    const jefeToken = createToken(jefeUser.Id, jefeUser.RolId, jefeUser.HospitalId, jefeUser.ServicioId);

    const resStaff = await fetch(`${API_URL}/api/staff/active`, {
      headers: { Authorization: `Bearer ${jefeToken}` }
    });
    const staffData = await resStaff.json();
    assert(resStaff.status === 200, `GET /api/staff/active responde HTTP 200`);
    assert(Array.isArray(staffData), `Devuelve lista de personal (${staffData.length} registros)`);
    if (staffData.length > 0) {
      const firstStaff = staffData[0];
      assert(firstStaff.AgenteId !== undefined, `Personal incluye AgenteId (${firstStaff.AgenteId})`);
      assert(firstStaff.Agente !== undefined, `Personal incluye relación normalizada Agente`);
    }

    // Usar fecha de mañana para evitar interferir con pedidos del día de hoy
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Habilitar fecha anticipada en Hospital 1052 para permitir la prueba
    const fechaAnticipadaTest = await prisma.fechasAnticipadasHabilitadas.create({
      data: {
        HospitalId: jefeUser.HospitalId,
        FechaHabilitada: new Date(`${tomorrowStr}T00:00:00.000Z`),
        CreadoPorUsuarioId: 1,
        Activo: true,
        Descripcion: 'Test Exhaustivo Automatizado'
      }
    });
    console.log(`  -> Habilitada fecha anticipada ${tomorrowStr} para testing`);

    // -------------------------------------------------------------
    // PRUEBA 3: Creación de Pedidos Masivos (POST /api/orders/bulk) con Dual-Write
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 3] Verificando Dual-Write en POST /api/orders/bulk...${RESET}`);

    // Buscar 2 agentes del servicio para pedir comida para mañana
    const personalCandidatos = await prisma.personal.findMany({
      where: { ServicioId: jefeUser.ServicioId, Activo: true, AgenteId: { not: null } },
      take: 2
    });
    assert(personalCandidatos.length >= 1, `Encontrados ${personalCandidatos.length} agentes para prueba de pedidos`);

    // Limpiar posibles pedidos existentes para mañana de estos agentes
    const pIds = personalCandidatos.map(p => p.Id);
    await prisma.pedidosComida.deleteMany({
      where: {
        PersonalId: { in: pIds },
        FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`)
      }
    });

    const bulkPayload = {
      tipoComida: 'Almuerzo',
      fecha: tomorrowStr,
      orders: personalCandidatos.map(p => ({
        personalId: p.Id,
        almuerzo: true,
        almuerzoDieta: 'Normal'
      }))
    };

    const resBulk = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jefeToken}`
      },
      body: JSON.stringify(bulkPayload)
    });
    const bulkData = await resBulk.json();
    assert(resBulk.status === 200, `POST /api/orders/bulk responde HTTP 200`);

    // Verificar en BD que se guardó con AgenteId
    const pedidosCreados = await prisma.pedidosComida.findMany({
      where: {
        PersonalId: { in: pIds },
        FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`)
      }
    });
    assert(pedidosCreados.length === personalCandidatos.length, `Se crearon ${pedidosCreados.length} pedidos en base de datos`);
    for (const ped of pedidosCreados) {
      createdOrderIds.push(ped.Id);
      assert(ped.AgenteId !== null && ped.PersonalId !== null, `Pedido #${ped.Id} tiene Dual-Write: PersonalId=${ped.PersonalId} y AgenteId=${ped.AgenteId}`);
    }

    // -------------------------------------------------------------
    // PRUEBA 4: Control Atómico de Raciones (Rechazo de exceso de cupo diario)
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 4] Verificando control de raciones (rechazo de exceso de cupo)...${RESET}`);

    // Asegurar que el titular tenga RacionesMaximasDia = 1 en Padron
    await prisma.padronHabilitados.update({
      where: { Id: personalCandidatos[0].AgenteId },
      data: { RacionesMaximasDia: 1, EsGuardia24h: false }
    });

    const excesoPayload = {
      tipoComida: 'Ambos',
      fecha: tomorrowStr,
      orders: [{
        personalId: personalCandidatos[0].Id,
        almuerzo: true,
        almuerzoDieta: 'Normal',
        cena: true,
        cenaDieta: 'Normal'
      }]
    };

    const resExceso = await fetch(`${API_URL}/api/orders/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jefeToken}`
      },
      body: JSON.stringify(excesoPayload)
    });
    const excesoData = await resExceso.json();
    assert(resExceso.status === 400 || resExceso.status === 500, `Intento de pedir 2 raciones para agente con cupo=1 fue RECHAZADO (HTTP ${resExceso.status})`);
    assert(excesoData.error && excesoData.error.includes('solo posee cupo para 1 comida'), `Mensaje descriptivo recibido: "${excesoData.error}"`);

    // -------------------------------------------------------------
    // PRUEBA 5: Creación de Emergencias (4 Tipos) con Dual-Write
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 5] Verificando POST /api/emergencies (4 Tipos de Emergencias)...${RESET}`);

    // Limpiar emergencias previas de prueba
    await prisma.pedidosComida.deleteMany({
      where: { EmergenciaDNI: testAgenteDni }
    });

    // 5.1 Tipo 1: Reemplazo Normal (requiere autorizacion)
    console.log(`  Subtest 5.1: Reemplazo Normal (con agente titular)...`);
    const titular = personalCandidatos[0];
    const resEmg1 = await fetch(`${API_URL}/api/emergencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        dni: testAgenteDni,
        nombreCompleto: 'Test Reemplazo Normal',
        reemplazaId: titular.Id,
        tipoComida: 'Almuerzo',
        tipoDieta: 'Normal',
        justificacion: 'Licencia medica titular',
        fecha: tomorrowStr,
        autoAprobar: false
      })
    });
    assert(resEmg1.status === 200, `Crear Reemplazo Normal responde HTTP 200`);
    const emg1Row = await prisma.pedidosComida.findFirst({
      where: { EmergenciaDNI: testAgenteDni, FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`) }
    });
    assert(emg1Row?.Estado === 'Pendiente', `Reemplazo normal queda en Estado='Pendiente' (esperando Gerente)`);
    assert(emg1Row?.AgenteId !== null, `Reemplazo normal tiene AgenteId asignado en Padron (${emg1Row?.AgenteId})`);
    assert(emg1Row?.ReemplazaAgenteId !== null, `Reemplazo normal tiene ReemplazaAgenteId asignado (${emg1Row?.ReemplazaAgenteId})`);
    if (emg1Row) {
      createdEmergencyOrderIds.push(emg1Row.Id);

      // Subtest 5.1.b: Aprobación por Gerente (POST /api/emergencies/:id/resolve)
      const gerenteUser = await prisma.usuarios.findFirst({
        where: { RolId: 2, Activo: true, HospitalId: jefeUser.HospitalId }
      });
      const gerenteToken = createToken(gerenteUser.Id, 2, gerenteUser.HospitalId, null);

      const resResolve = await fetch(`${API_URL}/api/emergencies/${emg1Row.Id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gerenteToken}` },
        body: JSON.stringify({
          estado: 'Aprobado',
          justificacionResolucion: 'Aprobado por Gerencia de prueba'
        })
      });
      assert(resResolve.status === 200, `Gerente aprueba emergencia (POST /api/emergencies/:id/resolve responde 200)`);
      const emg1Aprobado = await prisma.pedidosComida.findUnique({ where: { Id: emg1Row.Id } });
      assert(emg1Aprobado?.Estado === 'Aprobado', `Estado de la emergencia pasa a "Aprobado" tras resolución de Gerente`);
    }

    // Limpiar para siguiente subtest
    await prisma.pedidosComida.deleteMany({ where: { EmergenciaDNI: testAgenteDni } });

    // 5.2 Tipo 2: Extra / Sobreturno
    console.log(`  Subtest 5.2: Extra / Sobreturno...`);
    const resEmg2 = await fetch(`${API_URL}/api/emergencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        dni: testAgenteDni,
        nombreCompleto: 'Test Extra Sobreturno',
        tipoComida: 'Almuerzo',
        tipoDieta: 'Normal',
        justificacion: 'Sobrecarga de guardia',
        fecha: tomorrowStr,
        autoAprobar: false
      })
    });
    assert(resEmg2.status === 200, `Crear Extra/Sobreturno responde HTTP 200`);
    const emg2Row = await prisma.pedidosComida.findFirst({
      where: { EmergenciaDNI: testAgenteDni, FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`) }
    });
    assert(emg2Row?.Estado === 'Pendiente', `Extra queda en Estado='Pendiente'`);
    assert(emg2Row?.AgenteId !== null, `Extra tiene AgenteId asignado en Padron (${emg2Row?.AgenteId})`);
    if (emg2Row) createdEmergencyOrderIds.push(emg2Row.Id);

    // Limpiar para siguiente subtest
    await prisma.pedidosComida.deleteMany({ where: { EmergenciaDNI: testAgenteDni } });

    // 5.3 Tipo 3: Reemplazo Excepcional de Última Hora
    console.log(`  Subtest 5.3: Reemplazo Excepcional de Última Hora...`);
    const resEmg3 = await fetch(`${API_URL}/api/emergencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        dni: testAgenteDni,
        nombreCompleto: 'Test Reemplazo Excepcional',
        reemplazaId: titular.Id,
        tipoComida: 'Almuerzo',
        tipoDieta: 'Normal',
        justificacion: 'Reemplazo de ultima hora urgente',
        fecha: tomorrowStr,
        esExcepcional: true
      })
    });
    assert(resEmg3.status === 200, `Crear Reemplazo Excepcional responde HTTP 200`);
    const emg3Row = await prisma.pedidosComida.findFirst({
      where: { EmergenciaDNI: testAgenteDni, FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`) }
    });
    assert(emg3Row?.Estado === 'Aprobado', `Reemplazo Excepcional es AUTO-APROBADO (Estado='Aprobado')`);
    assert(emg3Row?.AgenteId !== null, `Tiene AgenteId asignado (${emg3Row?.AgenteId})`);
    if (emg3Row) createdEmergencyOrderIds.push(emg3Row.Id);

    // Limpiar para siguiente subtest
    await prisma.pedidosComida.deleteMany({ where: { EmergenciaDNI: testAgenteDni } });

    // 5.4 Tipo 4: Emergencia de Nutrición / Gerencia
    console.log(`  Subtest 5.4: Emergencia de Nutrición / Gerencia (Auto-aprobada)...`);
    const nutricionUser = await prisma.usuarios.findFirst({
      where: { RolId: 5, Activo: true, HospitalId: jefeUser.HospitalId }
    });
    const nutricionToken = createToken(nutricionUser.Id, 5, nutricionUser.HospitalId, null);

    const resEmg4 = await fetch(`${API_URL}/api/emergencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nutricionToken}` },
      body: JSON.stringify({
        dni: testAgenteDni,
        nombreCompleto: 'Test Emergencia Nutricion',
        tipoComida: 'Almuerzo',
        tipoDieta: 'Diabetica',
        justificacion: 'Auto-autorizado por nutricion de guardia',
        fecha: tomorrowStr,
        autoAprobar: true,
        esNutricionGerencia: true
      })
    });
    assert(resEmg4.status === 200, `Crear Emergencia Nutrición responde HTTP 200`);
    const emg4Row = await prisma.pedidosComida.findFirst({
      where: { EmergenciaDNI: testAgenteDni, FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`) }
    });
    assert(emg4Row?.Estado === 'Aprobado', `Emergencia Nutrición es AUTO-APROBADA (Estado='Aprobado')`);
    assert(emg4Row?.JustificacionSolicitud?.includes('[EMERGENCIA NUTRICIÓN / GERENCIA]'), `Justificación marcada para auditoría gerencial`);
    assert(emg4Row?.AgenteId !== null, `Tiene AgenteId asignado en Padron (${emg4Row?.AgenteId})`);
    if (emg4Row) createdEmergencyOrderIds.push(emg4Row.Id);

    // -------------------------------------------------------------
    // PRUEBA 6: Consumo de Pedidos para Cocina / Nutrición (GET /api/reports)
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 6] Verificando Retrocompatibilidad de lectura para Cocina/Nutrición (GET /api/reports)...${RESET}`);

    const resToday = await fetch(`${API_URL}/api/reports?fechaInicio=${tomorrowStr}&fechaFin=${tomorrowStr}`, {
      headers: { Authorization: `Bearer ${nutricionToken}` }
    });
    assert(resToday.status === 200, `GET /api/reports responde HTTP 200`);
    const todayOrders = await resToday.json();
    assert(Array.isArray(todayOrders), `Devuelve array de pedidos (${todayOrders.length} pedidos encontrados)`);
    if (todayOrders.length > 0) {
      const ord = todayOrders[0];
      // Verificar que el frontend reciba tanto Personal como Agente para evitar crash en pantallas
      const hasPersonalOrEmergencia = ord.Personal !== undefined || ord.EmergenciaNombreCompleto !== undefined;
      assert(hasPersonalOrEmergencia, `El DTO mantiene campos esperados por el frontend (Personal/Emergencia)`);
      if (ord.AgenteId) {
        assert(ord.AgenteId > 0, `El DTO incluye AgenteId normalizado (${ord.AgenteId})`);
      }
    }

    // -------------------------------------------------------------
    // -------------------------------------------------------------
    // PRUEBA 7: Sincronización de Plantel y AgenteId (POST /api/staff/plantel)
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 7] Verificando Dual-Write y sync en Guardar Plantel (POST /api/staff/plantel)...${RESET}`);

    const currentStaff = await prisma.personal.findMany({
      where: { ServicioId: jefeUser.ServicioId, Activo: true }
    });
    const plantelPayload = currentStaff.map(p => ({
      DNI: p.DNI,
      NombreCompleto: p.NombreCompleto,
      Horario: p.Horario,
      ConVianda: p.ConVianda,
      EsGuardia12: p.EsGuardia12,
      EsGuardia24: p.EsGuardia24
    }));

    const resGuardar = await fetch(`${API_URL}/api/staff/plantel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        plantel: plantelPayload
      })
    });
    assert(resGuardar.status === 200, `POST /api/staff/plantel responde HTTP 200`);

    const titularActualizado = await prisma.personal.findUnique({
      where: { Id: titular.Id }
    });
    assert(titularActualizado?.AgenteId !== null, `Titular mantiene AgenteId vinculado (${titularActualizado?.AgenteId})`);

    // -------------------------------------------------------------
    // PRUEBA 7.b: Control de Impresión Única de Vouchers (POST /api/vouchers/print)
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 7.b] Verificando Control de Impresión Única de Vouchers...${RESET}`);

    // Limpiar voucher existente si lo hubiera
    await prisma.impresionesVoucher.deleteMany({
      where: {
        ServicioId: jefeUser.ServicioId,
        FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`),
        TipoComida: 'Almuerzo'
      }
    });

    // Primera impresión: debe ser exitosa
    const resPrint1 = await fetch(`${API_URL}/api/vouchers/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: tomorrowStr,
        tipoComida: 'Almuerzo'
      })
    });
    assert(resPrint1.status === 200, `Primera impresión de voucher responde HTTP 200`);

    // Segunda impresión: debe ser rechazada para Rol 3 (Jefe)
    const resPrint2 = await fetch(`${API_URL}/api/vouchers/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jefeToken}` },
      body: JSON.stringify({
        fecha: tomorrowStr,
        tipoComida: 'Almuerzo'
      })
    });
    const print2Data = await resPrint2.json();
    assert(resPrint2.status === 400, `Segunda impresión de voucher por Jefe es RECHAZADA (HTTP 400)`);
    assert(print2Data.error && print2Data.error.includes('ya fue impreso anteriormente'), `Mensaje de bloqueo de reimpresión correcto: "${print2Data.error?.substring(0, 50)}..."`);

    // Limpieza de voucher de prueba
    await prisma.impresionesVoucher.deleteMany({
      where: {
        ServicioId: jefeUser.ServicioId,
        FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`)
      }
    });

    // -------------------------------------------------------------
    // PRUEBA 8: Auditoría y Cierre de Testing
    // -------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 8] Limpieza segura de registros temporales...${RESET}`);
    
    // Borrar pedidos de prueba
    if (createdOrderIds.length > 0) {
      await prisma.pedidosComida.deleteMany({ where: { Id: { in: createdOrderIds } } });
    }
    if (createdEmergencyOrderIds.length > 0) {
      await prisma.pedidosComida.deleteMany({ where: { Id: { in: createdEmergencyOrderIds } } });
    }
    await prisma.pedidosComida.deleteMany({ where: { EmergenciaDNI: testAgenteDni } });
    await prisma.padronHabilitados.deleteMany({ where: { DNI: testAgenteDni } });
    await prisma.fechasAnticipadasHabilitadas.deleteMany({ where: { Descripcion: 'Test Exhaustivo Automatizado' } });

    console.log(`${GREEN}  ✔ Registros de prueba limpiados correctamente.${RESET}`);

  } catch (err) {
    console.error(`${RED}ERROR INESPERADO DURANTE EL TEST:${RESET}`, err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN} RESUMEN DE EJECUCIÓN:${RESET}`);
  console.log(`  Total pruebas exitosas: ${GREEN}${passed}${RESET}`);
  console.log(`  Total fallos:           ${failed === 0 ? GREEN : RED}${failed}${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
