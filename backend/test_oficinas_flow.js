const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:3001';

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

async function testOficinas() {
  console.log(`${CYAN}========================================================================${RESET}`);
  console.log(`${CYAN}  TEST DEL FLUJO COMPLETO DE OFICINAS Y CATERING VERSÁTIL (FASE 5)      ${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Login de Empleado con DNI y PIN (Autoservicio)
    // -------------------------------------------------------------------------
    console.log(`${YELLOW}[TEST 1] Login de Empleado (DNI 40111222, PIN 1234)...${RESET}`);
    const resLogin = await fetch(`${API_URL}/api/oficinas/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '40111222', pin: '1234' })
    });
    const loginData = await resLogin.json();
    assert(resLogin.status === 200, `Login de empleado responde HTTP 200`);
    assert(!!loginData.token, `Token JWT de empleado generado`);
    assert(loginData.empleado?.nombre?.includes('Juan Pérez'), `Empleado identificado: ${loginData.empleado?.nombre}`);
    assert(loginData.empleado?.hospitalNombre?.includes('Casa Central'), `Oficina asociada: ${loginData.empleado?.hospitalNombre}`);

    const empleadoToken = loginData.token;

    // -------------------------------------------------------------------------
    // TEST 2: Rechazo de Login con PIN Incorrecto
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 2] Verificación de Seguridad: PIN Incorrecto...${RESET}`);
    const resBadPin = await fetch(`${API_URL}/api/oficinas/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '40111222', pin: '9999' })
    });
    assert(resBadPin.status === 401, `Login con PIN incorrecto es rechazado (HTTP 401)`);

    // -------------------------------------------------------------------------
    // TEST 3: Consulta del Menú Versátil (Platos del Día vs Principales + Guarnición)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 3] Consulta de Menú del Día para ${tomorrowStr}...${RESET}`);
    const resMenu = await fetch(`${API_URL}/api/oficinas/menu?fecha=${tomorrowStr}`, {
      headers: { Authorization: `Bearer ${empleadoToken}` }
    });
    const menuData = await resMenu.json();
    assert(resMenu.status === 200, `GET /api/oficinas/menu responde HTTP 200`);
    assert(Array.isArray(menuData.platosDelDia) && menuData.platosDelDia.length >= 2,
      `Platos del Día (Cerrados/Completos) disponibles: ${menuData.platosDelDia?.length}`);
    assert(Array.isArray(menuData.principales) && menuData.principales.length >= 2,
      `Platos Principales (para armar) disponibles: ${menuData.principales?.length}`);
    assert(Array.isArray(menuData.guarniciones) && menuData.guarniciones.length >= 3,
      `Guarniciones a elección disponibles: ${menuData.guarniciones?.length}`);

    const platoElegido = menuData.principales[1]; // Milanesa
    const guarnicionElegida = menuData.guarniciones[0]; // Puré

    // -------------------------------------------------------------------------
    // TEST 4: Confirmación de Pedido con Plato Principal + Guarnición
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 4] Registro de Vianda: [${platoElegido.NombrePlato}] + [${guarnicionElegida.NombreGuarnicion}]...${RESET}`);
    const resPedido = await fetch(`${API_URL}/api/oficinas/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empleadoToken}` },
      body: JSON.stringify({
        fecha: tomorrowStr,
        platoOpcionId: platoElegido.Id,
        guarnicionId: guarnicionElegida.Id,
        observaciones: 'Sin sal agregada por favor'
      })
    });
    const pedidoData = await resPedido.json();
    assert(resPedido.status === 200, `POST /api/oficinas/pedidos responde HTTP 200`);
    assert(pedidoData.message?.includes('exitosa'), `Confirmación recibida: "${pedidoData.message}"`);

    // -------------------------------------------------------------------------
    // TEST 5: Verificación en Base de Datos de Doble Escritura y Opciones
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 5] Verificación de Registro en SQL Server...${RESET}`);
    const dbOrder = await prisma.pedidosComida.findFirst({
      where: {
        AgenteId: loginData.empleado.agenteId,
        FechaPedido: new Date(`${tomorrowStr}T00:00:00.000Z`)
      },
      include: { PlatoOpcion: true, Guarnicion: true, Personal: true, Agente: true }
    });
    assert(!!dbOrder, `Pedido guardado en tabla PedidosComida`);
    assert(dbOrder?.CanalPedido === 'PORTAL_EMPLEADO', `Canal de pedido registrado como PORTAL_EMPLEADO`);
    assert(dbOrder?.PlatoOpcionId === platoElegido.Id, `PlatoOpcionId vinculado (${dbOrder?.PlatoOpcion?.NombrePlato})`);
    assert(dbOrder?.GuarnicionId === guarnicionElegida.Id, `GuarnicionId vinculado (${dbOrder?.Guarnicion?.NombreGuarnicion})`);
    assert(dbOrder?.PersonalId !== null, `Dual-Write: PersonalId asociado (${dbOrder?.PersonalId})`);
    assert(dbOrder?.AgenteId !== null, `Dual-Write: AgenteId asociado (${dbOrder?.AgenteId})`);

    // -------------------------------------------------------------------------
    // TEST 6: Segundo Empleado elige Plato del Día (Sin Guarnición)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 6] Segundo Empleado (DNI 40333444, PIN 4321) pide Plato Cerrado (Tarta)...${RESET}`);
    const resLogin2 = await fetch(`${API_URL}/api/oficinas/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '40333444', pin: '4321' })
    });
    const login2Data = await resLogin2.json();
    const token2 = login2Data.token;

    const tartaPlato = menuData.platosDelDia[0];
    const resPedido2 = await fetch(`${API_URL}/api/oficinas/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token2}` },
      body: JSON.stringify({
        fecha: tomorrowStr,
        platoOpcionId: tartaPlato.Id
      })
    });
    assert(resPedido2.status === 200, `Pedido de Plato Cerrado responde HTTP 200 sin exigir guarnición`);

    // -------------------------------------------------------------------------
    // TEST 7: Consolidado para Proveedor de Catering (Vista Encargado/Remito)
    // -------------------------------------------------------------------------
    console.log(`\n${YELLOW}[TEST 7] Reporte Consolidado para el Proveedor de Catering...${RESET}`);
    const adminUser = await prisma.usuarios.findFirst({ where: { RolId: 1, Activo: true } });
    const adminToken = jwt.sign({ userId: adminUser.Id, roleId: 1 }, process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production');

    const resConsolidado = await fetch(`${API_URL}/api/oficinas/consolidado-proveedor?hospitalId=${loginData.empleado.hospitalId}&fecha=${tomorrowStr}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const consolidadoData = await resConsolidado.json();
    assert(resConsolidado.status === 200, `GET /api/oficinas/consolidado-proveedor responde HTTP 200`);
    assert(consolidadoData.totalViandas >= 2, `Total de viandas consolidadas: ${consolidadoData.totalViandas}`);
    assert(Array.isArray(consolidadoData.resumenPlatos) && consolidadoData.resumenPlatos.length >= 2,
      `Resumen de platos desglosado para cocina listo (${consolidadoData.resumenPlatos?.length} variedades)`);
    assert(Array.isArray(consolidadoData.detalleNominal) && consolidadoData.detalleNominal.length >= 2,
      `Remito nominal con detalle de comensales listo (${consolidadoData.detalleNominal?.length} filas)`);

    console.log(`\n${CYAN}>>> RESUMEN DE VIANDAS PARA EL PROVEEDOR:${RESET}`);
    consolidadoData.resumenPlatos.forEach(rp => {
      console.log(`    🍴 ${rp.plato}: ${rp.cantidad} vianda(s)`);
    });

  } catch (err) {
    console.error(`${RED}ERROR INESPERADO:${RESET}`, err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\n${CYAN}========================================================================${RESET}`);
  console.log(`  Total pruebas exitosas: ${GREEN}${passed}${RESET}`);
  console.log(`  Total fallos:           ${failed === 0 ? GREEN : RED}${failed}${RESET}`);
  console.log(`${CYAN}========================================================================\n${RESET}`);
}

testOficinas();
