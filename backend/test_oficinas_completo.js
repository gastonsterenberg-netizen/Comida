const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();
const API_URL = process.env.API_URL || 'http://localhost:3001';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
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
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  SUITE DE PRUEBAS INTEGRALES DE SEGURIDAD Y FUNCIONALIDAD (FASE 5)     ${RESET}`);
  console.log(`${BOLD}${CYAN}  SISTEMA SISAR - MÓDULO OFICINAS PÚBLICAS Y CATERING VERSÁTIL           ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================\n${RESET}`);

  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 2); // Probamos con fecha a 2 días para aislamiento
  const testDateStr = testDate.toISOString().split('T')[0];

  let empleadoToken = null;
  let encargadoToken = null;
  let testPlatoCerradoId = null;
  let testPlatoPrincipalId = null;
  let testGuarnicionId = null;

  try {
    // =========================================================================
    // SECCIÓN 1: AUTENTICACIÓN Y SEGURIDAD DE EMPLEADOS
    // =========================================================================
    console.log(`${BOLD}${YELLOW}[SECCIÓN 1] Pruebas de Autenticación de Empleados (Autoservicio)...${RESET}`);

    // 1.1 Login exitoso con DNI y PIN correcto
    const resLoginEmp = await fetch(`${API_URL}/api/oficinas/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '40111222', pin: '1234' })
    });
    const dataLoginEmp = await resLoginEmp.json();
    assert(resLoginEmp.status === 200, `Login de empleado responde HTTP 200`);
    assert(!!dataLoginEmp.token, `Token JWT generado`);
    assert(dataLoginEmp.empleado?.nombre?.includes('Juan Pérez'), `Identidad correcta: ${dataLoginEmp.empleado?.nombre}`);
    assert(dataLoginEmp.empleado?.hospitalNombre === 'Casa Central - SIPROSA', `Entidad correcta: ${dataLoginEmp.empleado?.hospitalNombre}`);
    empleadoToken = dataLoginEmp.token;

    // 1.2 Rechazo con PIN incorrecto
    const resBadPin = await fetch(`${API_URL}/api/oficinas/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '40111222', pin: '9999' })
    });
    assert(resBadPin.status === 401, `Login con PIN incorrecto rechazado (HTTP 401)`);

    // 1.3 Rechazo con DNI inexistente
    const resBadDni = await fetch(`${API_URL}/api/oficinas/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: '99999999', pin: '1234' })
    });
    assert(resBadDni.status === 404, `Login con DNI inexistente rechazado (HTTP 404)`);

    // 1.4 Rechazo con campos vacíos
    const resEmpty = await fetch(`${API_URL}/api/oficinas/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert(resEmpty.status === 400, `Login con body vacío rechazado (HTTP 400)`);

    // =========================================================================
    // SECCIÓN 2: AUTENTICACIÓN Y SEGURIDAD DEL ENCARGADO (ROL 4)
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 2] Pruebas de Autenticación del Encargado (Rol 4)...${RESET}`);

    // 2.1 Login de Encargado
    const resLoginEnc = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'encargado.central', password: 'Admin1234!' })
    });
    const dataLoginEnc = await resLoginEnc.json();
    assert(resLoginEnc.status === 200, `Login de encargado responde HTTP 200`);
    assert(dataLoginEnc.user?.roleId === 4, `Rol verificado como Rol 4 (Encargado_Oficina)`);
    assert(dataLoginEnc.user?.hospitalName === 'Casa Central - SIPROSA', `Hospital asociado verificado: ${dataLoginEnc.user?.hospitalName}`);
    encargadoToken = dataLoginEnc.token;

    // 2.2 Rechazo de Encargado con contraseña mala
    const resBadEncPw = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'encargado.central', password: 'PasswordErronea' })
    });
    assert(resBadEncPw.status === 401, `Login con contraseña incorrecta rechazado (HTTP 401)`);

    // =========================================================================
    // SECCIÓN 3: CONTROL DE ACCESO (RBAC / AUTORIZACIÓN)
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 3] Pruebas de Autorización y Aislamiento de Roles...${RESET}`);

    // 3.1 Empleado intentando acceder a endpoints del Encargado -> 403 Forbidden
    const resEmpAsAdmin = await fetch(`${API_URL}/api/oficinas/admin/monitoreo?fecha=${testDateStr}`, {
      headers: { Authorization: `Bearer ${empleadoToken}` }
    });
    assert(resEmpAsAdmin.status === 403 || resEmpAsAdmin.status === 401, `Token de empleado denegado en panel de encargado (HTTP ${resEmpAsAdmin.status})`);

    // 3.2 Petición sin token a endpoint administrativo -> 401 Unauthorized
    const resNoToken = await fetch(`${API_URL}/api/oficinas/admin/monitoreo?fecha=${testDateStr}`);
    assert(resNoToken.status === 401, `Acceso anónimo denegado en monitoreo (HTTP 401)`);

    // 3.3 Encargado sí tiene acceso a monitoreo -> 200 OK
    const resEncMon = await fetch(`${API_URL}/api/oficinas/admin/monitoreo?fecha=${testDateStr}`, {
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });
    assert(resEncMon.status === 200, `Token de Encargado autorizado en monitoreo (HTTP 200)`);

    // =========================================================================
    // SECCIÓN 4: GESTIÓN DE MENÚ POR EL ENCARGADO
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 4] Carga y Administración de Menú (Rol 4)...${RESET}`);

    // 4.1 Encargado agrega Plato Cerrado (Opción A)
    const resAddPlatoA = await fetch(`${API_URL}/api/oficinas/admin/menu/opcion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${encargadoToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoPlato: 'PLATO_DEL_DIA',
        numeroOpcion: 1,
        nombrePlato: 'Guiso de Lentejas Casero',
        permiteGuarnicion: false,
        descripcion: 'Con panceta y vegetales frescos'
      })
    });
    const dataAddPlatoA = await resAddPlatoA.json();
    assert(resAddPlatoA.status === 201, `Encargado agrega plato cerrado exitosamente (HTTP 201)`);
    assert(dataAddPlatoA.plato?.NombrePlato === 'Guiso de Lentejas Casero', `Plato guardado: ${dataAddPlatoA.plato?.NombrePlato}`);
    testPlatoCerradoId = dataAddPlatoA.plato?.Id;

    // 4.2 Encargado agrega Plato Principal para armar (Opción B)
    const resAddPlatoB = await fetch(`${API_URL}/api/oficinas/admin/menu/opcion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${encargadoToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        tipoPlato: 'PRINCIPAL',
        numeroOpcion: 2,
        nombrePlato: 'Suprema Napolitana al Horno',
        permiteGuarnicion: true,
        descripcion: 'Con salsa de tomate, jamón y queso'
      })
    });
    const dataAddPlatoB = await resAddPlatoB.json();
    assert(resAddPlatoB.status === 201, `Encargado agrega plato principal (HTTP 201)`);
    testPlatoPrincipalId = dataAddPlatoB.plato?.Id;

    // 4.3 Encargado agrega Guarnición
    const resAddGuarn = await fetch(`${API_URL}/api/oficinas/admin/menu/guarnicion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${encargadoToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        nombreGuarnicion: 'Puré de Calabaza Rústico'
      })
    });
    const dataAddGuarn = await resAddGuarn.json();
    assert(resAddGuarn.status === 201, `Encargado agrega guarnición (HTTP 201)`);
    testGuarnicionId = dataAddGuarn.guarnicion?.Id;

    // 4.4 Empleado consulta el menú y ve los platos recién creados
    const resMenuEmp = await fetch(`${API_URL}/api/oficinas/menu?fecha=${testDateStr}`, {
      headers: { Authorization: `Bearer ${empleadoToken}` }
    });
    const dataMenuEmp = await resMenuEmp.json();
    assert(resMenuEmp.status === 200, `Empleado consulta menú (HTTP 200)`);
    assert(dataMenuEmp.platosDelDia.some(p => p.Id === testPlatoCerradoId), `Plato cerrado visible para empleados`);
    assert(dataMenuEmp.principales.some(p => p.Id === testPlatoPrincipalId), `Plato principal visible para empleados`);
    assert(dataMenuEmp.guarniciones.some(g => g.Id === testGuarnicionId), `Guarnición visible para empleados`);

    // =========================================================================
    // SECCIÓN 5: REGLAS DE NEGOCIO EN PEDIDOS DE VIANDAS
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 5] Registro de Pedidos y Validación de Guarniciones...${RESET}`);

    // 5.1 Rechazo: Pedir plato principal que exige guarnición SIN guarnición
    const resPedSinGuarn = await fetch(`${API_URL}/api/oficinas/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empleadoToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        platoOpcionId: testPlatoPrincipalId
        // falta guarnicionId
      })
    });
    assert(resPedSinGuarn.status === 400, `Pedido de plato principal sin guarnición rechazado (HTTP 400)`);

    // 5.2 Aprobación: Pedir plato principal CON guarnición
    const resPedConGuarn = await fetch(`${API_URL}/api/oficinas/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empleadoToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        platoOpcionId: testPlatoPrincipalId,
        guarnicionId: testGuarnicionId,
        observaciones: 'Por favor sin cebolla'
      })
    });
    const dataPedConGuarn = await resPedConGuarn.json();
    assert(resPedConGuarn.status === 200, `Pedido con plato principal + guarnición aprobado (HTTP 200)`);
    assert(dataPedConGuarn.pedido?.plato === 'Suprema Napolitana al Horno', `Plato confirmado: ${dataPedConGuarn.pedido?.plato}`);
    assert(dataPedConGuarn.pedido?.guarnicion === 'Puré de Calabaza Rústico', `Guarnición confirmada: ${dataPedConGuarn.pedido?.guarnicion}`);

    // 5.3 Verificación Dual-Write en base de datos
    const dbPedido = await prisma.pedidosComida.findFirst({
      where: {
        FechaPedido: new Date(`${testDateStr}T00:00:00.000Z`),
        PlatoOpcionId: testPlatoPrincipalId
      }
    });
    assert(!!dbPedido, `Registro de pedido persistido en tabla PedidosComida`);
    assert(dbPedido?.CanalPedido === 'PORTAL_EMPLEADO', `Canal de pedido guardado como PORTAL_EMPLEADO`);
    assert(!!dbPedido?.AgenteId, `Dual-Write: AgenteId asignado (${dbPedido?.AgenteId})`);
    assert(!!dbPedido?.PersonalId, `Dual-Write: PersonalId asignado (${dbPedido?.PersonalId})`);

    // 5.4 Upsert / Modificación del pedido para el mismo día
    const resCambioPedido = await fetch(`${API_URL}/api/oficinas/pedidos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empleadoToken}` },
      body: JSON.stringify({
        fecha: testDateStr,
        platoOpcionId: testPlatoCerradoId // Cambia a plato cerrado
      })
    });
    const dataCambioPedido = await resCambioPedido.json();
    assert(resCambioPedido.status === 200, `Actualización de vianda para la misma fecha responde HTTP 200`);
    assert(dataCambioPedido.pedido?.plato === 'Guiso de Lentejas Casero', `Vianda modificada correctamente a plato cerrado`);

    // =========================================================================
    // SECCIÓN 6: MONITOREO EN TIEMPO REAL DEL ENCARGADO
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 6] Monitoreo en Tiempo Real y Lista de Pendientes...${RESET}`);

    const resMonitoreoReal = await fetch(`${API_URL}/api/oficinas/admin/monitoreo?fecha=${testDateStr}`, {
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });
    const dataMonitoreoReal = await resMonitoreoReal.json();
    assert(resMonitoreoReal.status === 200, `Monitoreo en tiempo real responde HTTP 200`);
    assert(dataMonitoreoReal.totalPedidos >= 1, `Total viandas pedidas: ${dataMonitoreoReal.totalPedidos}`);
    assert(dataMonitoreoReal.totalHabilitados >= dataMonitoreoReal.totalPedidos, `Nómina (${dataMonitoreoReal.totalHabilitados}) >= Pedidos (${dataMonitoreoReal.totalPedidos})`);
    assert(dataMonitoreoReal.totalPendientes === dataMonitoreoReal.totalHabilitados - dataMonitoreoReal.totalPedidos, `Cálculo de pendientes exacto`);
    
    // Juan Pérez pidió, por lo que NO debe estar en la lista de pendientes
    const juanEnPendientes = dataMonitoreoReal.pendientes.some(p => p.dni === '40111222');
    assert(!juanEnPendientes, `Empleado con pedido realizado no figura en lista de pendientes`);

    // Comprobar que en pedidosRecibidos figure Juan Pérez
    const juanEnPedidos = dataMonitoreoReal.pedidosRecibidos.some(p => p.dni === '40111222');
    assert(juanEnPedidos, `Empleado figura correctamente en pedidos recibidos en vivo`);

    // =========================================================================
    // SECCIÓN 7: INTEGRIDAD REFERENCIAL Y SEGURIDAD AL ELIMINAR PLATOS
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 7] Integridad Referencial al Eliminar Opciones...${RESET}`);

    // 7.1 Intentar eliminar plato con pedido activo -> Debe fallar
    const resDelPlatoActivo = await fetch(`${API_URL}/api/oficinas/admin/menu/opcion/${testPlatoCerradoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });
    assert(resDelPlatoActivo.status === 400, `Eliminación de plato con pedidos activos rechazada (HTTP 400)`);

    // =========================================================================
    // SECCIÓN 8: CANCELACIÓN DE VIANDA POR EL EMPLEADO
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 8] Cancelación de Vianda y Reflejo en Monitoreo...${RESET}`);

    // 8.1 Empleado cancela su vianda
    const resCancel = await fetch(`${API_URL}/api/oficinas/pedidos`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${empleadoToken}` },
      body: JSON.stringify({ fecha: testDateStr })
    });
    assert(resCancel.status === 200, `Cancelación de vianda responde HTTP 200`);

    // 8.2 Ahora que no tiene pedido, el plato cerrado SÍ puede ser eliminado
    const resDelPlatoLibre = await fetch(`${API_URL}/api/oficinas/admin/menu/opcion/${testPlatoCerradoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });
    assert(resDelPlatoLibre.status === 200, `Plato sin pedidos se elimina correctamente (HTTP 200)`);

    // 8.3 Limpieza: eliminar el principal y la guarnición de prueba
    await fetch(`${API_URL}/api/oficinas/admin/menu/opcion/${testPlatoPrincipalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });
    await fetch(`${API_URL}/api/oficinas/admin/menu/guarnicion/${testGuarnicionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });

    // =========================================================================
    // SECCIÓN 9: CONSOLIDADO PARA PROVEEDOR (REMITO CATERING)
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 9] Remito Consolidado para Proveedor de Catering...${RESET}`);

    const resRemito = await fetch(`${API_URL}/api/oficinas/consolidado-proveedor?fecha=2026-10-07`, {
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });
    const dataRemito = await resRemito.json();
    assert(resRemito.status === 200, `Consolidado de proveedor responde HTTP 200`);
    assert(dataRemito.oficina?.nombre === 'Casa Central - SIPROSA', `Oficina en remito: ${dataRemito.oficina?.nombre}`);
    assert(!!dataRemito.oficina?.proveedorNombre, `Proveedor presente: ${dataRemito.oficina?.proveedorNombre}`);
    assert(Array.isArray(dataRemito.resumenPlatos), `Desglose de platos generado`);
    assert(Array.isArray(dataRemito.detalleNominal), `Remito nominal generado`);

    // =========================================================================
    // SECCIÓN 10: ESTABILIDAD DEL RESTO DEL SISTEMA HOSPITALARIO
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}[SECCIÓN 10] Verificación de Regla de Impacto Cero en Hospitales...${RESET}`);

    // Consultar hospitales existentes para asegurar que no se rompieron
    const resHospitales = await fetch(`${API_URL}/api/hospitals`, {
      headers: { Authorization: `Bearer ${encargadoToken}` }
    });
    assert(resHospitales.status === 200, `API de Hospitales existente responde HTTP 200 sin alteraciones`);

    console.log(`\n${BOLD}${CYAN}========================================================================${RESET}`);
    console.log(`${BOLD}${GREEN}  PRUEBAS COMPLETADAS CON ÉXITO: ${passed} pasadas${RESET}`);
    if (failed > 0) {
      console.log(`${BOLD}${RED}  PRUEBAS FALLIDAS:              ${failed} fallos${RESET}`);
    } else {
      console.log(`${BOLD}${GREEN}  FALLOS REGISTRADOS:            0 (100% de efectividad)${RESET}`);
    }
    console.log(`${BOLD}${CYAN}========================================================================\n${RESET}`);

  } catch (err) {
    console.error(`${RED}Error durante la ejecución del suite:${RESET}`, err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
