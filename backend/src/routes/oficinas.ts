import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_change_in_production';

// Middleware para verificar sesión del empleado de oficina
export const authenticateEmpleado = async (req: Request, res: Response, next: Function): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Token no provisto. Ingrese con su DNI y PIN.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err || !user) {
      res.status(401).json({ error: 'Sesión expirada o inválida. Vuelva a ingresar su PIN.' });
      return;
    }
    (req as any).empleado = user;
    next();
  });
};

// -----------------------------------------------------------------------------
// 1. LOGIN DE EMPLEADO (DNI + PIN de 4 dígitos)
// -----------------------------------------------------------------------------
router.post('/auth/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { dni, pin, nuevoPin } = req.body;

    if (!dni) {
      res.status(400).json({ error: 'Debe ingresar su número de DNI.' });
      return;
    }

    const cleanDni = String(dni).trim();

    // Buscar al empleado en PadronHabilitados
    const padron = await prisma.padronHabilitados.findUnique({
      where: { DNI: cleanDni },
      include: {
        Hospital: true,
        Servicio: true,
        Personal: {
          where: { Activo: true },
          include: { Hospital: true, Servicio: true }
        }
      }
    });

    if (!padron || !padron.Activo) {
      res.status(404).json({ error: 'El DNI no se encuentra empadronado o está inactivo. Consulte con su Encargado de Oficina.' });
      return;
    }

    // Determinar la oficina y servicio del empleado
    const hospital = padron.Hospital || (padron.Personal[0] && padron.Personal[0].Hospital);
    const servicio = padron.Servicio || (padron.Personal[0] && padron.Personal[0].Servicio);

    if (!hospital) {
      res.status(400).json({ error: 'El empleado no tiene una oficina asignada.' });
      return;
    }

    if (hospital.TipoEntidad !== 'OFICINA') {
      res.status(403).json({ error: 'Este portal de viandas es exclusivo para personal de Oficinas Administrativas.' });
      return;
    }

    // Caso A: El empleado nunca configuró su PIN (primer ingreso)
    if (!padron.PinAcceso) {
      if (!nuevoPin) {
        res.json({
          requiereConfigurarPin: true,
          nombreCompleto: padron.NombreCompleto,
          oficinaNombre: hospital.Nombre,
          mensaje: 'Es tu primer ingreso. Por favor define un PIN numérico de 4 dígitos para tus pedidos.'
        });
        return;
      }

      // Validar nuevo PIN (4 dígitos numéricos)
      if (!/^\d{4}$/.test(nuevoPin)) {
        res.status(400).json({ error: 'El PIN debe ser exactamente de 4 dígitos numéricos.' });
        return;
      }

      await prisma.padronHabilitados.update({
        where: { Id: padron.Id },
        data: { PinAcceso: String(nuevoPin) }
      });
      padron.PinAcceso = String(nuevoPin);
    }

    // Caso B: Validar PIN existente
    if (padron.PinAcceso !== String(pin)) {
      res.status(401).json({ error: 'PIN incorrecto. Intente nuevamente o solicite el blanqueo a su Encargado.' });
      return;
    }

    // Generar Token de Sesión de Empleado
    const sessionToken = jwt.sign(
      {
        dni: padron.DNI,
        agenteId: padron.Id,
        nombre: padron.NombreCompleto,
        hospitalId: hospital.Id,
        hospitalNombre: hospital.Nombre,
        servicioId: servicio ? servicio.Id : null,
        servicioNombre: servicio ? servicio.Nombre : 'Sede General',
        tipoRol: 'EMPLEADO_OFICINA'
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      message: 'Ingreso exitoso',
      token: sessionToken,
      empleado: {
        dni: padron.DNI,
        nombre: padron.NombreCompleto,
        hospitalId: hospital.Id,
        hospitalNombre: hospital.Nombre,
        servicioId: servicio ? servicio.Id : null,
        servicioNombre: servicio ? servicio.Nombre : 'Sede General',
        limiteAlmuerzo: hospital.LimiteAlmuerzo || '10:30'
      }
    });

  } catch (error) {
    console.error('[Error Oficinas Login]:', error);
    res.status(500).json({ error: 'Error interno del servidor al autenticar empleado.' });
  }
});

// -----------------------------------------------------------------------------
// 2. CONSULTAR MENÚ DEL DÍA (Platos Fijos vs Menú para Armar)
// -----------------------------------------------------------------------------
router.get('/menu', authenticateEmpleado, async (req: Request, res: Response): Promise<void> => {
  try {
    const empleado = (req as any).empleado;
    const { fecha } = req.query;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : todayStr;
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    // Obtener información de la oficina
    const hospital = await prisma.hospitales.findUnique({
      where: { Id: empleado.hospitalId }
    });

    if (!hospital) {
      res.status(404).json({ error: 'Oficina no encontrada.' });
      return;
    }

    // Obtener platos del día y platos principales
    const opcionesMenu = await prisma.menuOficinaOpciones.findMany({
      where: {
        HospitalId: hospital.Id,
        Fecha: targetDate
      },
      orderBy: { NumeroOpcion: 'asc' }
    });

    // Obtener guarniciones disponibles
    const guarniciones = await prisma.menuOficinaGuarniciones.findMany({
      where: {
        HospitalId: hospital.Id,
        Fecha: targetDate
      },
      orderBy: { NombreGuarnicion: 'asc' }
    });

    // Separar platos del día (cerrados) de platos principales (para armar)
    const platosDelDia = opcionesMenu.filter(o => o.TipoPlato === 'PLATO_DEL_DIA');
    const principales = opcionesMenu.filter(o => o.TipoPlato === 'PRINCIPAL');

    // Verificar si el empleado ya tiene un pedido realizado para esta fecha
    const pedidoExistente = await prisma.pedidosComida.findFirst({
      where: {
        AgenteId: empleado.agenteId,
        FechaPedido: targetDate,
        Estado: { in: ['Aprobado', 'Pendiente', 'Entregado'] }
      },
      include: {
        PlatoOpcion: true,
        Guarnicion: true
      }
    });

    // Evaluar si aún está dentro del horario límite de pedido
    let dentroDeHorario = true;
    if (targetDateStr === todayStr) {
      const limiteAlmuerzo = hospital.LimiteAlmuerzo || '10:30';
      const [limH, limM] = limiteAlmuerzo.split(':').map(Number);
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();
      if (currentTotalMins >= limH * 60 + limM) {
        dentroDeHorario = false;
      }
    }

    res.json({
      fecha: targetDateStr,
      oficina: {
        id: hospital.Id,
        nombre: hospital.Nombre,
        limiteAlmuerzo: hospital.LimiteAlmuerzo || '10:30',
        proveedorNombre: hospital.ProveedorNombre,
        proveedorTelefono: hospital.ProveedorTelefono,
        dentroDeHorario
      },
      platosDelDia,
      principales,
      guarniciones,
      pedidoExistente: pedidoExistente ? {
        id: pedidoExistente.Id,
        fecha: targetDateStr,
        estado: pedidoExistente.Estado,
        platoOpcionId: pedidoExistente.PlatoOpcionId,
        nombrePlato: pedidoExistente.PlatoOpcion?.NombrePlato || 'Vianda Estándar',
        guarnicionId: pedidoExistente.GuarnicionId,
        nombreGuarnicion: pedidoExistente.Guarnicion?.NombreGuarnicion || null,
        observaciones: pedidoExistente.JustificacionSolicitud
      } : null
    });

  } catch (error) {
    console.error('[Error Oficinas Menu]:', error);
    res.status(500).json({ error: 'Error al consultar el menú del día.' });
  }
});

// -----------------------------------------------------------------------------
// 3. REGISTRAR O ACTUALIZAR PEDIDO DE VIANDA DE EMPLEADO
// -----------------------------------------------------------------------------
router.post('/pedidos', authenticateEmpleado, async (req: Request, res: Response): Promise<void> => {
  try {
    const empleado = (req as any).empleado;
    const { fecha, platoOpcionId, guarnicionId, observaciones } = req.body;

    if (!platoOpcionId) {
      res.status(400).json({ error: 'Debe seleccionar un plato del menú.' });
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : todayStr;
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    // Validar horario límite de la oficina
    const hospital = await prisma.hospitales.findUnique({ where: { Id: empleado.hospitalId } });
    if (!hospital) {
      res.status(404).json({ error: 'Oficina no encontrada.' });
      return;
    }

    if (targetDateStr === todayStr) {
      const limiteAlmuerzo = hospital.LimiteAlmuerzo || '10:30';
      const [limH, limM] = limiteAlmuerzo.split(':').map(Number);
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();
      if (currentTotalMins >= limH * 60 + limM) {
        res.status(400).json({ error: `El horario límite de pedido para hoy (${limiteAlmuerzo} hs) ha vencido.` });
        return;
      }
    }

    // Validar opción de plato elegida
    const platoOpcion = await prisma.menuOficinaOpciones.findUnique({
      where: { Id: Number(platoOpcionId) }
    });

    if (!platoOpcion || platoOpcion.HospitalId !== hospital.Id) {
      res.status(400).json({ error: 'La opción de plato seleccionada no es válida para esta oficina.' });
      return;
    }

    // Validar si requiere guarnición
    let finalGuarnicionId: number | null = null;
    if (platoOpcion.PermiteGuarnicion) {
      if (!guarnicionId) {
        res.status(400).json({ error: 'Este plato principal requiere elegir una guarnición o acompañamiento.' });
        return;
      }
      const guarnicion = await prisma.menuOficinaGuarniciones.findUnique({
        where: { Id: Number(guarnicionId) }
      });
      if (!guarnicion || guarnicion.HospitalId !== hospital.Id) {
        res.status(400).json({ error: 'La guarnición seleccionada no es válida.' });
        return;
      }
      finalGuarnicionId = guarnicion.Id;
    }

    // Buscar registro de Personal activo para Dual-Write
    const personal = await prisma.personal.findFirst({
      where: { DNI: empleado.dni, HospitalId: hospital.Id, Activo: true }
    });

    // Buscar encargado de la oficina o primer admin para asociar SolicitadoPorUsuarioId
    const encargado = await prisma.usuarios.findFirst({
      where: { HospitalId: hospital.Id, RolId: 4, Activo: true }
    }) || await prisma.usuarios.findFirst({ where: { RolId: 1, Activo: true } });

    const usuarioId = encargado ? encargado.Id : 1;

    // Verificar si ya tiene pedido registrado para esta fecha (Upsert/Actualización)
    const pedidoExistente = await prisma.pedidosComida.findFirst({
      where: {
        AgenteId: empleado.agenteId,
        FechaPedido: targetDate,
        TipoComida: 'Almuerzo'
      }
    });

    let pedidoFinal;
    if (pedidoExistente) {
      // Actualizar selección
      pedidoFinal = await prisma.pedidosComida.update({
        where: { Id: pedidoExistente.Id },
        data: {
          PlatoOpcionId: platoOpcion.Id,
          GuarnicionId: finalGuarnicionId,
          CanalPedido: 'PORTAL_EMPLEADO',
          JustificacionSolicitud: observaciones || null,
          Estado: 'Aprobado'
        },
        include: { PlatoOpcion: true, Guarnicion: true }
      });
    } else {
      // Crear nuevo pedido con Dual-Write completo
      pedidoFinal = await prisma.pedidosComida.create({
        data: {
          FechaPedido: targetDate,
          TipoComida: 'Almuerzo',
          TipoDieta: 'Normal',
          PersonalId: personal ? personal.Id : null,
          AgenteId: empleado.agenteId,
          PlatoOpcionId: platoOpcion.Id,
          GuarnicionId: finalGuarnicionId,
          CanalPedido: 'PORTAL_EMPLEADO',
          SolicitadoPorUsuarioId: usuarioId,
          Estado: 'Aprobado',
          JustificacionSolicitud: observaciones || null
        },
        include: { PlatoOpcion: true, Guarnicion: true }
      });
    }

    res.json({
      message: '¡Vianda confirmada exitosamente!',
      pedido: {
        id: pedidoFinal.Id,
        fecha: targetDateStr,
        plato: pedidoFinal.PlatoOpcion?.NombrePlato,
        guarnicion: pedidoFinal.Guarnicion?.NombreGuarnicion || 'Sin guarnición (Plato completo)',
        observaciones: pedidoFinal.JustificacionSolicitud
      }
    });

  } catch (error) {
    console.error('[Error Oficinas Guardar Pedido]:', error);
    res.status(500).json({ error: 'Error al registrar su pedido de vianda.' });
  }
});

// -----------------------------------------------------------------------------
// 4. CANCELAR PEDIDO DE VIANDA
// -----------------------------------------------------------------------------
router.delete('/pedidos', authenticateEmpleado, async (req: Request, res: Response): Promise<void> => {
  try {
    const empleado = (req as any).empleado;
    const { fecha } = req.body;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : todayStr;
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    // Validar horario límite
    const hospital = await prisma.hospitales.findUnique({ where: { Id: empleado.hospitalId } });
    if (hospital && targetDateStr === todayStr) {
      const limiteAlmuerzo = hospital.LimiteAlmuerzo || '10:30';
      const [limH, limM] = limiteAlmuerzo.split(':').map(Number);
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();
      if (currentTotalMins >= limH * 60 + limM) {
        res.status(400).json({ error: `No es posible cancelar el pedido: el horario límite (${limiteAlmuerzo} hs) ha vencido.` });
        return;
      }
    }

    const pedido = await prisma.pedidosComida.findFirst({
      where: {
        AgenteId: empleado.agenteId,
        FechaPedido: targetDate,
        TipoComida: 'Almuerzo'
      }
    });

    if (!pedido) {
      res.status(404).json({ error: 'No se encontró ningún pedido para cancelar en esta fecha.' });
      return;
    }

    await prisma.pedidosComida.delete({ where: { Id: pedido.Id } });
    res.json({ message: 'Pedido cancelado correctamente.' });

  } catch (error) {
    console.error('[Error Cancelar Pedido Oficinas]:', error);
    res.status(500).json({ error: 'Error al cancelar el pedido.' });
  }
});

// Middleware para verificar que el usuario sea Encargado de Oficina (Rol 4) o Administrador (Rol 1)
export const authenticateEncargado = async (req: Request, res: Response, next: Function): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Token de autenticación no provisto. Inicie sesión como Encargado.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err: any, decodedUser: any) => {
    if (err || !decodedUser) {
      res.status(401).json({ error: 'Sesión expirada o token inválido.' });
      return;
    }
    // Permitir Rol 4 (Encargado_Oficina) o Rol 1 (Admin)
    if (decodedUser.roleId !== 4 && decodedUser.roleId !== 1) {
      res.status(403).json({ error: 'Acceso denegado: Se requiere rol de Encargado de Oficina (Rol 4) o Administrador.' });
      return;
    }
    (req as any).user = decodedUser;
    next();
  });
};

// -----------------------------------------------------------------------------
// 5. CONSOLIDADO DE VIANDAS PARA PROVEEDOR DE CATERING (Encargado / Proveedor)
// -----------------------------------------------------------------------------
router.get('/consolidado-proveedor', authenticateEncargado, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { fecha, hospitalId } = req.query;

    const targetHospitalId = hospitalId ? Number(hospitalId) : (user.hospitalId || 1060);
    if (!targetHospitalId) {
      res.status(400).json({ error: 'Debe especificar el hospitalId u oficina.' });
      return;
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : todayStr;
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    const hospital = await prisma.hospitales.findUnique({ where: { Id: targetHospitalId } });
    if (!hospital) {
      res.status(404).json({ error: 'Oficina no encontrada.' });
      return;
    }

    // Obtener todos los pedidos aprobados de la oficina para esa fecha
    const pedidos = await prisma.pedidosComida.findMany({
      where: {
        FechaPedido: targetDate,
        Estado: { in: ['Aprobado', 'Entregado'] },
        OR: [
          { Agente: { HospitalId: targetHospitalId } },
          { Personal: { HospitalId: targetHospitalId } }
        ]
      },
      include: {
        Agente: { include: { Servicio: true } },
        Personal: { include: { Servicio: true } },
        PlatoOpcion: true,
        Guarnicion: true
      }
    });

    // Desglose por platos y guarniciones
    const conteoPlatos: { [key: string]: number } = {};
    const conteoSectores: { [key: string]: number } = {};

    pedidos.forEach(p => {
      // Etiqueta del plato
      let etiquetaPlato = p.PlatoOpcion?.NombrePlato || p.TipoDieta || 'Vianda Estándar';
      if (p.Guarnicion) {
        etiquetaPlato += ` + ${p.Guarnicion.NombreGuarnicion}`;
      }
      conteoPlatos[etiquetaPlato] = (conteoPlatos[etiquetaPlato] || 0) + 1;

      // Sector
      const sector = p.Agente?.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || 'Sector General';
      conteoSectores[sector] = (conteoSectores[sector] || 0) + 1;
    });

    const resumenPlatos = Object.entries(conteoPlatos).map(([plato, cantidad]) => ({ plato, cantidad }));
    const resumenSectores = Object.entries(conteoSectores).map(([sector, cantidad]) => ({ sector, cantidad }));

    // Detalle nominal para remito
    const detalleNominal = pedidos.map(p => ({
      pedidoId: p.Id,
      dni: p.Agente?.DNI || p.Personal?.DNI,
      nombreCompleto: p.Agente?.NombreCompleto || p.Personal?.NombreCompleto,
      sector: p.Agente?.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || 'Sede General',
      plato: p.PlatoOpcion?.NombrePlato || p.TipoDieta || 'Estándar',
      guarnicion: p.Guarnicion?.NombreGuarnicion || '-',
      observaciones: p.JustificacionSolicitud || '-'
    }));

    res.json({
      oficina: {
        id: hospital.Id,
        nombre: hospital.Nombre,
        proveedorNombre: hospital.ProveedorNombre || 'Catering Sabores Gourmet',
        proveedorTelefono: hospital.ProveedorTelefono || '-'
      },
      fecha: targetDateStr,
      totalViandas: pedidos.length,
      resumenPlatos,
      resumenSectores,
      detalleNominal
    });

  } catch (error) {
    console.error('[Error Consolidado Proveedor]:', error);
    res.status(500).json({ error: 'Error al generar consolidado de proveedor.' });
  }
});

// -----------------------------------------------------------------------------
// 6. MONITOREO EN TIEMPO REAL PARA EL ENCARGADO (ROL 4)
// -----------------------------------------------------------------------------
router.get('/admin/monitoreo', authenticateEncargado, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { fecha, hospitalId } = req.query;
    const targetHospitalId = hospitalId ? Number(hospitalId) : (user.hospitalId || 1060);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : todayStr;
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    const hospital = await prisma.hospitales.findUnique({
      where: { Id: targetHospitalId }
    });

    if (!hospital) {
      res.status(404).json({ error: 'Oficina no encontrada.' });
      return;
    }

    // Empleados empadronados activos en la oficina
    const padron = await prisma.padronHabilitados.findMany({
      where: {
        Activo: true,
        OR: [
          { HospitalId: targetHospitalId },
          { Personal: { some: { HospitalId: targetHospitalId, Activo: true } } }
        ]
      },
      include: {
        Servicio: true
      },
      orderBy: { NombreCompleto: 'asc' }
    });

    // Pedidos realizados para la fecha
    const pedidos = await prisma.pedidosComida.findMany({
      where: {
        FechaPedido: targetDate,
        Estado: { in: ['Aprobado', 'Entregado', 'Pendiente'] },
        OR: [
          { Agente: { HospitalId: targetHospitalId } },
          { Personal: { HospitalId: targetHospitalId } }
        ]
      },
      include: {
        Agente: { include: { Servicio: true } },
        Personal: { include: { Servicio: true } },
        PlatoOpcion: true,
        Guarnicion: true
      },
      orderBy: { FechaCreacion: 'desc' }
    });

    const dniPedidosSet = new Set(pedidos.map(p => p.Agente?.DNI || p.Personal?.DNI));

    // Desglose de pedidos recibidos
    const pedidosRecibidos = pedidos.map(p => ({
      pedidoId: p.Id,
      dni: p.Agente?.DNI || p.Personal?.DNI,
      nombreCompleto: p.Agente?.NombreCompleto || p.Personal?.NombreCompleto,
      sector: p.Agente?.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || 'Sector General',
      plato: p.PlatoOpcion?.NombrePlato || p.TipoDieta || 'Vianda Estándar',
      guarnicion: p.Guarnicion?.NombreGuarnicion || null,
      observaciones: p.JustificacionSolicitud || null,
      hora: p.FechaCreacion.toISOString().substring(11, 16),
      canal: p.CanalPedido || 'PORTAL_EMPLEADO'
    }));

    // Empleados pendientes de pedir
    const pendientes = padron
      .filter(emp => !dniPedidosSet.has(emp.DNI))
      .map(emp => ({
        dni: emp.DNI,
        nombreCompleto: emp.NombreCompleto,
        sector: emp.Servicio?.Nombre || 'Sector General'
      }));

    // Conteo por Plato
    const conteoPlatos: { [key: string]: number } = {};
    pedidos.forEach(p => {
      let key = p.PlatoOpcion?.NombrePlato || p.TipoDieta || 'Vianda Estándar';
      if (p.Guarnicion) {
        key += ` + ${p.Guarnicion.NombreGuarnicion}`;
      }
      conteoPlatos[key] = (conteoPlatos[key] || 0) + 1;
    });

    // Conteo por Sector
    const conteoSectores: { [key: string]: number } = {};
    pedidos.forEach(p => {
      const sector = p.Agente?.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || 'Sector General';
      conteoSectores[sector] = (conteoSectores[sector] || 0) + 1;
    });

    res.json({
      oficina: {
        id: hospital.Id,
        nombre: hospital.Nombre,
        limiteAlmuerzo: hospital.LimiteAlmuerzo || '10:30',
        proveedorNombre: hospital.ProveedorNombre || 'Catering Sabores Gourmet',
        proveedorTelefono: hospital.ProveedorTelefono || '-'
      },
      fecha: targetDateStr,
      totalHabilitados: padron.length,
      totalPedidos: pedidos.length,
      totalPendientes: pendientes.length,
      porcentajeCompletado: padron.length > 0 ? Math.round((pedidos.length / padron.length) * 100) : 0,
      pedidosRecibidos,
      pendientes,
      conteoPlatos: Object.entries(conteoPlatos).map(([plato, cantidad]) => ({ plato, cantidad })),
      conteoSectores: Object.entries(conteoSectores).map(([sector, cantidad]) => ({ sector, cantidad }))
    });
  } catch (error) {
    console.error('[Error Monitoreo Oficinas]:', error);
    res.status(500).json({ error: 'Error al obtener datos de monitoreo en tiempo real.' });
  }
});

// -----------------------------------------------------------------------------
// 7. GESTIÓN DE MENÚ POR EL ENCARGADO (ROL 4)
// -----------------------------------------------------------------------------

// Consulta de Menú Administrativo
router.get('/admin/menu', authenticateEncargado, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { fecha, hospitalId } = req.query;
    const targetHospitalId = hospitalId ? Number(hospitalId) : (user.hospitalId || 1060);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : todayStr;
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    const opciones = await prisma.menuOficinaOpciones.findMany({
      where: {
        HospitalId: targetHospitalId,
        Fecha: targetDate
      },
      orderBy: { NumeroOpcion: 'asc' }
    });

    const guarniciones = await prisma.menuOficinaGuarniciones.findMany({
      where: {
        HospitalId: targetHospitalId,
        Fecha: targetDate
      },
      orderBy: { NombreGuarnicion: 'asc' }
    });

    res.json({
      fecha: targetDateStr,
      platosDelDia: opciones.filter(o => o.TipoPlato === 'PLATO_DEL_DIA'),
      principales: opciones.filter(o => o.TipoPlato === 'PRINCIPAL'),
      guarniciones
    });
  } catch (error) {
    console.error('[Error Admin Get Menu]:', error);
    res.status(500).json({ error: 'Error al consultar menú de oficina.' });
  }
});

// Crear plato (Cerrado o Principal)
router.post('/admin/menu/opcion', authenticateEncargado, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { fecha, tipoPlato, numeroOpcion, nombrePlato, permiteGuarnicion, descripcion } = req.body;

    if (!nombrePlato || !nombrePlato.trim()) {
      res.status(400).json({ error: 'El nombre del plato es obligatorio.' });
      return;
    }

    const hospitalId = user.hospitalId || 1060;
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : new Date().toISOString().split('T')[0];
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    const plato = await prisma.menuOficinaOpciones.create({
      data: {
        HospitalId: hospitalId,
        Fecha: targetDate,
        TipoPlato: tipoPlato === 'PRINCIPAL' ? 'PRINCIPAL' : 'PLATO_DEL_DIA',
        NumeroOpcion: Number(numeroOpcion) || 1,
        NombrePlato: String(nombrePlato).trim(),
        PermiteGuarnicion: Boolean(permiteGuarnicion),
        Descripcion: descripcion ? String(descripcion).trim() : null,
        CreadoPorUsuarioId: user.userId
      }
    });

    res.status(201).json({ message: 'Plato agregado al menú.', plato });
  } catch (error) {
    console.error('[Error Admin Crear Plato]:', error);
    res.status(500).json({ error: 'Error al agregar plato al menú.' });
  }
});

// Eliminar plato
router.delete('/admin/menu/opcion/:id', authenticateEncargado, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const opcionId = Number(req.params.id);
    const hospitalId = user.hospitalId || 1060;

    const plato = await prisma.menuOficinaOpciones.findFirst({
      where: { Id: opcionId, HospitalId: hospitalId }
    });

    if (!plato) {
      res.status(404).json({ error: 'Plato no encontrado o no pertenece a su oficina.' });
      return;
    }

    const pedidosAsociados = await prisma.pedidosComida.count({
      where: { PlatoOpcionId: opcionId }
    });

    if (pedidosAsociados > 0) {
      res.status(400).json({ error: `No se puede eliminar el plato: ya cuenta con ${pedidosAsociados} pedido(s) registrado(s).` });
      return;
    }

    await prisma.menuOficinaOpciones.delete({ where: { Id: opcionId } });
    res.json({ message: 'Plato eliminado del menú correctamente.' });
  } catch (error) {
    console.error('[Error Admin Eliminar Plato]:', error);
    res.status(500).json({ error: 'Error al eliminar plato del menú.' });
  }
});

// Crear guarnición
router.post('/admin/menu/guarnicion', authenticateEncargado, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { fecha, nombreGuarnicion } = req.body;

    if (!nombreGuarnicion || !nombreGuarnicion.trim()) {
      res.status(400).json({ error: 'El nombre de la guarnición es obligatorio.' });
      return;
    }

    const hospitalId = user.hospitalId || 1060;
    const targetDateStr = (fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) ? String(fecha) : new Date().toISOString().split('T')[0];
    const targetDate = new Date(`${targetDateStr}T00:00:00.000Z`);

    const guarnicion = await prisma.menuOficinaGuarniciones.create({
      data: {
        HospitalId: hospitalId,
        Fecha: targetDate,
        NombreGuarnicion: String(nombreGuarnicion).trim(),
        CreadoPorUsuarioId: user.userId
      }
    });

    res.status(201).json({ message: 'Guarnición agregada.', guarnicion });
  } catch (error) {
    console.error('[Error Admin Crear Guarnición]:', error);
    res.status(500).json({ error: 'Error al agregar guarnición.' });
  }
});

// Eliminar guarnición
router.delete('/admin/menu/guarnicion/:id', authenticateEncargado, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const guarnicionId = Number(req.params.id);
    const hospitalId = user.hospitalId || 1060;

    const guarnicion = await prisma.menuOficinaGuarniciones.findFirst({
      where: { Id: guarnicionId, HospitalId: hospitalId }
    });

    if (!guarnicion) {
      res.status(404).json({ error: 'Guarnición no encontrada o no pertenece a su oficina.' });
      return;
    }

    const pedidosAsociados = await prisma.pedidosComida.count({
      where: { GuarnicionId: guarnicionId }
    });

    if (pedidosAsociados > 0) {
      res.status(400).json({ error: `No se puede eliminar la guarnición: ya cuenta con ${pedidosAsociados} pedido(s) registrado(s).` });
      return;
    }

    await prisma.menuOficinaGuarniciones.delete({ where: { Id: guarnicionId } });
    res.json({ message: 'Guarnición eliminada correctamente.' });
  } catch (error) {
    console.error('[Error Admin Eliminar Guarnición]:', error);
    res.status(500).json({ error: 'Error al eliminar guarnición.' });
  }
});

export default router;
