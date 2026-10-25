import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import dotenv from 'dotenv';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import * as xlsx from 'xlsx';
import { authenticateToken, isGerente, isJefeServicio, isNutricion, isTotem } from './middleware/auth';
import { logAudit } from './utils/audit';
import { extractDniFromScan } from './utils/scan';
import crypto from 'crypto';
import oficinasRouter from './routes/oficinas';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/api/oficinas', oficinasRouter);

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function isPasswordSecure(password: string): boolean {
  if (!password) return false;
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/.test(password);

  return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
}

function handleApiError(res: Response, prefix: string, error: any, statusCode: number = 500) {
  console.error(`[API Error] ${prefix}:`, error);
  const prismaCode = error?.code;
  let userMessage = prefix;
  let details = error?.message || String(error);

  if (prismaCode === 'P2002') {
    const target = error?.meta?.target ? (Array.isArray(error.meta.target) ? error.meta.target.join(', ') : error.meta.target) : 'campo único';
    userMessage = `${prefix}: Ya existe un registro con el mismo valor en el campo "${target}".`;
    return res.status(400).json({
      error: userMessage,
      details: `Violación de restricción única (P2002) en: ${target}`,
      code: 'PRISMA_P2002',
      target: target
    });
  }

  if (prismaCode === 'P2003') {
    userMessage = `${prefix}: Conflicto con un registro relacionado (clave foránea).`;
    return res.status(400).json({
      error: userMessage,
      details: error.message,
      code: 'PRISMA_P2003'
    });
  }

  if (prismaCode === 'P2025') {
    userMessage = `${prefix}: El registro solicitado no fue encontrado.`;
    return res.status(404).json({
      error: userMessage,
      details: error.message,
      code: 'PRISMA_P2025'
    });
  }

  return res.status(statusCode).json({
    error: userMessage,
    details: details,
    code: prismaCode || 'INTERNAL_ERROR'
  });
}

// --- AUTHENTICATION ENDPOINTS ---

// 2.2 Registro (solo para propósito de semilla/pruebas, en producción lo hace RRHH)
app.post('/api/auth/register', async (req: Request, res: Response): Promise<void> => {
  const { username, password, roleId, hospitalId, servicioId } = req.body;
  if (!isPasswordSecure(password)) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, incluir una letra mayúscula, una letra minúscula, un número y un carácter especial.' });
    return;
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.usuarios.create({
      data: {
        NombreUsuario: username,
        ContrasenaHash: hashedPassword,
        RolId: roleId,
        HospitalId: hospitalId || null,
        ServicioId: servicioId || null,
      },
    });
    res.json({ message: 'Usuario creado exitosamente', userId: user.Id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// 2.2 & 2.3 Login Inicial (2FA removido, login directo)
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  try {
    const user = await prisma.usuarios.findUnique({ 
      where: { NombreUsuario: username },
      include: { Hospital: true, Servicio: true }
    });
    if (!user) {
      await logAudit(req, 'LOGIN_FALLIDO', `Intento con usuario: ${username}`);
      res.status(401).json({ error: 'Usuario o contraseña errónea' });
      return;
    }

    if (user.Activo === false) {
      await logAudit(req, 'LOGIN_RECHAZADO', `Intento de acceso con cuenta inhabilitada: ${username}`, user.Id);
      res.status(403).json({ error: 'Su usuario se encuentra inhabilitado. Acceso denegado.' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.ContrasenaHash);
    if (!isValidPassword) {
      await logAudit(req, 'LOGIN_FALLIDO', `Contraseña incorrecta`, user.Id);
      res.status(401).json({ error: 'Usuario o contraseña errónea' });
      return;
    }

    // Generar token de sesión final directamente
    const sessionToken = jwt.sign(
      {
        userId: user.Id,
        roleId: user.RolId,
        hospitalId: user.HospitalId,
        servicioId: user.ServicioId,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    if (user.DebeCambiarContrasena) {
      res.json({
        message: 'Debe cambiar su contraseña en el primer login',
        requirePasswordChange: true,
        tempToken: sessionToken,
        user: {
          id: user.Id,
          username: user.NombreUsuario
        }
      });
      return;
    }

    res.json({
      message: 'Login exitoso',
      token: sessionToken,
      user: {
        id: user.Id,
        username: user.NombreUsuario,
        roleId: user.RolId,
        hospitalId: user.HospitalId,
        hospitalName: user.Hospital ? user.Hospital.Nombre : null,
        servicioId: user.ServicioId,
        servicioName: user.Servicio ? user.Servicio.Nombre : null
      }
    });
    
    await logAudit(req, 'LOGIN_EXITOSO', undefined, user.Id);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en login' });
  }
});

app.post('/api/auth/change-password', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { newPassword } = req.body;
  const userId = req.user?.userId;

  if (!userId || !newPassword) {
    res.status(400).json({ error: 'Datos incompletos' });
    return;
  }

  if (!isPasswordSecure(newPassword)) {
    res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres, incluir una letra mayúscula, una letra minúscula, un número y un carácter especial.' });
    return;
  }

  try {
    const user = await prisma.usuarios.findUnique({
      where: { Id: userId },
      include: { Hospital: true, Servicio: true }
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.usuarios.update({
      where: { Id: userId },
      data: {
        ContrasenaHash: hashedPassword,
        DebeCambiarContrasena: false
      }
    });

    const sessionToken = jwt.sign(
      {
        userId: user.Id,
        roleId: user.RolId,
        hospitalId: user.HospitalId,
        servicioId: user.ServicioId,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      message: 'Contraseña actualizada exitosamente',
      token: sessionToken,
      user: {
        id: user.Id,
        username: user.NombreUsuario,
        roleId: user.RolId,
        hospitalId: user.HospitalId,
        hospitalName: user.Hospital ? user.Hospital.Nombre : null,
        servicioId: user.ServicioId,
        servicioName: user.Servicio ? user.Servicio.Nombre : null
      }
    });

    await logAudit(req, 'CAMBIO_CONTRASENA_OBLIGATORIO', undefined, user.Id);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  await logAudit(req, 'LOGOUT', 'Cierre de sesión');
  res.json({ message: 'Logout registrado' });
});

// --- HOSPITAL MANAGEMENT ENDPOINTS (GERENTE) ---

// 3.1 Crear/Actualizar Servicio
app.post('/api/services', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const { nombre, voucherIndividual } = req.body;
  const hospitalId = req.user?.hospitalId;

  if (!hospitalId || !nombre) {
    res.status(400).json({ error: 'Nombre del servicio y hospital requerido' });
    return;
  }

  try {
    const service = await prisma.servicios.create({
      data: { 
        Nombre: nombre, 
        HospitalId: hospitalId,
        VoucherIndividual: !!voucherIndividual
      }
    });
    res.json({ message: 'Servicio creado exitosamente', service });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear servicio' });
  }
});

async function syncPadronWithPersonal(hospitalId: number) {
  // PadronHabilitados y Personal ahora están vinculados y normalizados mediante AgenteId.
  // Ya no se requiere duplicación o sincronización forzada en cada petición.
  return;
}

// 3.1.b Obtener Servicios
app.get('/api/services', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'No tienes un hospital asignado' });
    return;
  }

  try {
    await syncPadronWithPersonal(hospitalId);

    const services = await prisma.servicios.findMany({
      where: { HospitalId: hospitalId },
      include: {
        _count: {
          select: { Personal: { where: { Activo: true } } }
        },
        Personal: {
          where: { Activo: true },
          select: { Id: true, DNI: true, NombreCompleto: true, Horario: true, Activo: true },
          orderBy: { NombreCompleto: 'asc' }
        },
        Usuarios: {
          where: { RolId: 3 },
          select: { Id: true, NombreUsuario: true, NombreCompleto: true, Activo: true }
        }
      }
    });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// 3.1.b.2 Obtener Servicio del Jefe de Servicio
app.get('/api/services/my-service', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const servicioId = req.user?.servicioId;
  const hospitalId = req.user?.hospitalId;

  if (!servicioId || !hospitalId) {
    res.status(400).json({ error: 'No tienes un servicio asignado' });
    return;
  }

  try {
    const service = await prisma.servicios.findFirst({
      where: { Id: servicioId, HospitalId: hospitalId }
    });

    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado' });
      return;
    }

    res.json(service);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener servicio' });
  }
});

// 3.1.c Alternar tipo de voucher (Consolidado/Individual)
app.put('/api/services/:id/toggle-voucher', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const hospitalId = req.user?.hospitalId;
  const roleId = req.user?.roleId;
  const userServicioId = req.user?.servicioId;

  if (!id || !hospitalId) {
    res.status(400).json({ error: 'ID de servicio y hospital requerido' });
    return;
  }

  // Consultar configuración del hospital
  const hospitalConfig = await prisma.hospitales.findUnique({
    where: { Id: hospitalId },
    select: { RolCambioVoucher: true }
  });
  const permiso = hospitalConfig?.RolCambioVoucher || 'JEFE';

  // Admin (roleId === 1) siempre autorizado. De lo contrario, evaluar permiso de hospital.
  if (roleId !== 1) {
    if (permiso === 'JEFE' && (roleId !== 3 || userServicioId !== id)) {
      res.status(403).json({ error: 'En este efector solo el Jefe de Servicio de su propio servicio puede modificar la modalidad de voucher.' });
      return;
    }
    if (permiso === 'GERENTE' && roleId !== 2) {
      res.status(403).json({ error: 'En este efector solo Gerencia puede modificar la modalidad de voucher de los servicios.' });
      return;
    }
    if (permiso === 'AMBOS' && roleId !== 2 && (roleId !== 3 || userServicioId !== id)) {
      res.status(403).json({ error: 'No tiene permisos para modificar la modalidad de voucher de este servicio.' });
      return;
    }
  }

  try {
    const service = await prisma.servicios.findFirst({
      where: { Id: id, HospitalId: hospitalId }
    });

    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado' });
      return;
    }

    const updatedService = await prisma.servicios.update({
      where: { Id: id },
      data: { VoucherIndividual: !service.VoucherIndividual }
    });

    await logAudit(req, 'MODIFICACION_SERVICIO', `Servicio ${service.Nombre} cambiado a voucher individual: ${updatedService.VoucherIndividual}`);
    res.json({ message: 'Servicio actualizado exitosamente', service: updatedService });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar el servicio' });
  }
});

// --- MENÚ DEL DÍA (NUTRICIÓN & JEFE) ---

// Cargar/Actualizar Menú del Día (Nutrición o Gerente)
app.post('/api/menu', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { fecha, menuAlmuerzo, menuCena } = req.body;
  const hospitalId = req.user?.hospitalId;

  if (!hospitalId) {
    res.status(403).json({ error: 'No tienes un hospital asignado' });
    return;
  }

  if (req.user?.roleId !== 5 && req.user?.roleId !== 2) {
    res.status(403).json({ error: 'No tienes permiso para guardar el menú del día' });
    return;
  }

  const fechaStr = fecha || new Date().toISOString().split('T')[0];
  const targetDate = new Date(`${fechaStr}T00:00:00.000Z`);

  try {
    const existing = await prisma.menuDia.findFirst({
      where: { HospitalId: hospitalId, Fecha: targetDate }
    });

    let result;
    if (existing) {
      result = await prisma.menuDia.update({
        where: { Id: existing.Id },
        data: {
          MenuAlmuerzo: menuAlmuerzo !== undefined ? (menuAlmuerzo ? menuAlmuerzo.trim() : null) : existing.MenuAlmuerzo,
          MenuCena: menuCena !== undefined ? (menuCena ? menuCena.trim() : null) : existing.MenuCena,
          CreadoPorUsuarioId: req.user!.userId
        }
      });
    } else {
      result = await prisma.menuDia.create({
        data: {
          HospitalId: hospitalId,
          Fecha: targetDate,
          MenuAlmuerzo: menuAlmuerzo ? menuAlmuerzo.trim() : null,
          MenuCena: menuCena ? menuCena.trim() : null,
          CreadoPorUsuarioId: req.user!.userId
        }
      });
    }

    await logAudit(req, 'CARGA_MENU_DIA', `Menú cargado para ${fechaStr}: Alm=${result.MenuAlmuerzo || '-'}, Cen=${result.MenuCena || '-'}`);
    res.json({ message: 'Menú del día guardado exitosamente', menu: result });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al guardar menú del día' });
  }
});

// Obtener Menú del Día
app.get('/api/menu', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const fechaStr = (req.query.fecha as string) || new Date().toISOString().split('T')[0];

  if (!hospitalId) {
    res.status(403).json({ error: 'No tienes un hospital asignado' });
    return;
  }

  const targetDate = new Date(`${fechaStr}T00:00:00.000Z`);

  try {
    const menu = await prisma.menuDia.findFirst({
      where: { HospitalId: hospitalId, Fecha: targetDate }
    });

    if (!menu) {
      res.json(null);
      return;
    }

    res.json({
      id: menu.Id,
      fecha: fechaStr,
      menuAlmuerzo: menu.MenuAlmuerzo || null,
      menuCena: menu.MenuCena || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener menú del día' });
  }
});

// 3.1.d Renombrar Servicio (Gerente)
app.put('/api/services/:id', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { nombre } = req.body;
  const hospitalId = req.user?.hospitalId;

  if (!id || !hospitalId || !nombre || !String(nombre).trim()) {
    res.status(400).json({ error: 'ID de servicio, hospital y nuevo nombre requeridos' });
    return;
  }

  const cleanNombre = String(nombre).trim();

  try {
    const service = await prisma.servicios.findFirst({
      where: { Id: id, HospitalId: hospitalId }
    });

    if (!service) {
      res.status(404).json({ error: 'Servicio no encontrado' });
      return;
    }

    const existingSameName = await prisma.servicios.findFirst({
      where: {
        HospitalId: hospitalId,
        Nombre: cleanNombre,
        NOT: { Id: id }
      }
    });

    if (existingSameName) {
      res.status(400).json({ error: `Ya existe un servicio con el nombre '${cleanNombre}' en este hospital.` });
      return;
    }

    const updatedService = await prisma.servicios.update({
      where: { Id: id },
      data: { Nombre: cleanNombre }
    });

    await logAudit(req, 'RENOMBRAR_SERVICIO', `Servicio renombrado de '${service.Nombre}' a '${cleanNombre}' (ID: ${id})`);
    res.json({ message: 'Nombre de servicio actualizado exitosamente', service: updatedService });
  } catch (error) {
    console.error('Error al renombrar servicio:', error);
    res.status(500).json({ error: 'Error al actualizar el nombre del servicio' });
  }
});

// 3.1.e Cambiar Servicio de un Agente (Gerente)
app.put('/api/staff/:id/servicio', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const { servicioId } = req.body;
  const hospitalId = req.user?.hospitalId;

  if (!id || !hospitalId || !servicioId) {
    res.status(400).json({ error: 'ID del agente y nuevo servicio requeridos' });
    return;
  }

  try {
    const agente = await prisma.personal.findFirst({
      where: { Id: id, HospitalId: hospitalId },
      include: { Servicio: true }
    });

    if (!agente) {
      res.status(404).json({ error: 'Agente no encontrado o no pertenece a tu hospital' });
      return;
    }

    const targetService = await prisma.servicios.findFirst({
      where: { Id: Number(servicioId), HospitalId: hospitalId }
    });

    if (!targetService) {
      res.status(404).json({ error: 'El servicio destino especificado no existe' });
      return;
    }

    const oldServiceNombre = agente.Servicio?.Nombre || 'Sin servicio';
    const oldServicioId = agente.ServicioId;
    const newServicioId = Number(servicioId);

    if (oldServicioId === newServicioId) {
      res.json({ message: 'El agente ya pertenece a este servicio', agente });
      return;
    }

    // 1. Sincronizar el Padrón Habilitado al nuevo servicio para que el padrón refleje su servicio activo actual
    await prisma.padronHabilitados.updateMany({
      where: { HospitalId: hospitalId, DNI: agente.DNI },
      data: { ServicioId: newServicioId }
    });

    // 2. Verificar si el registro en el servicio origen tiene historial de pedidos de comida
    const hasOrdersInOldService = await prisma.pedidosComida.count({
      where: {
        OR: [
          { PersonalId: id },
          { EmergenciaReemplazaId: id }
        ]
      }
    }) > 0;

    // 3. Buscar si ya existe un registro de Personal para este DNI en el nuevo servicio
    const existingTargetPersonal = await prisma.personal.findFirst({
      where: {
        HospitalId: hospitalId,
        ServicioId: newServicioId,
        DNI: agente.DNI
      }
    });

    const padronItem = await prisma.padronHabilitados.findUnique({ where: { DNI: agente.DNI } });
    const resolvedAgenteId = agente.AgenteId || padronItem?.Id || null;
    const rMax = padronItem?.RacionesMaximasDia ?? (agente.EsGuardia24 ? 2 : 1);
    const targetIs24 = padronItem ? Boolean(padronItem.RacionesMaximasDia === 2 || padronItem.EsGuardia24h) : Boolean(agente.EsGuardia24);
    const targetIs12 = !targetIs24 && rMax === 1;
    const targetHorario = rMax === 2 ? 'Guardia 24h (Almuerzo y Cena)' : (rMax === 1 ? 'Almuerzo o Cena' : 'Sin Ración');

    let activePersonalRecord;

    if (hasOrdersInOldService) {
      // BAJA LÓGICA EN EL SERVICIO ORIGEN: Mantener inactivo el registro origen preservando el historial de pedidos intacto
      await prisma.personal.update({
        where: { Id: id },
        data: {
          Activo: false,
          BajaMotivo: `Transferido al servicio ${targetService.Nombre}`.substring(0, 50)
        }
      });

      if (existingTargetPersonal) {
        // Reactivar y actualizar el registro existente en el servicio destino
        activePersonalRecord = await prisma.personal.update({
          where: { Id: existingTargetPersonal.Id },
          data: {
            Activo: true,
            BajaMotivo: null,
            BajaProvisoriaFecha: null,
            BajaProvisoriaHasta: null,
            Horario: targetHorario,
            ConVianda: rMax > 0,
            EsGuardia12: targetIs12,
            EsGuardia24: targetIs24,
            AgenteId: resolvedAgenteId
          },
          include: { Servicio: true }
        });
      } else {
        // Crear nuevo registro activo en el servicio destino
        activePersonalRecord = await prisma.personal.create({
          data: {
            DNI: agente.DNI,
            NombreCompleto: agente.NombreCompleto,
            HospitalId: hospitalId,
            ServicioId: newServicioId,
            Horario: targetHorario,
            PeriodoInicio: agente.PeriodoInicio,
            PeriodoFin: agente.PeriodoFin,
            ConVianda: rMax > 0,
            EsGuardia12: targetIs12,
            EsGuardia24: targetIs24,
            Activo: true,
            AgenteId: resolvedAgenteId
          },
          include: { Servicio: true }
        });
      }
    } else {
      // SI NO TIENE PEDIDOS HISTÓRICOS EN EL ORIGEN: Mover o consolidar directamente el registro
      if (existingTargetPersonal) {
        activePersonalRecord = await prisma.personal.update({
          where: { Id: existingTargetPersonal.Id },
          data: {
            Activo: true,
            BajaMotivo: null,
            BajaProvisoriaFecha: null,
            BajaProvisoriaHasta: null,
            AgenteId: resolvedAgenteId
          },
          include: { Servicio: true }
        });
        await prisma.personal.delete({ where: { Id: id } });
      } else {
        activePersonalRecord = await prisma.personal.update({
          where: { Id: id },
          data: { ServicioId: newServicioId, Activo: true, BajaMotivo: null, AgenteId: resolvedAgenteId },
          include: { Servicio: true }
        });
      }
    }

    await logAudit(
      req, 
      'CAMBIO_SERVICIO_AGENTE', 
      `Agente '${agente.NombreCompleto}' (DNI ${agente.DNI}) cambiado del servicio '${oldServiceNombre}' al servicio '${targetService.Nombre}'`
    );

    res.json({ message: 'Servicio del agente actualizado exitosamente', agente: activePersonalRecord });
  } catch (error) {
    console.error('Error al cambiar servicio del agente:', error);
    res.status(500).json({ error: 'Error al cambiar servicio del agente' });
  }
});

// --- ENDPOINTS DE HABILITACIÓN DE CARGA ANTICIPADA (SÁBADOS, DOMINGOS Y FERIADOS) ---

// Obtener fechas anticipadas habilitadas activas para el hospital del usuario (se auto-desactivan las pasadas)
app.get('/api/advance-dates', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hId = req.user?.hospitalId;
  if (!hId) {
    res.status(400).json({ error: 'Usuario sin hospital asignado' });
    return;
  }
  const hospitalId = Number(hId);

  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    // Desactivar automáticamente cualquier fecha anticipada cuya fecha ya haya pasado
    await prisma.fechasAnticipadasHabilitadas.updateMany({
      where: {
        HospitalId: hospitalId,
        Activo: true,
        FechaHabilitada: { lt: today }
      },
      data: { Activo: false }
    });

    const dates = await prisma.fechasAnticipadasHabilitadas.findMany({
      where: { HospitalId: hospitalId, Activo: true, FechaHabilitada: { gte: today } },
      orderBy: { FechaHabilitada: 'asc' }
    });

    const formatted = dates.map(d => ({
      ...d,
      FechaHabilitadaStr: d.FechaHabilitada.toISOString().split('T')[0]
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error al obtener fechas anticipadas:', error);
    res.status(500).json({ error: 'Error al obtener fechas anticipadas' });
  }
});

// Habilitar nueva fecha anticipada (Gerente o Admin)
app.post('/api/advance-dates', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hId = req.user?.hospitalId;
  const { fecha, descripcion } = req.body;

  if (!hId || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    res.status(400).json({ error: 'Fecha válida (YYYY-MM-DD) requerida y usuario asignado a un hospital' });
    return;
  }
  const hospitalId = Number(hId);
  const userId = req.user?.userId || (req.user as any)?.id;

  if (!userId) {
    res.status(400).json({ error: 'Usuario no identificado correctamente' });
    return;
  }

  try {
    const targetDate = new Date(`${fecha}T00:00:00.000Z`);

    // Buscar si ya existe CUALQUIER registro para este hospital y fecha (activo o inactivo)
    const existente = await prisma.fechasAnticipadasHabilitadas.findFirst({
      where: { HospitalId: hospitalId, FechaHabilitada: targetDate }
    });

    if (existente) {
      if (existente.Activo) {
        res.status(400).json({ error: `La fecha ${fecha.split('-').reverse().join('/')} ya se encuentra habilitada para carga anticipada.` });
        return;
      }

      // Si existia previamente deshabilitada, la reactivamos
      const updated = await prisma.fechasAnticipadasHabilitadas.update({
        where: { Id: existente.Id },
        data: {
          Activo: true,
          Descripcion: descripcion || existente.Descripcion || 'Carga anticipada autorizada',
          CreadoPorUsuarioId: Number(userId)
        }
      });

      await logAudit(req, 'HABILITAR_FECHA_ANTICIPADA', `Reactivada carga anticipada para fecha: ${fecha} (${descripcion || ''})`);
      res.json({ message: 'Fecha anticipada habilitada exitosamente', data: updated });
      return;
    }

    const newAdvanceDate = await prisma.fechasAnticipadasHabilitadas.create({
      data: {
        HospitalId: hospitalId,
        FechaHabilitada: targetDate,
        Descripcion: descripcion || 'Carga anticipada autorizada',
        CreadoPorUsuarioId: Number(userId),
        Activo: true
      }
    });

    await logAudit(req, 'HABILITAR_FECHA_ANTICIPADA', `Habilitada carga anticipada para fecha: ${fecha} (${descripcion || ''})`);
    res.json({ message: 'Fecha anticipada habilitada exitosamente', data: newAdvanceDate });
  } catch (error: any) {
    console.error('Error al habilitar fecha anticipada:', error);
    res.status(500).json({ error: 'Error al habilitar fecha anticipada: ' + (error?.message || String(error)) });
  }
});

// Deshabilitar una fecha anticipada (Gerente o Admin)
app.delete('/api/advance-dates/:id', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const hId = req.user?.hospitalId;

  if (!hId) {
    res.status(400).json({ error: 'Usuario sin hospital asignado' });
    return;
  }
  const hospitalId = Number(hId);

  try {
    const target = await prisma.fechasAnticipadasHabilitadas.findFirst({
      where: { Id: id, HospitalId: hospitalId }
    });

    if (!target) {
      res.status(404).json({ error: 'Registro de fecha anticipada no encontrado' });
      return;
    }

    await prisma.fechasAnticipadasHabilitadas.update({
      where: { Id: id },
      data: { Activo: false }
    });

    await logAudit(req, 'DESHABILITAR_FECHA_ANTICIPADA', `Deshabilitada carga anticipada ID: ${id}`);
    res.json({ message: 'Fecha anticipada deshabilitada exitosamente' });
  } catch (error) {
    console.error('Error al deshabilitar fecha anticipada:', error);
    res.status(500).json({ error: 'Error al deshabilitar fecha anticipada' });
  }
});

// 3.2 Crear usuario Jefe de Servicio

// GERENTES endpoints
app.get('/api/users/gerentes', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) { // Solo RRHH
    res.status(403).json({ error: 'No autorizado' });
    return;
  }
  try {
    const gerentes = await prisma.usuarios.findMany({
      where: { RolId: 2 },
      select: { Id: true, NombreUsuario: true, Activo: true, Hospital: { select: { Nombre: true } } }
    });
    res.json(gerentes);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener gerentes' });
  }
});

app.put('/api/users/:id/reset-password', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const targetId = Number(req.params.id);
  try {
    const user = await prisma.usuarios.findUnique({ where: { Id: targetId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const isRRHH = req.user?.roleId === 1;
    const isGerenteOwner = req.user?.roleId === 2 && user.RolId === 3 && user.HospitalId === req.user.hospitalId;

    if (!isRRHH && !isGerenteOwner) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    const newHash = await bcrypt.hash('123456', 10);
    await prisma.usuarios.update({
      where: { Id: targetId },
      data: { ContrasenaHash: newHash, DebeCambiarContrasena: true }
    });
    res.json({ message: 'Contraseña reseteada a "123456"' });
  } catch (error) {
    res.status(500).json({ error: 'Error al resetear contraseña' });
  }
});

app.put('/api/users/:id/disable', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const targetId = Number(req.params.id);
  try {
    const user = await prisma.usuarios.findUnique({ where: { Id: targetId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const isRRHH = req.user?.roleId === 1;
    const isGerenteOwner = req.user?.roleId === 2 && user.RolId === 3 && user.HospitalId === req.user.hospitalId;

    if (!isRRHH && !isGerenteOwner) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    await prisma.usuarios.update({
      where: { Id: targetId },
      data: { Activo: !((user as any).Activo) } as any
    });
    res.json({ message: 'Estado del usuario actualizado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado del usuario' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const targetId = Number(req.params.id);
  try {
    const user = await prisma.usuarios.findUnique({ where: { Id: targetId } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    const isRRHH = req.user?.roleId === 1;
    const isGerenteOwner = req.user?.roleId === 2 && user.RolId === 3 && user.HospitalId === req.user.hospitalId;

    if (!isRRHH && !isGerenteOwner) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    await prisma.usuarios.delete({
      where: { Id: targetId }
    });
    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2003' || error.code === 'P2014') {
      res.status(400).json({ 
        error: 'No se puede eliminar este usuario porque tiene historial registrado (pedidos de comida o auditorías). Puedes inhabilitarlo usando el botón ❌ para quitarle el acceso manteniendo la integridad de los datos.' 
      });
      return;
    }
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

app.post('/api/users/jefe-servicio', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const { username, nombreCompleto, servicioId } = req.body;
  const password = req.body.password || '123456';
  const hospitalId = req.user?.hospitalId;

  if (!username || !nombreCompleto || !servicioId || !hospitalId) {
    res.status(400).json({ error: 'Faltan campos requeridos (Nombre completo, usuario y servicio)' });
    return;
  }

  try {
    const sId = Number(servicioId);
    // Validar que el servicio pertenece al hospital del gerente
    const servicio = await prisma.servicios.findFirst({ where: { Id: sId, HospitalId: hospitalId } });
    if (!servicio) {
      res.status(403).json({ error: 'Servicio no encontrado o no pertenece a su hospital' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.usuarios.create({
      data: {
        NombreUsuario: username,
        NombreCompleto: nombreCompleto,
        ContrasenaHash: hashedPassword,
        RolId: 3, // JEFE_SERVICIO
        HospitalId: hospitalId,
        ServicioId: sId,
        DebeCambiarContrasena: true
      }
    });
    res.json({ message: 'Jefe de Servicio creado exitosamente', userId: user.Id });
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ese nombre de usuario ya está en uso. Por favor, elige otro (ej. pediatria_padilla).' });
    } else {
      res.status(500).json({ error: 'Error al crear usuario' });
    }
  }
});

// --- STAFF IMPORT ENDPOINT ---
const upload = multer({ dest: 'uploads/' });

function parseCSVDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  const trimmed = dateStr.trim();
  
  // Soporte para formato DD/MM/YYYY o D/M/YYYY
  const parts = trimmed.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // Los meses en JS son 0-11
    const year = parseInt(parts[2], 10);
    // Asegurar que el año tenga 4 dígitos (ej: 26 -> 2026)
    const fullYear = year < 100 ? 2000 + year : year;
    const date = new Date(fullYear, month, day);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Fallback para formato estándar ISO (YYYY-MM-DD)
  const fallbackDate = new Date(trimmed);
  if (!isNaN(fallbackDate.getTime())) {
    return fallbackDate;
  }
  
  throw new Error(`Fecha inválida: ${dateStr}`);
}

// 3.1, 3.2, 3.3, 3.4 Importación de Plantel (CSV)
app.post('/api/staff/import_old', authenticateToken, isJefeServicio, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No se subió ningún archivo' });
    return;
  }

  const userServicioId = req.user?.servicioId;
  const userHospitalId = req.user?.hospitalId;

  if (!userServicioId || !userHospitalId) {
    res.status(403).json({ error: 'El usuario no tiene un servicio asignado' });
    fs.unlinkSync(req.file.path);
    return;
  }

  const content = fs.readFileSync(req.file.path, 'utf8');
  const firstLine = content.split('\n')[0];
  const separator = firstLine.includes(';') ? ';' : ',';

  const results: any[] = [];
  fs.createReadStream(req.file.path)
    .pipe(csv({ separator, mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').replace(/^ï»¿/, '').toLowerCase().trim() }))
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        let importedCount = 0;
        for (const row of results) {
          // Las keys ahora vienen en minúscula por el mapHeaders
          const idPersonal = row['id_personal'];
          const dni = row['dni'];
          const nombre = row['nombre'];
          const apellido = row['apellido'];
          const periodoInicio = row['periodoinicio'];
          const periodoFin = row['periodofin'];
          
          if (!dni || !nombre || !apellido || !periodoInicio || !periodoFin) {
             continue; // Saltar filas inválidas
          }

          const strDni = String(dni).trim();

          // Validar contra el archivo de Padrón que sube el Admin
          const padron = await prisma.padronHabilitados.findUnique({
            where: { DNI: strDni }
          });

          // Si no está en el padrón o no está marcado como activo (con_vianda = NO)
          if (!padron || !padron.Activo) {
             continue;
          }

          const horario = padron.EsGuardia24h ? "24h" : "12h";

          // Upsert personal asumiendo servicio del Jefe
          await prisma.personal.upsert({
            where: {
              HospitalId_ServicioId_DNI: {
                HospitalId: userHospitalId,
                ServicioId: userServicioId,
                DNI: strDni
              }
            },
            update: {
               IdPersonal: String(idPersonal || ''),
               NombreCompleto: (String(apellido) + ' ' + String(nombre)).trim(),
               HospitalId: userHospitalId,
               ServicioId: userServicioId,
               Horario: horario,
               ConVianda: true,
               EsGuardia24: Boolean(padron.EsGuardia24h),
               EsGuardia12: !padron.EsGuardia24h,
               PeriodoInicio: parseCSVDate(periodoInicio),
               PeriodoFin: parseCSVDate(periodoFin),
               Activo: true,
               AgenteId: padron.Id
            },
            create: {
               DNI: strDni,
               IdPersonal: String(idPersonal || ''),
               NombreCompleto: (String(apellido) + ' ' + String(nombre)).trim(),
               HospitalId: userHospitalId,
               ServicioId: userServicioId,
               Horario: horario,
               ConVianda: true,
               EsGuardia24: Boolean(padron.EsGuardia24h),
               EsGuardia12: !padron.EsGuardia24h,
               PeriodoInicio: parseCSVDate(periodoInicio),
               PeriodoFin: parseCSVDate(periodoFin),
               Activo: true,
               AgenteId: padron.Id
            }
          });
          importedCount++;
        }
        await logAudit(req, 'ACTUALIZACION_PLANTEL', `Se importaron ${importedCount} registros de personal`);
        res.json({ message: 'Personal importado exitosamente', count: importedCount });
      } catch (error) {
        console.error('CSV Import Error:', error);
        res.status(500).json({ error: 'Error procesando el archivo CSV' });
      } finally {
        fs.unlinkSync(req.file!.path); // Limpiar archivo temporal
      }
    });
});

// --- ADMIN IMPORT PADRON (XLSX) ---
app.post('/api/admin/padron/import', authenticateToken, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) { // 1 = RRHH Global (Admin)
    res.status(403).json({ error: 'Solo el administrador puede importar el padrón.' });
    if (req.file) fs.unlinkSync(req.file.path);
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No se subió ningún archivo' });
    return;
  }

  try {
    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[] = xlsx.utils.sheet_to_json(sheet);

    let importedCount = 0;
    
    // Opcionalmente borrar el padrón actual:
    await prisma.padronHabilitados.deleteMany();

    const now = new Date();
    const utcMinus3 = new Date(now.getTime() - (3 * 60 * 60 * 1000));

    // Load hospitales for mapping
    const hospitalesDB = await prisma.hospitales.findMany();
    const hospMap = new Map();
    hospitalesDB.forEach(h => hospMap.set(h.Nombre.toLowerCase().trim(), h.Id));
    
    // Identificar y crear servicios faltantes
    const uniqueServiciosToCreate = new Map<string, {hospitalId: number, nombre: string}>();
    
    for (const originalRow of data) {
      const hospitalName = originalRow['efector']?.toString().trim().toLowerCase() || originalRow['hospital']?.toString().trim().toLowerCase();
      const servicioNameOriginal = originalRow['servicio']?.toString().trim();
      const servicioName = servicioNameOriginal?.toLowerCase();
      
      const hospitalId = hospitalName ? hospMap.get(hospitalName) || null : null;
      if (hospitalId && servicioNameOriginal) {
         uniqueServiciosToCreate.set(`${hospitalId}-${servicioName}`, { hospitalId, nombre: servicioNameOriginal });
      }
    }

    const serviciosDB = await prisma.servicios.findMany();
    const servMap = new Map();
    serviciosDB.forEach(s => servMap.set(`${s.HospitalId}-${s.Nombre.toLowerCase().trim()}`, s.Id));

    for (const [key, val] of uniqueServiciosToCreate.entries()) {
       if (!servMap.has(key)) {
          const newServicio = await prisma.servicios.create({
             data: { HospitalId: val.hospitalId, Nombre: val.nombre }
          });
          servMap.set(key, newServicio.Id);
       }
    }

    const insertData = data.map((originalRow) => {
      // Usar nombres exactos de encabezados proporcionados por el usuario
      const dni = originalRow['documento']?.toString();
      const nombreCompleto = originalRow['agente']?.toString() || 'Sin Nombre';
      
      // Manejar posibles valores de excel como "SI", "NO", true, false, 1, 0
      const conViandaStr = originalRow['con_vianda']?.toString().trim().toLowerCase();
      const conVianda = conViandaStr === 'si' || conViandaStr === 'true' || conViandaStr === '1';
      
      const esGuardia24Str = originalRow['esguardia24']?.toString().trim().toLowerCase();
      const esGuardia24h = esGuardia24Str === 'si' || esGuardia24Str === 'true' || esGuardia24Str === '1';

      const hospitalName = originalRow['efector']?.toString().trim().toLowerCase() || originalRow['hospital']?.toString().trim().toLowerCase();
      const servicioName = originalRow['servicio']?.toString().trim().toLowerCase();
      
      const hospitalId = hospitalName ? hospMap.get(hospitalName) || null : null;
      let servicioId = null;
      if (hospitalId && servicioName) {
         servicioId = servMap.get(`${hospitalId}-${servicioName}`) || null;
      }

      return {
        DNI: dni,
        NombreCompleto: nombreCompleto,
        EsGuardia24h: esGuardia24h,
        ConVianda: conVianda,
        HospitalId: hospitalId,
        ServicioId: servicioId
      };
    }).filter(d => d.DNI && d.ConVianda)
      .map(d => ({
        DNI: d.DNI,
        NombreCompleto: d.NombreCompleto,
        EsGuardia24h: d.EsGuardia24h,
        HospitalId: d.HospitalId,
        ServicioId: d.ServicioId,
        FechaCreacion: utcMinus3
      })); // Quitar ConVianda antes de insertar en DB

    // Para evitar duplicados en el excel si los hubiera
    const uniqueInsertData = Array.from(new Map(insertData.map(item => [item.DNI, item])).values());

    if (uniqueInsertData.length > 0) {
       await prisma.padronHabilitados.createMany({
         data: uniqueInsertData
       });
       importedCount = uniqueInsertData.length;
    }

    await logAudit(req, 'ACTUALIZACION_PADRON', `Se importaron ${importedCount} registros en el padrón`);
    res.json({ message: 'Padrón importado exitosamente', count: importedCount });
  } catch (error) {
    console.error('XLSX Import Error:', error);
    res.status(500).json({ error: 'Error procesando el archivo XLSX' });
  } finally {
    if (req.file) fs.unlinkSync(req.file.path);
  }
});

app.get('/api/admin/padron', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) { // 1 = RRHH Global (Admin)
    res.status(403).json({ error: 'Solo el administrador puede ver el padrón.' });
    return;
  }
  try {
    const padron = await prisma.padronHabilitados.findMany({
      orderBy: { NombreCompleto: 'asc' }
    });
    res.json(padron);
  } catch (error) {
    console.error('Error fetching padron:', error);
    res.status(500).json({ error: 'Error al obtener el padrón' });
  }
});

// --- MEAL ORDERS & EMERGENCIES ENDPOINTS ---

const checkDeadlines = async (solicitadoPorUsuarioId: number, tipoComida: string): Promise<string | null> => {
  const user = await prisma.usuarios.findUnique({ where: { Id: solicitadoPorUsuarioId }, include: { Hospital: true } });
  if (!user || !user.Hospital) return null;
  
  const config = user.Hospital;
  const now = new Date();
  const currentTotalMins = now.getHours() * 60 + now.getMinutes();
  
  if (tipoComida === 'Almuerzo') {
    const limitAlm = config.LimiteAlmuerzo || '09:00';
    const [limitH, limitM] = limitAlm.split(':').map(Number);
    if (currentTotalMins >= limitH * 60 + limitM) return `El horario límite para pedidos de Almuerzo (${limitAlm}) ha expirado.`;
  }
  if (tipoComida === 'Cena') {
    const limitCen = config.LimiteCena || '17:00';
    const [limitH, limitM] = limitCen.split(':').map(Number);
    if (currentTotalMins >= limitH * 60 + limitM) return `El horario límite para pedidos de Cena (${limitCen}) ha expirado.`;
  }
  if (tipoComida === 'Ambos') {
    const limitAlm = config.LimiteAlmuerzo || '09:00';
    const [hAlm, mAlm] = limitAlm.split(':').map(Number);
    const limitCen = config.LimiteCena || '17:00';
    const [hCen, mCen] = limitCen.split(':').map(Number);

    const isAlmPast = currentTotalMins >= hAlm * 60 + mAlm;
    const isCenPast = currentTotalMins >= hCen * 60 + mCen;

    if (isAlmPast && isCenPast) {
      return `El horario límite para pedidos de hoy (Almuerzo ${limitAlm} y Cena ${limitCen}) ha expirado.`;
    }
  }
  return null;
};

const checkAuthDeadlines = async (solicitadoPorUsuarioId: number, tipoComida: string): Promise<string | null> => {
  const user = await prisma.usuarios.findUnique({ where: { Id: solicitadoPorUsuarioId }, include: { Hospital: true } });
  if (!user || !user.Hospital) return null;
  
  const config = user.Hospital;
  const now = new Date();
  const currentTotalMins = now.getHours() * 60 + now.getMinutes();
  
  if (tipoComida === 'Almuerzo' || tipoComida === 'Ambos') {
    const limitAuthAlm = config.LimiteAutorizacionAlmuerzo || '11:00';
    const [limitH, limitM] = limitAuthAlm.split(':').map(Number);
    if (currentTotalMins >= limitH * 60 + limitM) return `El horario límite para autorizar emergencias de Almuerzo (${limitAuthAlm}) ha expirado.`;
  }
  if (tipoComida === 'Cena' || tipoComida === 'Ambos') {
    const limitAuthCen = config.LimiteAutorizacionCena || '18:00';
    const [limitH, limitM] = limitAuthCen.split(':').map(Number);
    if (currentTotalMins >= limitH * 60 + limitM) return `El horario límite para autorizar emergencias de Cena (${limitAuthCen}) ha expirado.`;
  }
  return null;
};

// 4.1 Obtener personal activo del servicio

// --- NUEVOS ENDPOINTS DE PLANTEL ---
app.get('/api/staff/padron', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'El usuario no pertenece a ningun hospital' });
    return;
  }
  try {
    // 1. Agentes cuyo efector principal en PadronHabilitados es este hospital
    const padronDirecto = await prisma.padronHabilitados.findMany({
      where: { HospitalId: hospitalId },
      include: { Servicio: true },
      orderBy: { NombreCompleto: 'asc' }
    });

    // 2. Agentes de otros efectores que también pertenecen al plantel de Personal de este hospital
    const personalDeEsteHospital = await prisma.personal.findMany({
      where: { HospitalId: hospitalId },
      include: { Servicio: true }
    });

    const dnisEnPadronDirecto = new Set(padronDirecto.map(p => p.DNI));
    const personalExtra = personalDeEsteHospital.filter(p => !dnisEnPadronDirecto.has(p.DNI));

    let padronExternoConectado: any[] = [];
    if (personalExtra.length > 0) {
      const dnisExtra = [...new Set(personalExtra.map(p => p.DNI))];
      const padronCentralList = await prisma.padronHabilitados.findMany({
        where: { DNI: { in: dnisExtra } },
        include: { Servicio: true }
      });
      const padronCentralMap = new Map(padronCentralList.map(pc => [pc.DNI, pc]));

      const dnisAgregados = new Set<string>();
      for (const p of personalExtra) {
        if (dnisAgregados.has(p.DNI)) continue;
        dnisAgregados.add(p.DNI);

        const central = padronCentralMap.get(p.DNI);
        const centralIs24 = central ? Boolean(central.EsGuardia24h || central.RacionesMaximasDia === 2) : false;
        padronExternoConectado.push({
          Id: central?.Id || p.Id,
          DNI: p.DNI,
          NombreCompleto: central?.NombreCompleto || p.NombreCompleto,
          EsGuardia24h: centralIs24,
          RacionesMaximasDia: central?.RacionesMaximasDia ?? 1,
          PinAcceso: central?.PinAcceso || null,
          OrigenAlta: central?.OrigenAlta || 'PLANTEL_MULTIHOSPITAL',
          Activo: central?.Activo ?? true,
          FechaCreacion: central?.FechaCreacion || p.PeriodoInicio,
          HospitalId: hospitalId,
          ServicioId: p.ServicioId,
          Hospital: null as any,
          Servicio: p.Servicio
        });
      }
    }

    let padron = [...padronDirecto, ...padronExternoConectado].sort((a, b) => a.NombreCompleto.localeCompare(b.NombreCompleto));

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const activeStaff = await prisma.personal.findMany({
      where: { HospitalId: hospitalId, Activo: true, PeriodoFin: { gte: today } }
    });

    const padronWithStatus = padron.map(p => {
       const assignments = activeStaff.filter(s => s.DNI === p.DNI);
       const anyConVianda = assignments.some(a => a.ConVianda === true);
       const allSinVianda = assignments.length > 0 && !anyConVianda;

       // PadronHabilitados es la ÚNICA fuente de verdad de raciones por DNI
       const is24h = Boolean(p.EsGuardia24h || p.RacionesMaximasDia === 2);
       const racionesGlobales = (p.Activo === false || allSinVianda) 
         ? 0 
         : (p.RacionesMaximasDia ?? (is24h ? 2 : 1));

       return { 
         ...p, 
         has24h: is24h, 
         count12h: (!is24h && racionesGlobales === 1) ? 1 : 0,
         hasConVianda: anyConVianda,
         allSinVianda,
         RacionesGlobales: racionesGlobales,
         RacionesMaximasDia: racionesGlobales
       };
    });

    res.json(padronWithStatus);
  } catch (error) {
    console.error('Error fetching staff padron:', error);
    res.status(500).json({ error: 'Error al obtener el padron de agentes' });
  }
});

app.post('/api/staff/plantel', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { plantel } = req.body; 
  const servicioId = req.user?.servicioId;
  const hospitalId = req.user?.hospitalId;

  if (!servicioId || !hospitalId) {
    res.status(403).json({ error: 'El usuario no tiene hospital o servicio asignado' });
    return;
  }

  if (!Array.isArray(plantel)) {
    res.status(400).json({ error: 'El formato de plantel es invalido' });
    return;
  }

  try {
    const inicioValido = new Date(2020, 0, 1);
    const finValido = new Date(2035, 11, 31);
    const dnisEnPlantel = plantel.map(p => p.DNI);

    // Inactivar agentes de este servicio que ya no estén en la lista enviada
    await prisma.personal.updateMany({
      where: {
        ServicioId: servicioId,
        DNI: { notIn: dnisEnPlantel }
      },
      data: {
        Activo: false,
        PeriodoFin: new Date()
      }
    });

    for (const p of plantel) {
      const existingPadron = await prisma.padronHabilitados.findFirst({ where: { DNI: p.DNI } });
      const racionVal = p.racion !== undefined ? Number(p.racion) : (p.racionNueva !== undefined ? Number(p.racionNueva) : (p.EsGuardia24 ? 2 : (existingPadron?.RacionesMaximasDia ?? 1)));
      const isGuardia24Val = racionVal === 2;
      const nuevoHorarioStr = racionVal === 2 ? 'Guardia 24h (Almuerzo y Cena)' : (racionVal === 1 ? 'Almuerzo o Cena' : 'Sin Ración');

      // 1. Actualizar PadronHabilitados como Única Fuente de Verdad por DNI
      let padronRecord;
      if (existingPadron) {
        const isFromSameHospital = existingPadron.HospitalId === hospitalId;
        const newRaciones = Math.max(existingPadron.RacionesMaximasDia || 0, racionVal);

        padronRecord = await prisma.padronHabilitados.update({
          where: { Id: existingPadron.Id },
          data: {
            NombreCompleto: existingPadron.NombreCompleto || p.NombreCompleto,
            ...(isFromSameHospital ? { HospitalId: hospitalId, ServicioId: servicioId } : {}),
            EsGuardia24h: newRaciones === 2,
            RacionesMaximasDia: newRaciones,
            Activo: true
          }
        });
      } else {
        padronRecord = await prisma.padronHabilitados.create({
          data: {
            DNI: p.DNI,
            NombreCompleto: p.NombreCompleto,
            EsGuardia24h: isGuardia24Val,
            RacionesMaximasDia: racionVal,
            Activo: true,
            HospitalId: hospitalId,
            ServicioId: servicioId,
            OrigenAlta: 'PLANTEL_ADMIN'
          }
        });
      }

      // 2. Sincronizar ÚNICAMENTE las filas de Personal para este DNI en ESTE hospital
      await prisma.personal.updateMany({
        where: { DNI: p.DNI, HospitalId: hospitalId },
        data: {
          NombreCompleto: padronRecord.NombreCompleto,
          EsGuardia24: isGuardia24Val,
          EsGuardia12: isGuardia24Val ? false : true,
          Horario: nuevoHorarioStr,
          Activo: true,
          PeriodoInicio: inicioValido,
          PeriodoFin: finValido,
          BajaProvisoriaFecha: null,
          BajaProvisoriaHasta: null,
          BajaMotivo: null,
          AgenteId: padronRecord.Id
        }
      });

      // Asegurar que exista la fila de Personal para este servicio específico
      const existeEnServicio = await prisma.personal.findFirst({
        where: { HospitalId: hospitalId, ServicioId: servicioId, DNI: p.DNI }
      });
      if (!existeEnServicio) {
        await prisma.personal.create({
          data: {
            DNI: p.DNI,
            NombreCompleto: p.NombreCompleto,
            HospitalId: hospitalId,
            ServicioId: servicioId,
            Horario: nuevoHorarioStr,
            EsGuardia24: isGuardia24Val,
            EsGuardia12: isGuardia24Val ? false : true,
            PeriodoInicio: inicioValido,
            PeriodoFin: finValido,
            Activo: true,
            AgenteId: padronRecord.Id
          }
        });
      }
    }

    await logAudit(req, 'GUARDAR_PLANTEL', `Se reconfiguró/guardó el plantel del servicio con ${plantel.length} agentes`);
    res.json({ message: 'Plantel guardado exitosamente', count: plantel.length });
  } catch (error) {
    console.error('Error saving plantel:', error);
    res.status(500).json({ error: 'Error al guardar el plantel' });
  }
});
// -----------------------------------

app.get('/api/staff/active', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const sId = req.user?.servicioId || Number(req.query.servicioId);
  
  if (!sId || isNaN(sId)) {
    res.status(400).json({ error: 'Servicio no especificado o usuario no asignado' });
    return;
  }

  const servicioId = Number(sId);

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    // Si envian fecha especifica en query, usarla; sino usar hoy
    const customFechaStr = req.query.fecha as string;
    const targetFechaStr = customFechaStr && /^\d{4}-\d{2}-\d{2}$/.test(customFechaStr) ? customFechaStr : todayStr;
    const targetDate = new Date(`${targetFechaStr}T00:00:00.000Z`);

    const staff = await prisma.personal.findMany({
      where: {
        ServicioId: servicioId,
        Activo: true
      },
      include: {
        Agente: true,
        PedidosComida: {
          where: { FechaPedido: targetDate }
        }
      },
      orderBy: { NombreCompleto: 'asc' }
    });

    const allDnis = staff.map(s => s.DNI);
    const allAgenteIds = staff.map(s => s.AgenteId).filter((id): id is number => id !== null);

    const globalOrdersToday = await prisma.pedidosComida.findMany({
      where: {
        FechaPedido: targetDate,
        Estado: { in: ['Pendiente', 'Aprobado'] },
        OR: [
          ...(allAgenteIds.length > 0 ? [{ AgenteId: { in: allAgenteIds } }] : []),
          { Personal: { DNI: { in: allDnis } } },
          { EmergenciaDNI: { in: allDnis } }
        ]
      },
      include: {
        Agente: true,
        Personal: { include: { Servicio: true } },
        SolicitadoPor: { include: { Servicio: true } }
      }
    });

    const padronList = await prisma.padronHabilitados.findMany({
      where: { DNI: { in: allDnis } }
    });
    const padronMap = new Map(padronList.map(p => [p.DNI, p]));

    const verifiedStaff = staff.map(s => {
      let isBajaEnFecha = false;
      if (s.BajaProvisoriaFecha) {
        const d = new Date(s.BajaProvisoriaFecha);
        const desdeStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        
        let hastaStr = "9999-12-31";
        if (s.BajaProvisoriaHasta) {
          const h = new Date(s.BajaProvisoriaHasta);
          hastaStr = `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, '0')}-${String(h.getUTCDate()).padStart(2, '0')}`;
        }
        isBajaEnFecha = targetFechaStr >= desdeStr && targetFechaStr <= hastaStr;
      }
      const esInhabilitado = Boolean(isBajaEnFecha || !s.Activo || s.BajaMotivo || s.BajaProvisoriaFecha);

      const agentGlobalOrders = globalOrdersToday.filter(o => 
        (o.AgenteId && s.AgenteId && o.AgenteId === s.AgenteId) || 
        o.Personal?.DNI === s.DNI || 
        o.EmergenciaDNI === s.DNI
      );
      const padronEntry = s.Agente || padronMap.get(s.DNI);
      const conViandaHabilitada = Boolean(s.ConVianda && (padronEntry ? padronEntry.Activo : true));
      // PadronHabilitados como ÚNICA fuente de verdad
      const isGuardia24h = Boolean(padronEntry?.RacionesMaximasDia === 2 || padronEntry?.EsGuardia24h);
      const maxRaciones = !conViandaHabilitada ? 0 : (padronEntry?.RacionesMaximasDia ?? (isGuardia24h ? 2 : 1));

      return { 
        ...s,
        NombreCompleto: padronEntry?.NombreCompleto || s.NombreCompleto,
        ConVianda: conViandaHabilitada,
        bajaProvisoriaHoy: isBajaEnFecha,
        bajaDefinitivaHoy: !s.Activo,
        bajaMotivo: s.BajaMotivo || null,
        esInhabilitadoParaReemplazo: esInhabilitado,
        globalOrdersToday: agentGlobalOrders.map(o => ({
          Id: o.Id,
          TipoComida: o.TipoComida,
          TipoDieta: o.TipoDieta,
          ServicioNombre: o.SolicitadoPor?.Servicio?.Nombre || o.Personal?.Servicio?.Nombre || 'otro servicio',
          ServicioId: o.SolicitadoPor?.ServicioId || o.Personal?.ServicioId
        })),
        maxRaciones,
        esCuotaCompleta: agentGlobalOrders.length >= maxRaciones
      };
    });

    res.json(verifiedStaff);
  } catch (error) {
    console.error('Error fetching active staff:', error);
    try {
      const basicStaff = await prisma.personal.findMany({
        where: { ServicioId: Number(servicioId), Activo: true },
        orderBy: { NombreCompleto: 'asc' }
      });
      res.json(basicStaff.map(s => ({ ...s, PedidosComida: [] })));
    } catch (innerError) {
      res.status(500).json({ error: 'Error al obtener personal activo' });
    }
  }
});

// 4.1.5 Dar de baja a personal (Provisoria o Definitiva)
app.post('/api/staff/:id/baja', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { tipo } = req.body;
  try {
    const personalId = Number(id);
    const agente = await prisma.personal.findUnique({ where: { Id: personalId } });
    if (!agente) {
      res.status(404).json({ error: 'Agente no encontrado' });
      return;
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    if (tipo === 'PROVISORIA') {
      const { desde, hasta, motivo } = req.body;
      const startDate = desde ? new Date(`${desde}T00:00:00.000Z`) : today;
      const endDate = hasta ? new Date(`${hasta}T23:59:59.999Z`) : new Date(`${startDate.toISOString().split('T')[0]}T23:59:59.999Z`);
      const bajaMotivo = motivo ? String(motivo).substring(0, 50) : null;
      
      await prisma.personal.update({
        where: { Id: personalId },
        data: { BajaProvisoriaFecha: startDate, BajaProvisoriaHasta: endDate, BajaMotivo: bajaMotivo }
      });
      
      // Borrar pedidos pendientes que caigan en ese rango de inhabilitación (por PersonalId o DNI) que NO hayan sido entregados
      await prisma.pedidosComida.deleteMany({
        where: {
          FechaEntregado: null,
          OR: [
            { PersonalId: personalId },
            { Personal: { DNI: agente.DNI } },
            { EmergenciaDNI: agente.DNI }
          ],
          FechaPedido: {
            gte: startDate,
            lte: endDate
          }
        }
      });
      
      await logAudit(req, 'BAJA_PROVISIONAL', `Baja provisoria aplicada al agente ID: ${id} (${agente.NombreCompleto})`);
    } else if (tipo === 'DEFINITIVA') {
      const safeMotivo = req.body.motivo ? String(req.body.motivo).substring(0, 50) : null;
      await prisma.personal.update({
        where: { Id: personalId },
        data: { Activo: false, PeriodoFin: today, BajaMotivo: safeMotivo }
      });

      if (agente.DNI && agente.HospitalId) {
        const otherActive = await prisma.personal.count({
          where: { DNI: agente.DNI, HospitalId: agente.HospitalId, Activo: true, Id: { not: personalId } }
        });
        if (otherActive === 0) {
          await prisma.padronHabilitados.updateMany({
            where: { DNI: agente.DNI, HospitalId: agente.HospitalId },
            data: { Activo: false }
          });
        }
      }

      // Borrar pedidos pendientes desde hoy en adelante para baja definitiva (por PersonalId o DNI) que NO hayan sido entregados
      await prisma.pedidosComida.deleteMany({
        where: {
          FechaEntregado: null,
          OR: [
            { PersonalId: personalId },
            { Personal: { DNI: agente.DNI } },
            { EmergenciaDNI: agente.DNI }
          ],
          FechaPedido: {
            gte: today
          }
        }
      });

      await logAudit(req, 'BAJA_DEFINITIVA', `Baja definitiva aplicada al agente ID: ${id} (${agente.NombreCompleto})`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error al dar de baja:', error);
    res.status(500).json({ error: 'Error al dar de baja al personal' });
  }
});

// 4.1.6 Revertir baja (Provisoria o Definitiva)
app.post('/api/staff/:id/revertir-baja', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const personalId = Number(id);

  try {
    const agente = await prisma.personal.findUnique({ where: { Id: personalId } });
    if (!agente) {
      res.status(404).json({ error: 'Agente no encontrado' });
      return;
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    // Verificar si el motivo de baja es por transferencia a otro servicio
    if (agente.BajaMotivo && agente.BajaMotivo.startsWith('Transferido al servicio')) {
      res.status(400).json({
        error: `No se puede habilitar a "${agente.NombreCompleto}" en este servicio porque fue ${agente.BajaMotivo.toLowerCase()}. Para cambiarlo de servicio nuevamente utilice la opción de Gerencia.`
      });
      return;
    }

    // Verificar si el agente titular posee un reemplazo activo (Pendiente o Aprobado) para hoy o fechas futuras
    const reemplazoActivo = await prisma.pedidosComida.findFirst({
      where: {
        OR: [
          { EmergenciaReemplazaId: personalId },
          { PersonalReemplazado: { DNI: agente.DNI } }
        ],
        Estado: { in: ['Pendiente', 'Aprobado'] },
        FechaPedido: { gte: today }
      }
    });

    if (reemplazoActivo) {
      const fStr = reemplazoActivo.FechaPedido.toISOString().split('T')[0].split('-').reverse().join('/');
      const reemplazanteInfo = reemplazoActivo.EmergenciaNombreCompleto ? ` (${reemplazoActivo.EmergenciaNombreCompleto})` : '';
      res.status(400).json({
        error: `No se puede rehabilitar a "${agente.NombreCompleto}" porque posee una solicitud de reemplazo activa${reemplazanteInfo} en estado ${reemplazoActivo.Estado} para el día ${fStr}. Se debe anular o resolver dicho reemplazo antes de rehabilitar al titular.`
      });
      return;
    }

    await prisma.personal.update({ 
      where: { Id: personalId }, 
      data: { 
        Activo: true, 
        BajaProvisoriaFecha: null,
        BajaProvisoriaHasta: null,
        BajaMotivo: null,
        PeriodoFin: new Date(Date.UTC(9999, 11, 31))
      } 
    });

    if (agente.DNI && agente.HospitalId) {
      await prisma.padronHabilitados.updateMany({
        where: { DNI: agente.DNI, HospitalId: agente.HospitalId },
        data: { Activo: true }
      });
    }
    await logAudit(req, 'REVERTIR_BAJA', `Baja revertida al agente ID: ${id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error al revertir baja:', error);
    res.status(500).json({ error: 'Error al revertir la baja al personal' });
  }
});

// 4.3 Registrar o eliminar pedido de comida (y 4.4 validación de 10AM)
app.post('/api/orders/toggle', async (req: Request, res: Response): Promise<void> => {
  const { personalId, tipoComida, tipoDieta, solicitadoPorUsuarioId, fecha } = req.body;
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const targetFechaStr = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : todayStr;
  const targetDate = new Date(`${targetFechaStr}T00:00:00.000Z`);

  if (targetFechaStr === todayStr) {
    const errorMsg = await checkDeadlines(solicitadoPorUsuarioId, tipoComida);
    if (errorMsg) {
      res.status(400).json({ error: errorMsg });
      return;
    }
  } else if (targetFechaStr > todayStr) {
    const user = await prisma.usuarios.findUnique({ where: { Id: solicitadoPorUsuarioId } });
    if (!user || !user.HospitalId) {
      res.status(400).json({ error: 'Usuario sin hospital asignado para validacion de fecha anticipada.' });
      return;
    }

    const habilitada = await prisma.fechasAnticipadasHabilitadas.findFirst({
      where: {
        HospitalId: user.HospitalId,
        FechaHabilitada: targetDate,
        Activo: true
      }
    });

    if (!habilitada) {
      res.status(400).json({ error: `La fecha seleccionada (${targetFechaStr.split('-').reverse().join('/')}) no se encuentra habilitada por Gerencia para carga anticipada.` });
      return;
    }
  }

  try {
    const personal = await prisma.personal.findUnique({ where: { Id: personalId } });
    if (!personal) {
      res.status(404).json({ error: 'Personal no encontrado.' });
      return;
    }
    if (!personal.ConVianda) {
      res.status(403).json({ error: `El agente ${personal.NombreCompleto} tiene asignada Ración 0 (Sin ración). No está habilitado para recibir viandas.` });
      return;
    }
    const padron = await prisma.padronHabilitados.findUnique({ where: { DNI: personal.DNI } });
    if (!padron || !padron.Activo) {
      res.status(403).json({ error: 'El agente no se encuentra en el padrón de habilitados para recibir comida (Ración 0).' });
      return;
    }
    const crossCheck = await prisma.pedidosComida.findFirst({
      where: {
        FechaPedido: targetDate,
        TipoComida: tipoComida,
        Estado: { in: ['Pendiente', 'Aprobado'] },
        OR: [
          { Personal: { DNI: personal.DNI } },
          { EmergenciaDNI: personal.DNI }
        ],
        NOT: { PersonalId: personalId }
      },
      include: {
        SolicitadoPor: { include: { Servicio: true } },
        Personal: { include: { Servicio: true } }
      }
    });

    if (crossCheck) {
      const esEmergencia = Boolean(crossCheck.EmergenciaDNI);
      const sNombre = esEmergencia 
        ? 'una solicitud de emergencia' 
        : `el servicio "${crossCheck.SolicitadoPor?.Servicio?.Nombre || crossCheck.Personal?.Servicio?.Nombre || 'otro servicio'}"`;
      res.status(403).json({ error: `El agente ${personal.NombreCompleto} (DNI ${personal.DNI}) ya posee este pedido (${tipoComida}) asignado mediante ${sNombre}.` });
      return;
    }

    const existingOrder = await prisma.pedidosComida.findFirst({
      where: {
        PersonalId: personalId,
        TipoComida: tipoComida,
        FechaPedido: targetDate
      }
    });

    if (existingOrder) {
      if (existingOrder.FechaEntregado) {
        res.status(400).json({ error: 'No se puede modificar ni cancelar un pedido que ya fue entregado y retirado en comedor.' });
        return;
      }
      if (existingOrder.TipoDieta === tipoDieta) {
        // Si es la misma dieta, se cancela
        await prisma.pedidosComida.delete({ where: { Id: existingOrder.Id } });
        res.json({ message: 'Pedido cancelado', action: 'deleted' });
      } else {
        // Si es otra dieta, se actualiza
        await prisma.pedidosComida.update({
          where: { Id: existingOrder.Id },
          data: { TipoDieta: tipoDieta }
        });
        res.json({ message: 'Dieta actualizada', action: 'updated' });
      }
      // Validar límite si no es 24h (PadronHabilitados es la Única Fuente de Verdad)
      const isGuardia24h = Boolean(padron.EsGuardia24h || padron.RacionesMaximasDia === 2);
      if (!isGuardia24h) {
        const otherMealType = tipoComida === 'Almuerzo' ? 'Cena' : 'Almuerzo';
        const hasOtherMeal = await prisma.pedidosComida.findFirst({
          where: {
            FechaPedido: targetDate,
            TipoComida: otherMealType,
            Estado: { in: ['Pendiente', 'Aprobado'] },
            OR: [
              { PersonalId: personalId },
              { Personal: { DNI: personal.DNI } },
              { EmergenciaDNI: personal.DNI }
            ]
          }
        });
        if (hasOtherMeal) {
          res.status(403).json({ error: 'El agente (Guardia 12h) solo puede pedir una comida por día.' });
          return;
        }
      }

      // Crear nuevo pedido
      await prisma.pedidosComida.create({
        data: {
          FechaPedido: targetDate,
          TipoComida: tipoComida,
          TipoDieta: tipoDieta || 'Normal',
          PersonalId: personalId,
          AgenteId: padron.Id,
          SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
          Estado: 'Aprobado' // Pedidos de plantilla son auto-aprobados
        }
      });
      res.json({ message: 'Pedido registrado', action: 'created' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al procesar el pedido' });
  }
});

// 4.3.b Guardar multiples pedidos (soporta fecha de hoy o fecha futura habilitada)
app.post('/api/orders/bulk', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { orders, tipoComida, fecha } = req.body;
  const solicitadoPorUsuarioId = req.user?.userId;

  if (!solicitadoPorUsuarioId) {
    res.status(401).json({ error: 'Usuario no autenticado' });
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const targetFechaStr = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : todayStr;
  const targetDate = new Date(`${targetFechaStr}T00:00:00.000Z`);

  let isAlmPast = false;
  let isCenPast = false;

  // Si la fecha solicitada es HOY, se evaluan los limites de horario habituales
  if (targetFechaStr === todayStr) {
    const user = await prisma.usuarios.findUnique({ where: { Id: solicitadoPorUsuarioId }, include: { Hospital: true } });
    if (user && user.Hospital) {
      const config = user.Hospital;
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();

      const limitAlm = config.LimiteAlmuerzo || '09:00';
      const [hAlm, mAlm] = limitAlm.split(':').map(Number);
      if (currentTotalMins >= hAlm * 60 + mAlm) isAlmPast = true;

      const limitCen = config.LimiteCena || '17:00';
      const [hCen, mCen] = limitCen.split(':').map(Number);
      if (currentTotalMins >= hCen * 60 + mCen) isCenPast = true;
    }

    if (isAlmPast && isCenPast) {
      res.status(400).json({ error: `Los horarios límite para la carga de Almuerzo y Cena de hoy han expirado.` });
      return;
    }
  } else if (targetFechaStr > todayStr) {
    // Si es fecha FUTURA, verificar que este autorizada por Gerencia
    const user = await prisma.usuarios.findUnique({ where: { Id: solicitadoPorUsuarioId } });
    if (!user || !user.HospitalId) {
      res.status(400).json({ error: 'Usuario sin hospital asignado para validacion de fecha anticipada.' });
      return;
    }

    const habilitada = await prisma.fechasAnticipadasHabilitadas.findFirst({
      where: {
        HospitalId: user.HospitalId,
        FechaHabilitada: targetDate,
        Activo: true
      }
    });

    if (!habilitada) {
      res.status(400).json({ error: `La fecha seleccionada (${targetFechaStr.split('-').reverse().join('/')}) no se encuentra habilitada por Gerencia para carga anticipada.` });
      return;
    }
  }

  try {
    const solicitante = await prisma.usuarios.findUnique({
      where: { Id: solicitadoPorUsuarioId },
      include: { Servicio: true }
    });
    const solicitanteServicioId = solicitante?.ServicioId;

    // Determinar que tipos de comida se pueden modificar/borrar
    let filterTipoComida: any = {};
    if (tipoComida && tipoComida !== 'Ambos') {
      filterTipoComida = { TipoComida: tipoComida };
    } else if (isAlmPast && !isCenPast) {
      // Almuerzo expiro pero Cena esta abierta: solo se borran y modifican los pedidos de Cena
      filterTipoComida = { TipoComida: 'Cena' };
    } else if (!isAlmPast && isCenPast) {
      // Cena expiro pero Almuerzo esta abierto: solo se borran y modifican los pedidos de Almuerzo
      filterTipoComida = { TipoComida: 'Almuerzo' };
    }

    const sinRacionSkipped: Array<{ id: number; nombre: string; dni: string; motivo: string }> = [];

    await prisma.$transaction(async (tx) => {
      const personalIds = orders.map((o: any) => o.personalId);

      // 1. Obtener pedidos que YA fueron entregados físicamente en comedor para preservarlos intactos
      const deliveredOrders = await tx.pedidosComida.findMany({
        where: {
          FechaPedido: targetDate,
          PersonalId: { in: personalIds },
          FechaEntregado: { not: null },
          ...filterTipoComida
        }
      });

      // Mapear por `personalId_tipoComida`
      const deliveredMap = new Map<string, typeof deliveredOrders[0]>();
      for (const dOrd of deliveredOrders) {
        if (dOrd.PersonalId) {
          deliveredMap.set(`${dOrd.PersonalId}_${dOrd.TipoComida}`, dOrd);
        }
      }

      // 2. Borrar ÚNICAMENTE los pedidos pendientes (NO entregados)
      await tx.pedidosComida.deleteMany({
        where: {
          FechaPedido: targetDate,
          PersonalId: { in: personalIds },
          FechaEntregado: null,
          ...filterTipoComida
        }
      });

      // Creamos los nuevos pedidos para targetDate
      const newOrders = [];
      for (const o of orders) {
        let isAlmuerzo = tipoComida && tipoComida !== 'Ambos' ? tipoComida === 'Almuerzo' : true;
        let isCena = tipoComida && tipoComida !== 'Ambos' ? tipoComida === 'Cena' : true;

        if (targetFechaStr === todayStr) {
          if (isAlmPast) isAlmuerzo = false; // No tocar ni reinsertar Almuerzo si ya venció
          if (isCenPast) isCena = false;     // No tocar ni reinsertar Cena si ya venció
        }
        
        const almuerzoDelivered = deliveredMap.get(`${o.personalId}_Almuerzo`);
        const cenaDelivered = deliveredMap.get(`${o.personalId}_Cena`);

        // Si ya fue entregado, consideramos que esa comida sigue existiendo y solicitada
        const hasAlmuerzo = Boolean(almuerzoDelivered) || (isAlmuerzo && Boolean(o.almuerzoDieta));
        const hasCena = Boolean(cenaDelivered) || (isCena && Boolean(o.cenaDieta));

        const mealsRequested = (hasAlmuerzo ? 1 : 0) + (hasCena ? 1 : 0);
        if (mealsRequested === 0) continue;

        const personal = await tx.personal.findUnique({ where: { Id: o.personalId } });
        if (!personal || !personal.Activo || !personal.ConVianda) {
          if (personal) {
            sinRacionSkipped.push({
              id: personal.Id,
              nombre: personal.NombreCompleto || 'Agente',
              dni: personal.DNI,
              motivo: !personal.ConVianda ? 'Ración 0 (Sin ración asignada)' : 'Personal inactivo'
            });
          }
          continue;
        }

        if (personal.BajaProvisoriaFecha && personal.BajaProvisoriaHasta) {
          const bInicio = new Date(personal.BajaProvisoriaFecha);
          const bFin = new Date(personal.BajaProvisoriaHasta);
          if (targetDate >= bInicio && targetDate <= bFin) continue;
        }

        // Verificar si el agente titular posee un reemplazo activo en esa fecha
        const reemplazoActivo = await tx.pedidosComida.findFirst({
          where: {
            FechaPedido: targetDate,
            Estado: { in: ['Pendiente', 'Aprobado'] },
            OR: [
              { EmergenciaReemplazaId: personal.Id },
              { PersonalReemplazado: { DNI: personal.DNI } }
            ]
          }
        });
        if (reemplazoActivo) continue;
        
        let padronItem = personal.AgenteId
          ? await tx.padronHabilitados.findUnique({ where: { Id: personal.AgenteId } })
          : await tx.padronHabilitados.findUnique({ where: { DNI: personal.DNI } });

        if (!padronItem) {
          padronItem = await tx.padronHabilitados.create({
            data: {
              DNI: personal.DNI,
              NombreCompleto: personal.NombreCompleto,
              EsGuardia24h: false,
              RacionesMaximasDia: 1,
              HospitalId: personal.HospitalId,
              ServicioId: personal.ServicioId,
              Activo: true,
              OrigenAlta: 'PEDIDO_DIARIO'
            }
          });
        }

        // Vincular AgenteId si aún estaba nulo en Personal
        if (!personal.AgenteId && padronItem.Id) {
          await tx.personal.update({
            where: { Id: personal.Id },
            data: { AgenteId: padronItem.Id }
          });
        }

        const isGuardia24h = (padronItem.RacionesMaximasDia === 2) || Boolean(padronItem.EsGuardia24h);

        if (!isGuardia24h) {
          if (mealsRequested > 1) {
            throw new Error(`El agente ${personal.NombreCompleto} (1 Ración Global) solo posee cupo para 1 comida por día.`);
          }
          if (isAlmuerzo && o.almuerzoDieta && !almuerzoDelivered) {
            const cenaExistentePlanilla = await tx.pedidosComida.findFirst({
              where: {
                FechaPedido: targetDate,
                TipoComida: 'Cena',
                Estado: { in: ['Pendiente', 'Aprobado'] },
                OR: [
                  { AgenteId: padronItem.Id },
                  { Personal: { DNI: personal.DNI } }
                ]
              },
              include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
            });
            if (cenaExistentePlanilla) {
              if (cenaExistentePlanilla.FechaEntregado) {
                throw new Error(`El agente ${personal.NombreCompleto} ya retiró su Cena para esta fecha, por lo que no puede cambiar a Almuerzo.`);
              }
              const cenaServicioId = cenaExistentePlanilla.SolicitadoPor?.ServicioId || cenaExistentePlanilla.Personal?.ServicioId;
              if (solicitanteServicioId && cenaServicioId === solicitanteServicioId) {
                // El mismo servicio esta cambiando de Cena a Almuerzo: borramos la Cena anterior de la planilla
                await tx.pedidosComida.delete({ where: { Id: cenaExistentePlanilla.Id } });
              } else {
                const sNombre = cenaExistentePlanilla.SolicitadoPor?.Servicio?.Nombre || cenaExistentePlanilla.Personal?.Servicio?.Nombre || 'otro servicio';
                throw new Error(`El agente ${personal.NombreCompleto} (1 Ración Global) ya tiene registrada una Cena para esa fecha en el servicio "${sNombre}".`);
              }
            }
          }
          if (isCena && o.cenaDieta && !cenaDelivered) {
            const almuerzoExistentePlanilla = await tx.pedidosComida.findFirst({
              where: {
                FechaPedido: targetDate,
                TipoComida: 'Almuerzo',
                Estado: { in: ['Pendiente', 'Aprobado'] },
                OR: [
                  { AgenteId: padronItem.Id },
                  { Personal: { DNI: personal.DNI } }
                ]
              },
              include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
            });
            if (almuerzoExistentePlanilla) {
              if (almuerzoExistentePlanilla.FechaEntregado) {
                throw new Error(`El agente ${personal.NombreCompleto} ya retiró su Almuerzo para esta fecha, por lo que no puede cambiar a Cena.`);
              }
              const almuerzoServicioId = almuerzoExistentePlanilla.SolicitadoPor?.ServicioId || almuerzoExistentePlanilla.Personal?.ServicioId;
              if (solicitanteServicioId && almuerzoServicioId === solicitanteServicioId) {
                // El mismo servicio esta cambiando de Almuerzo a Cena: borramos el Almuerzo anterior de la planilla
                await tx.pedidosComida.delete({ where: { Id: almuerzoExistentePlanilla.Id } });
              } else {
                const sNombre = almuerzoExistentePlanilla.SolicitadoPor?.Servicio?.Nombre || almuerzoExistentePlanilla.Personal?.Servicio?.Nombre || 'otro servicio';
                throw new Error(`El agente ${personal.NombreCompleto} (1 Ración Global) ya tiene registrado un Almuerzo para esa fecha en el servicio "${sNombre}".`);
              }
            }
          }
        }

        if (isAlmuerzo && o.almuerzoDieta) {
          if (almuerzoDelivered) {
            // Ya fue entregado físicamente en comedor: se preserva intacto en la BD (no se reinserta ni resetea)
          } else {
            const almuerzoExistente = await tx.pedidosComida.findFirst({
              where: {
                FechaPedido: targetDate,
                TipoComida: 'Almuerzo',
                Estado: { in: ['Pendiente', 'Aprobado'] },
                OR: [
                  { AgenteId: padronItem.Id },
                  { Personal: { DNI: personal.DNI } },
                  { EmergenciaDNI: personal.DNI }
                ]
              },
              include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
            });
            if (almuerzoExistente) {
              const esEmergencia = Boolean(almuerzoExistente.EmergenciaDNI);
              const sNombre = esEmergencia ? 'una solicitud de emergencia' : `el servicio "${almuerzoExistente.SolicitadoPor?.Servicio?.Nombre || almuerzoExistente.Personal?.Servicio?.Nombre || 'otro servicio'}"`;
              throw new Error(`El agente ${personal.NombreCompleto} (DNI ${personal.DNI}) ya tiene un Almuerzo solicitado mediante ${sNombre}.`);
            }
            
            newOrders.push({
              FechaPedido: targetDate,
              TipoComida: 'Almuerzo',
              TipoDieta: o.almuerzoDieta,
              PersonalId: o.personalId,
              AgenteId: padronItem.Id,
              SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
              Estado: 'Aprobado'
            });
          }
        }

        if (isCena && o.cenaDieta) {
          if (cenaDelivered) {
            // Ya fue entregado físicamente en comedor: se preserva intacto en la BD (no se reinserta ni resetea)
          } else {
            const cenaExistente = await tx.pedidosComida.findFirst({
              where: {
                FechaPedido: targetDate,
                TipoComida: 'Cena',
                Estado: { in: ['Pendiente', 'Aprobado'] },
                OR: [
                  { AgenteId: padronItem.Id },
                  { Personal: { DNI: personal.DNI } },
                  { EmergenciaDNI: personal.DNI }
                ]
              },
              include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
            });
            if (cenaExistente) {
              const esEmergencia = Boolean(cenaExistente.EmergenciaDNI);
              const sNombre = esEmergencia ? 'una solicitud de emergencia' : `el servicio "${cenaExistente.SolicitadoPor?.Servicio?.Nombre || cenaExistente.Personal?.Servicio?.Nombre || 'otro servicio'}"`;
              throw new Error(`El agente ${personal.NombreCompleto} (DNI ${personal.DNI}) ya tiene una Cena solicitada mediante ${sNombre}.`);
            }

            newOrders.push({
              FechaPedido: targetDate,
              TipoComida: 'Cena',
              TipoDieta: o.cenaDieta,
              PersonalId: o.personalId,
              AgenteId: padronItem.Id,
              SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
              Estado: 'Aprobado'
            });
          }
        }
      }

      if (newOrders.length > 0) {
        await tx.pedidosComida.createMany({ data: newOrders });
      }
    });

    res.json({ 
      message: 'Pedidos guardados exitosamente',
      sinRacionOmitidos: sinRacionSkipped
    });
  } catch (error: any) {
    console.error('Bulk save error:', error);
    res.status(500).json({ error: 'Error al guardar pedidos: ' + (error.message || error.toString()) });
  }
});

// 5.2 Crear solicitud de emergencia (soporta fecha de hoy o fecha futura habilitada)
app.post('/api/emergencies', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const nombreCompleto = req.body.nombreCompleto || req.body.nombre || (req.body.apellido ? `${req.body.apellido} ${req.body.nombre}` : '');
  const { dni, periodoInicio, periodoFin, tipoComida, tipoDieta, tipoDietaCena, justificacion, solicitadoPorUsuarioId, reemplazaId, esExcepcional, tipoSolicitud, autoAprobar, esNutricionGerencia, fecha } = req.body;

  const effectiveUserId = req.user?.userId || (solicitadoPorUsuarioId ? Number(solicitadoPorUsuarioId) : undefined);
  if (!effectiveUserId) {
    res.status(400).json({ error: 'No se pudo identificar el usuario solicitante autenticado.' });
    return;
  }

  const isAutoAprobado = Boolean(autoAprobar || esNutricionGerencia);
  const isExcepcional = Boolean(esExcepcional || tipoSolicitud === 'reemplazo_excepcional');

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const targetFechaStr = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : todayStr;
  const targetDate = new Date(`${targetFechaStr}T00:00:00.000Z`);

  // Si la fecha solicitada es FUTURA, verificar que este autorizada por Gerencia
  if (targetFechaStr > todayStr) {
    const user = await prisma.usuarios.findUnique({ where: { Id: effectiveUserId } });
    if (!user || !user.HospitalId) {
      res.status(400).json({ error: 'Usuario sin hospital asignado para validacion de fecha anticipada.' });
      return;
    }

    const habilitada = await prisma.fechasAnticipadasHabilitadas.findFirst({
      where: {
        HospitalId: user.HospitalId,
        FechaHabilitada: targetDate,
        Activo: true
      }
    });

    if (!habilitada) {
      res.status(400).json({ error: `La fecha seleccionada (${targetFechaStr.split('-').reverse().join('/')}) no se encuentra habilitada por Gerencia para carga anticipada.` });
      return;
    }
  }

  // Validate authorization deadlines solo si es HOY y NO es auto-aprobado ni reemplazo excepcional
  let comidasToCheck = tipoComida === 'Ambos' ? ['Almuerzo', 'Cena'] : [tipoComida || 'Almuerzo'];
  if (targetFechaStr === todayStr && !isExcepcional && !isAutoAprobado) {
    for (const tc of comidasToCheck) {
      const errorMsg = await checkAuthDeadlines(solicitadoPorUsuarioId, tc);
      if (errorMsg) {
        res.status(400).json({ error: `${errorMsg} Para emergencias de última hora utilice la opción ⚡ Reemplazo Excepcional.` });
        return;
      }
    }
  }

  try {
    const start = targetDate;
    const end = targetDate;

    // Determinar servicio de destino
    let targetServicioNombre = '';
    if (req.body.servicioId) {
      const sObj = await prisma.servicios.findUnique({ where: { Id: Number(req.body.servicioId) } });
      if (sObj) targetServicioNombre = sObj.Nombre;
    }
    if (!targetServicioNombre && reemplazaId) {
      const pTitular = await prisma.personal.findUnique({ where: { Id: Number(reemplazaId) }, include: { Servicio: true } });
      if (pTitular?.Servicio?.Nombre) targetServicioNombre = pTitular.Servicio.Nombre;
    }
    if (!targetServicioNombre && effectiveUserId) {
      const reqUser = await prisma.usuarios.findUnique({ where: { Id: Number(effectiveUserId) } });
      // Para usuarios con rol Nutrición (5) o Gerencia (2), no usar su ServicioId de usuario como fallback cuando cargan emergencias sin servicio
      if (reqUser?.ServicioId && reqUser.RolId !== 2 && reqUser.RolId !== 5) {
        const sObj = await prisma.servicios.findUnique({ where: { Id: reqUser.ServicioId } });
        if (sObj) targetServicioNombre = sObj.Nombre;
      }
    }

    // Construir justificación con la marca especial si es cargado por Nutrición / Gerencia y el tag de servicio
    let finalJustificacion = justificacion || (isExcepcional ? 'Reemplazo excepcional de última hora' : 'Solicitud de emergencia');
    if (isAutoAprobado && !finalJustificacion.includes('[EMERGENCIA NUTRICIÓN / GERENCIA]')) {
      finalJustificacion = `[EMERGENCIA NUTRICIÓN / GERENCIA] ${finalJustificacion}`;
    }
    if (targetServicioNombre && !finalJustificacion.includes('[SERVICIO:')) {
      finalJustificacion = `[SERVICIO:${targetServicioNombre}] ${finalJustificacion}`;
    }

    // Si es reemplazo excepcional con titular, obtener la comida/dieta del titular asignado si no se especificaron
    let finalTipoDieta = tipoDieta || 'Normal';
    if (isExcepcional && reemplazaId) {
      const pedidoTitular = await prisma.pedidosComida.findFirst({
        where: { PersonalId: Number(reemplazaId), FechaPedido: start }
      });
      if (pedidoTitular) {
        comidasToCheck = [pedidoTitular.TipoComida];
        finalTipoDieta = pedidoTitular.TipoDieta;
      }
    }

    // Validar si ya existe un reemplazo activo para el agente titular en las fechas/comidas solicitadas
    if (reemplazaId) {
      const titular = await prisma.personal.findUnique({ where: { Id: Number(reemplazaId) } });
      let currentCheck = new Date(start);
      while (currentCheck <= end) {
        for (const tc of comidasToCheck) {
          const existente = await prisma.pedidosComida.findFirst({
            where: {
              EmergenciaReemplazaId: Number(reemplazaId),
              FechaPedido: currentCheck,
              TipoComida: tc,
              Estado: { in: ['Pendiente', 'Aprobado'] }
            }
          });
          if (existente) {
            const fStr = currentCheck.toISOString().split('T')[0].split('-').reverse().join('/');
            const titularNombre = titular ? titular.NombreCompleto : 'seleccionado';
            res.status(400).json({
              error: `El agente titular "${titularNombre}" ya posee un reemplazo registrado (${tc}) para la fecha ${fStr}.`
            });
            return;
          }
        }
        currentCheck.setDate(currentCheck.getDate() + 1);
      }
    }

    // Validar si la persona reemplazante / agregado extra (DNI) ya tiene una ración asignada en emergencias o en la planilla de personal
    if (dni) {
      let currentCheckDni = new Date(start);
      while (currentCheckDni <= end) {
        for (const tc of comidasToCheck) {
          // 1. Validar si ya tiene una emergencia activa
          const existenteDni = await prisma.pedidosComida.findFirst({
            where: {
              EmergenciaDNI: dni,
              FechaPedido: currentCheckDni,
              TipoComida: tc,
              Estado: { in: ['Pendiente', 'Aprobado'] }
            }
          });
          if (existenteDni) {
            const fStr = currentCheckDni.toISOString().split('T')[0].split('-').reverse().join('/');
            res.status(400).json({
              error: `La persona con DNI ${dni} ya posee una solicitud de emergencia activa (${tc}) para la fecha ${fStr}.`
            });
            return;
          }

          // 2. Validar si es un agente que ya recibe ración en la planilla normal de personal
          const existentePlanilla = await prisma.pedidosComida.findFirst({
            where: {
              FechaPedido: currentCheckDni,
              TipoComida: tc,
              Estado: { in: ['Pendiente', 'Aprobado'] },
              Personal: { DNI: dni }
            },
            include: {
              Personal: true
            }
          });
          if (existentePlanilla) {
            const fStr = currentCheckDni.toISOString().split('T')[0].split('-').reverse().join('/');
            const agenteNombre = existentePlanilla.Personal?.NombreCompleto || `con DNI ${dni}`;
            res.status(400).json({
              error: `El agente "${agenteNombre}" (DNI ${dni}) ya posee asignada una ración de ${tc} en la planilla de personal para el día ${fStr}. No se puede cargar como emergencia.`
            });
            return;
          }
        }
        currentCheckDni.setDate(currentCheckDni.getDate() + 1);
      }
    }

    // Normalización: Asegurar Agente en PadronHabilitados y resolver ReemplazaAgenteId
    let emgAgenteId: number | null = null;
    if (dni && String(dni).trim() !== '') {
      const cleanDni = String(dni).trim();
      let padronAgente = await prisma.padronHabilitados.findUnique({ where: { DNI: cleanDni } });
      if (!padronAgente) {
        const reqUser = await prisma.usuarios.findUnique({ where: { Id: Number(effectiveUserId) } });
        const existingStaff = await prisma.personal.findFirst({
          where: { DNI: cleanDni, Activo: true }
        });
        padronAgente = await prisma.padronHabilitados.create({
          data: {
            DNI: cleanDni,
            NombreCompleto: nombreCompleto || existingStaff?.NombreCompleto || 'Agente Emergencia',
            EsGuardia24h: false,
            RacionesMaximasDia: 1,
            Activo: true,
            HospitalId: reqUser?.HospitalId || existingStaff?.HospitalId || null,
            ServicioId: reqUser?.ServicioId || existingStaff?.ServicioId || null,
            OrigenAlta: 'EMERGENCIA_PROVISORIA'
          }
        });

        if (existingStaff && !existingStaff.AgenteId) {
          await prisma.personal.update({
            where: { Id: existingStaff.Id },
            data: { AgenteId: padronAgente.Id }
          });
        }
      }
      emgAgenteId = padronAgente.Id;
    }

    let reemplazaAgenteId: number | null = null;
    let titularDni: string | undefined = undefined;
    if (reemplazaId) {
      const titular = await prisma.personal.findUnique({ where: { Id: Number(reemplazaId) } });
      titularDni = titular?.DNI;
      if (titular?.AgenteId) {
        reemplazaAgenteId = titular.AgenteId;
      } else if (titular?.DNI) {
        const titularPadron = await prisma.padronHabilitados.findUnique({ where: { DNI: titular.DNI } });
        reemplazaAgenteId = titularPadron?.Id || null;
      }
    }

    const newOrders = [];
    let current = new Date(start);
    
    while (current <= end) {
      for (const tc of comidasToCheck) {
        newOrders.push({
          FechaPedido: new Date(current),
          TipoComida: tc,
          TipoDieta: tc === 'Cena' && tipoComida === 'Ambos' && tipoDietaCena ? tipoDietaCena : finalTipoDieta,
          SolicitadoPorUsuarioId: Number(effectiveUserId),
          Estado: (isAutoAprobado || isExcepcional) ? 'Aprobado' : 'Pendiente',
          AgenteId: emgAgenteId,
          ReemplazaAgenteId: reemplazaAgenteId,
          EmergenciaNombreCompleto: nombreCompleto || '',
          EmergenciaDNI: dni || '',
          EmergenciaPeriodoInicio: start,
          EmergenciaPeriodoFin: end,
          EmergenciaReemplazaId: reemplazaId ? Number(reemplazaId) : null,
          JustificacionSolicitud: finalJustificacion,
          JustificacionResolucion: isAutoAprobado ? 'Auto-autorizado por Encargado de Nutrición / Gerencia' : null,
          EsExcepcional: isExcepcional
        });
      }
      current.setDate(current.getDate() + 1);
    }

    if (reemplazaId) {
      // Validar si el titular ya retiró comida en ese rango de fechas
      const deliveredTitular = await prisma.pedidosComida.findFirst({
        where: {
          FechaPedido: { gte: start, lte: end },
          FechaEntregado: { not: null },
          ...(tipoComida !== 'Ambos' ? { TipoComida: tipoComida } : {}),
          OR: [
            { PersonalId: Number(reemplazaId) },
            ...(reemplazaAgenteId ? [{ AgenteId: reemplazaAgenteId }] : []),
            ...(titularDni ? [{ Personal: { DNI: titularDni } }, { EmergenciaDNI: titularDni }] : [])
          ]
        }
      });

      if (deliveredTitular) {
        res.status(400).json({ error: 'No es posible solicitar reemplazo para un agente cuya vianda ya fue entregada y retirada en comedor.' });
        return;
      }

      await prisma.pedidosComida.deleteMany({
        where: {
          FechaPedido: { gte: start, lte: end },
          FechaEntregado: null,
          OR: [
            { PersonalId: Number(reemplazaId) },
            ...(reemplazaAgenteId ? [{ AgenteId: reemplazaAgenteId }] : []),
            ...(titularDni ? [{ Personal: { DNI: titularDni } }, { EmergenciaDNI: titularDni }] : [])
          ]
        }
      });
    }

    await prisma.pedidosComida.createMany({ data: newOrders });
    await logAudit(req, isAutoAprobado ? 'EMERGENCIA_NUTRICION_AUTOAPROBADA' : (isExcepcional ? 'REEMPLAZO_EXCEPCIONAL' : 'ALTA_EMERGENCIA'), `Solicitud de emergencia (${isAutoAprobado ? 'Nutrición Auto-aprobada' : (isExcepcional ? 'Excepcional' : 'Normal')}) creada para DNI ${dni}`);
    res.json({ message: isAutoAprobado ? 'Solicitud de emergencia auto-autorizada y registrada exitosamente.' : (isExcepcional ? 'Reemplazo excepcional registrado exitosamente.' : 'Solicitudes de emergencia creadas y pendientes de aprobación.') });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear solicitud de emergencia' });
  }
});

async function enrichEmergencyList(list: any[]) {
  const dnisToSearch = list
    .filter(p => (!p.EmergenciaNombreCompleto || p.EmergenciaNombreCompleto.trim() === '') && p.EmergenciaDNI)
    .map(p => p.EmergenciaDNI as string);

  const padronMap = new Map<string, string>();
  const personalMap = new Map<string, string>();

  if (dnisToSearch.length > 0) {
    const padronList = await prisma.padronHabilitados.findMany({
      where: { DNI: { in: dnisToSearch } }
    });
    padronList.forEach(p => padronMap.set(p.DNI, p.NombreCompleto));

    const personalList = await prisma.personal.findMany({
      where: { DNI: { in: dnisToSearch } }
    });
    personalList.forEach(p => personalMap.set(p.DNI, p.NombreCompleto));
  }

  return list.map(p => {
    let name = p.Agente?.NombreCompleto || p.EmergenciaNombreCompleto;
    if ((!name || name.trim() === '') && p.Personal?.NombreCompleto) {
      name = p.Personal.NombreCompleto;
    }
    if ((!name || name.trim() === '') && p.EmergenciaDNI) {
      name = padronMap.get(p.EmergenciaDNI) || personalMap.get(p.EmergenciaDNI) || '';
    }
    if ((!name || name.trim() === '') && p.PersonalReemplazado?.NombreCompleto) {
      name = p.PersonalReemplazado.NombreCompleto;
    }

    let dni = p.Agente?.DNI || p.EmergenciaDNI;
    if ((!dni || dni.trim() === '') && p.Personal?.DNI) {
      dni = p.Personal.DNI;
    }
    if ((!dni || dni.trim() === '') && p.PersonalReemplazado?.DNI) {
      dni = p.PersonalReemplazado.DNI;
    }

    let servicioObj = null;
    if (p.JustificacionSolicitud && p.JustificacionSolicitud.includes('[SERVICIO:')) {
      const match = p.JustificacionSolicitud.match(/\[SERVICIO:(.*?)\]/);
      if (match && match[1]) {
        servicioObj = { Nombre: match[1] };
      }
    }
    if (!servicioObj) {
      servicioObj = p.Servicio || p.Personal?.Servicio || p.PersonalReemplazado?.Servicio || p.SolicitadoPor?.Servicio;
    }

    return { 
      ...p,
      Agente: p.Agente || (name && dni ? { DNI: dni, NombreCompleto: name } : null),
      Personal: p.Personal || (name && dni ? { DNI: dni, NombreCompleto: name, Servicio: servicioObj } : null),
      EmergenciaNombreCompleto: name || p.EmergenciaNombreCompleto,
      EmergenciaDNI: dni || p.EmergenciaDNI,
      Servicio: servicioObj || p.Servicio
    };
  });
}

// 5.3 Obtener solicitudes de emergencia pendientes para el Gerente (hoy y días posteriores)
app.get('/api/emergencies/pending', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'El usuario no tiene hospital asignado' });
    return;
  }

  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const pending = await prisma.pedidosComida.findMany({
      where: { 
        Estado: 'Pendiente',
        FechaPedido: { gte: today },
        SolicitadoPor: { HospitalId: hospitalId }
      },
      orderBy: { Id: 'desc' },
      include: { 
        Agente: { include: { Servicio: true, Hospital: true } },
        ReemplazaAgente: { include: { Servicio: true, Hospital: true } },
        SolicitadoPor: { include: { Servicio: true, Hospital: true } }, 
        PersonalReemplazado: { include: { Servicio: true, Hospital: true } },
        Personal: { include: { Servicio: true, Hospital: true } }
      }
    });

    const enriched = await enrichEmergencyList(pending);
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

// 5.3.4 Obtener solicitudes de emergencia aprobadas para el Gerente (hoy y días posteriores)
app.get('/api/emergencies/approved', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'El usuario no tiene hospital asignado' });
    return;
  }

  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const approved = await prisma.pedidosComida.findMany({
      where: { 
        Estado: 'Aprobado',
        FechaPedido: { gte: today },
        SolicitadoPor: { HospitalId: hospitalId }
      },
      orderBy: { Id: 'desc' },
      include: { 
        Agente: { include: { Servicio: true, Hospital: true } },
        ReemplazaAgente: { include: { Servicio: true, Hospital: true } },
        SolicitadoPor: { include: { Servicio: true, Hospital: true } }, 
        PersonalReemplazado: { include: { Servicio: true, Hospital: true } },
        Personal: { include: { Servicio: true, Hospital: true } },
        EvaluadoPor: true 
      }
    });

    const enriched = await enrichEmergencyList(approved);
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener emergencias aprobadas' });
  }
});

// 5.3.5 Obtener solicitudes de emergencia rechazadas para el Gerente (hoy y días posteriores)
app.get('/api/emergencies/rejected', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'El usuario no tiene hospital asignado' });
    return;
  }

  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const rejected = await prisma.pedidosComida.findMany({
      where: { 
        Estado: 'Rechazado',
        FechaPedido: { gte: today },
        SolicitadoPor: { HospitalId: hospitalId }
      },
      orderBy: { Id: 'desc' },
      include: { 
        Agente: { include: { Servicio: true, Hospital: true } },
        ReemplazaAgente: { include: { Servicio: true, Hospital: true } },
        SolicitadoPor: { include: { Servicio: true, Hospital: true } }, 
        PersonalReemplazado: { include: { Servicio: true, Hospital: true } },
        Personal: { include: { Servicio: true, Hospital: true } },
        EvaluadoPor: true 
      }
    });

    const enriched = await enrichEmergencyList(rejected);
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener emergencias rechazadas' });
  }
});

// 5.3.6 Historial de emergencias (por Servicio u Hospital)
app.get('/api/emergencies/history', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId || Number(req.query.userId);
  if (!userId) {
    res.status(400).json({ error: 'Usuario no especificado' });
    return;
  }
  
  try {
    const requestingUser = await prisma.usuarios.findUnique({
      where: { Id: userId }
    });

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const fiveDaysAgoUTC = new Date(Date.UTC(fiveDaysAgo.getFullYear(), fiveDaysAgo.getMonth(), fiveDaysAgo.getDate()));
    
    let whereCondition: any = {
      OR: [
        { JustificacionSolicitud: { not: null } },
        { EmergenciaReemplazaId: { not: null } }
      ],
      FechaPedido: { gte: fiveDaysAgoUTC }
    };

    if (requestingUser?.ServicioId) {
      const jefeServicioObj = await prisma.servicios.findUnique({ where: { Id: requestingUser.ServicioId } });
      const jefeServicioNombre = jefeServicioObj?.Nombre || '';

      whereCondition = {
        AND: [
          {
            OR: [
              { JustificacionSolicitud: { not: null } },
              { EmergenciaReemplazaId: { not: null } }
            ]
          },
          { FechaPedido: { gte: fiveDaysAgoUTC } },
          ...(requestingUser.HospitalId ? [{
            OR: [
              { SolicitadoPor: { HospitalId: requestingUser.HospitalId } },
              { Personal: { HospitalId: requestingUser.HospitalId } },
              { PersonalReemplazado: { HospitalId: requestingUser.HospitalId } }
            ]
          }] : []),
          {
            OR: [
              { SolicitadoPor: { ServicioId: requestingUser.ServicioId } },
              { Personal: { ServicioId: requestingUser.ServicioId } },
              { PersonalReemplazado: { ServicioId: requestingUser.ServicioId } },
              ...(jefeServicioNombre ? [{ JustificacionSolicitud: { contains: `[SERVICIO:${jefeServicioNombre}]` } }] : [])
            ]
          }
        ]
      };
    } else if (requestingUser?.HospitalId) {
      whereCondition.SolicitadoPor = { HospitalId: requestingUser.HospitalId };
    } else {
      whereCondition.SolicitadoPorUsuarioId = userId;
    }

    const history = await prisma.pedidosComida.findMany({
      where: whereCondition,
      orderBy: { Id: 'desc' },
      include: { 
        Agente: { include: { Servicio: true, Hospital: true } },
        ReemplazaAgente: { include: { Servicio: true, Hospital: true } },
        PersonalReemplazado: { include: { Servicio: true, Hospital: true } }, 
        Personal: { include: { Servicio: true, Hospital: true } }, 
        EvaluadoPor: true, 
        SolicitadoPor: { include: { Servicio: true, Hospital: true } } 
      }
    });

    const enriched = await enrichEmergencyList(history);
    let finalHistory = enriched;
    if (requestingUser?.ServicioId) {
      const jefeServicioObj = await prisma.servicios.findUnique({ where: { Id: requestingUser.ServicioId } });
      if (jefeServicioObj?.Nombre) {
        const jNombre = jefeServicioObj.Nombre.trim().toLowerCase();
        finalHistory = enriched.filter((e: any) => {
          const eHospitalId = e.SolicitadoPor?.HospitalId || e.Personal?.HospitalId || e.PersonalReemplazado?.HospitalId;
          if (requestingUser.HospitalId && eHospitalId && eHospitalId !== requestingUser.HospitalId) {
            return false;
          }
          const eServicioNombre = e.Servicio?.Nombre ? e.Servicio.Nombre.trim().toLowerCase() : '';
          return eServicioNombre === jNombre;
        });
      }
    }
    res.json(finalHistory);
  } catch (error) {
    console.error('Error fetching emergency history:', error);
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// 5.4 Aprobar, Rechazar o Revertir emergencia
app.post('/api/emergencies/:id/resolve', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { estado, justificacionResolucion, evaluadoPorUsuarioId } = req.body; // estado: 'Aprobado', 'Rechazado' o 'Pendiente'

  if (estado === 'Rechazado' && (!justificacionResolucion || justificacionResolucion.trim() === '')) {
    res.status(400).json({ error: 'La justificación es obligatoria al rechazar una solicitud.' });
    return;
  }

  try {
    const pedido = await prisma.pedidosComida.findUnique({
      where: { Id: Number(id) },
      include: { SolicitadoPor: { include: { Hospital: true } } }
    });

    if (!pedido) {
      res.status(404).json({ error: 'Solicitud de emergencia no encontrada' });
      return;
    }

    const hospital = pedido.SolicitadoPor?.Hospital;
    if (hospital) {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      const pedidoDate = new Date(pedido.FechaPedido);
      const pYear = pedidoDate.getUTCFullYear();
      const pMonth = String(pedidoDate.getUTCMonth() + 1).padStart(2, '0');
      const pDay = String(pedidoDate.getUTCDate()).padStart(2, '0');
      const pedidoFechaStr = `${pYear}-${pMonth}-${pDay}`;

      // Evaluar límite de horario de autorización únicamente si la emergencia es para el día de HOY
      if (pedidoFechaStr === todayStr) {
        const currentTotalMins = now.getHours() * 60 + now.getMinutes();

        if (pedido.TipoComida === 'Almuerzo' || pedido.TipoComida === 'Ambos') {
          const limitAuthAlm = hospital.LimiteAutorizacionAlmuerzo || '11:00';
          const [h, m] = limitAuthAlm.split(':').map(Number);
          if (currentTotalMins >= h * 60 + m) {
            res.status(400).json({ error: `La hora límite para autorizar o modificar emergencias de Almuerzo de hoy (${limitAuthAlm}) ha expirado.` });
            return;
          }
        }

        if (pedido.TipoComida === 'Cena' || pedido.TipoComida === 'Ambos') {
          const limitAuthCen = hospital.LimiteAutorizacionCena || '18:00';
          const [h, m] = limitAuthCen.split(':').map(Number);
          if (currentTotalMins >= h * 60 + m) {
            res.status(400).json({ error: `La hora límite para autorizar o modificar emergencias de Cena de hoy (${limitAuthCen}) ha expirado.` });
            return;
          }
        }
      }
    }

    const isPending = estado === 'Pendiente';
    await prisma.pedidosComida.update({
      where: { Id: Number(id) },
      data: {
        Estado: estado,
        JustificacionResolucion: isPending ? null : (justificacionResolucion || (estado === 'Aprobado' ? 'Aprobado sin observaciones' : null)),
        EvaluadoPorUsuarioId: isPending ? null : (evaluadoPorUsuarioId || req.user?.userId)
      }
    });

    // Si se rechaza un reemplazo excepcional que tenía titular asignado, restaurar la vianda al titular si sigue activo
    if (estado === 'Rechazado' && pedido.EsExcepcional && pedido.EmergenciaReemplazaId) {
      const titular = await prisma.personal.findUnique({ where: { Id: pedido.EmergenciaReemplazaId } });
      if (titular && titular.Activo) {
        const titularAgenteId = pedido.ReemplazaAgenteId || titular.AgenteId || null;
        const titularDni = titular.DNI;
        const pedidoExistenteTitular = await prisma.pedidosComida.findFirst({
          where: {
            FechaPedido: pedido.FechaPedido,
            TipoComida: pedido.TipoComida,
            Estado: { in: ['Pendiente', 'Aprobado'] },
            OR: [
              { PersonalId: titular.Id },
              ...(titularAgenteId ? [{ AgenteId: titularAgenteId }] : []),
              ...(titularDni ? [{ Personal: { DNI: titularDni } }, { EmergenciaDNI: titularDni }] : [])
            ]
          }
        });
        if (!pedidoExistenteTitular) {
          await prisma.pedidosComida.create({
            data: {
              FechaPedido: pedido.FechaPedido,
              TipoComida: pedido.TipoComida,
              TipoDieta: pedido.TipoDieta || 'Normal',
              PersonalId: titular.Id,
              AgenteId: titularAgenteId,
              SolicitadoPorUsuarioId: pedido.SolicitadoPorUsuarioId,
              Estado: 'Aprobado',
              EsExcepcional: false
            }
          });
        }
      }
    }

    await logAudit(req, isPending ? 'REVERTIR_EMERGENCIA' : 'AUTORIZACION_EMERGENCIA', `Solicitud de emergencia ID ${id} - ${estado}`);
    res.json({ message: isPending ? 'Solicitud devuelta a estado pendiente exitosamente.' : `Solicitud ${estado.toLowerCase()} exitosamente.` });
  } catch (error) {
    res.status(500).json({ error: 'Error al resolver la solicitud' });
  }
});

// Función compartida para revertir / eliminar solicitud de emergencia
async function handleEliminarORevertirEmergencia(req: Request, res: Response, id: number): Promise<void> {
  const pedido = await prisma.pedidosComida.findUnique({
    where: { Id: Number(id) },
    include: {
      Personal: true,
      PersonalReemplazado: true,
      SolicitadoPor: true
    }
  });

  if (!pedido) {
    res.status(404).json({ error: 'Solicitud de emergencia no encontrada.' });
    return;
  }

  // Si ya fue entregado en comedor, no se puede anular ni revertir
  if (pedido.FechaEntregado) {
    res.status(400).json({ error: 'No se puede revertir o eliminar una vianda de emergencia que ya fue entregada en comedor.' });
    return;
  }

  // Las solicitudes normales solo se pueden eliminar en estado Pendiente.
  // Los reemplazos excepcionales (auto-aprobados) se pueden revertir siempre que no hayan sido entregados.
  if (pedido.Estado !== 'Pendiente' && !pedido.EsExcepcional) {
    res.status(400).json({ error: 'Solo se pueden eliminar solicitudes en estado Pendiente o Reemplazos Excepcionales no entregados.' });
    return;
  }

  // Validación de permisos
  const user = req.user;
  if (user) {
    const isAdminOrNutricion = [1, 2, 5].includes(user.roleId);
    const isCreator = pedido.SolicitadoPorUsuarioId === user.userId;
    const isSameHospital = !user.hospitalId ||
      pedido.SolicitadoPor?.HospitalId === user.hospitalId ||
      pedido.PersonalReemplazado?.HospitalId === user.hospitalId ||
      pedido.Personal?.HospitalId === user.hospitalId;
    const isSameService = !user.servicioId ||
      pedido.SolicitadoPor?.ServicioId === user.servicioId ||
      pedido.PersonalReemplazado?.ServicioId === user.servicioId ||
      pedido.Personal?.ServicioId === user.servicioId;

    if (!isAdminOrNutricion && !isCreator && !(isSameHospital && isSameService)) {
      res.status(403).json({ error: 'No tienes permisos para eliminar o revertir esta solicitud.' });
      return;
    }
  }

  // Si es un reemplazo excepcional (o reemplazo con titular asignado), restaurar la vianda original al agente titular
  let titularRestauradoNombre: string | null = null;
  if (pedido.EmergenciaReemplazaId) {
    const titular = await prisma.personal.findUnique({
      where: { Id: pedido.EmergenciaReemplazaId }
    });

    if (titular && titular.Activo) {
      let isBajaEnFecha = false;
      if (titular.BajaProvisoriaFecha) {
        const d = new Date(titular.BajaProvisoriaFecha);
        const pDate = new Date(pedido.FechaPedido);
        let hStr = "9999-12-31";
        if (titular.BajaProvisoriaHasta) {
          const h = new Date(titular.BajaProvisoriaHasta);
          hStr = h.toISOString().split('T')[0];
        }
        const dStr = d.toISOString().split('T')[0];
        const pDateStr = pDate.toISOString().split('T')[0];
        isBajaEnFecha = pDateStr >= dStr && pDateStr <= hStr;
      }

      // Solo si el titular no está de baja ni inhabilitado en esta fecha
      if (!isBajaEnFecha && !titular.BajaMotivo) {
        const titularAgenteId = pedido.ReemplazaAgenteId || titular.AgenteId || null;
        const titularDni = titular.DNI;

        const pedidoExistenteTitular = await prisma.pedidosComida.findFirst({
          where: {
            FechaPedido: pedido.FechaPedido,
            TipoComida: pedido.TipoComida,
            Estado: { in: ['Pendiente', 'Aprobado'] },
            OR: [
              { PersonalId: titular.Id },
              ...(titularAgenteId ? [{ AgenteId: titularAgenteId }] : []),
              ...(titularDni ? [{ Personal: { DNI: titularDni } }, { EmergenciaDNI: titularDni }] : [])
            ]
          }
        });

        if (!pedidoExistenteTitular) {
          await prisma.pedidosComida.create({
            data: {
              FechaPedido: pedido.FechaPedido,
              TipoComida: pedido.TipoComida,
              TipoDieta: pedido.TipoDieta || 'Normal',
              PersonalId: titular.Id,
              AgenteId: titularAgenteId,
              SolicitadoPorUsuarioId: pedido.SolicitadoPorUsuarioId,
              Estado: 'Aprobado',
              EsExcepcional: false
            }
          });
          titularRestauradoNombre = titular.NombreCompleto;
        }
      }
    }
  }

  // Eliminar el pedido de emergencia
  await prisma.pedidosComida.delete({
    where: { Id: Number(id) }
  });

  const auditAction = pedido.EsExcepcional ? 'REVERTIR_REEMPLAZO_EXCEPCIONAL' : 'ELIMINAR_EMERGENCIA';
  const auditDetail = pedido.EsExcepcional
    ? `Reemplazo excepcional ID ${id} revertido.${titularRestauradoNombre ? ` Vianda restaurada a titular "${titularRestauradoNombre}".` : ''}`
    : `Solicitud de emergencia ID ${id} eliminada.`;

  await logAudit(req, auditAction, auditDetail);

  res.json({
    message: pedido.EsExcepcional
      ? `Reemplazo excepcional revertido exitosamente.${titularRestauradoNombre ? ` Se restauró la vianda a ${titularRestauradoNombre}.` : ''}`
      : 'Solicitud de emergencia eliminada exitosamente.',
    titularRestaurado: titularRestauradoNombre
  });
}

// 5.5 Eliminar solicitud de emergencia pendiente o Revertir reemplazo excepcional
app.delete('/api/emergencies/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    await handleEliminarORevertirEmergencia(req, res, Number(id));
  } catch (error) {
    console.error('Error deleting/reverting emergency:', error);
    res.status(500).json({ error: 'Error al eliminar o revertir la solicitud de emergencia.' });
  }
});

// 5.5.1 Endpoint explícito de reversión de reemplazo excepcional
app.post('/api/emergencies/:id/revert', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    await handleEliminarORevertirEmergencia(req, res, Number(id));
  } catch (error) {
    console.error('Error reverting emergency replacement:', error);
    res.status(500).json({ error: 'Error al revertir el reemplazo excepcional.' });
  }
});

// 6.0 Control de Impresión de Vouchers (Emisión Anticipada y Registro Único)
app.get('/api/vouchers/status', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { fecha, tipoComida, servicioId } = req.query;
  const user = req.user;

  try {
    const targetServicioId = servicioId ? Number(servicioId) : user?.servicioId;
    if (!fecha || !tipoComida || !targetServicioId) {
      res.json({ impreso: false });
      return;
    }

    const fechaDate = new Date(`${fecha}T00:00:00.000Z`);
    const impresion = await prisma.impresionesVoucher.findFirst({
      where: {
        ServicioId: targetServicioId,
        FechaPedido: fechaDate,
        TipoComida: tipoComida as string
      },
      include: {
        Usuario: { select: { NombreCompleto: true, NombreUsuario: true } }
      }
    });

    res.json({
      impreso: !!impresion,
      impresoPor: impresion ? (impresion.Usuario?.NombreCompleto || impresion.Usuario?.NombreUsuario) : null,
      fechaImpresion: impresion?.FechaImpresion || null
    });
  } catch (error) {
    console.error('Error al consultar estado de impresion de voucher:', error);
    res.status(500).json({ error: 'Error al consultar estado de impresión.' });
  }
});

app.post('/api/vouchers/print', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { fecha, tipoComida, servicioId } = req.body;
  const user = req.user;

  try {
    if (!fecha || !tipoComida) {
      res.status(400).json({ error: 'Parámetros incompletos (fecha y tipoComida son requeridos).' });
      return;
    }

    const targetServicioId = servicioId ? Number(servicioId) : user?.servicioId;
    const targetHospitalId = user?.hospitalId;

    if (!targetServicioId || !targetHospitalId) {
      res.status(400).json({ error: 'No se pudo identificar el servicio u hospital del usuario.' });
      return;
    }

    const fechaDate = new Date(`${fecha}T00:00:00.000Z`);
    const impresionExistente = await prisma.impresionesVoucher.findFirst({
      where: {
        ServicioId: targetServicioId,
        FechaPedido: fechaDate,
        TipoComida: tipoComida
      },
      include: {
        Usuario: { select: { NombreCompleto: true, NombreUsuario: true } }
      }
    });

    // Rol 3 = JEFE_SERVICIO: Control estricto de emisión única
    if (user?.roleId === 3) {
      if (impresionExistente) {
        const usuarioNombre = impresionExistente.Usuario?.NombreCompleto || impresionExistente.Usuario?.NombreUsuario || 'Jefe de Servicio';
        res.status(400).json({
          error: `El voucher de ${tipoComida} del día ${fecha.split('-').reverse().join('/')} ya fue impreso anteriormente por ${usuarioNombre}. En caso de inconveniente con la impresora o papel, contacte a Gerencia para reimprimir.`
        });
        return;
      }

      await prisma.impresionesVoucher.create({
        data: {
          HospitalId: targetHospitalId,
          ServicioId: targetServicioId,
          FechaPedido: fechaDate,
          TipoComida: tipoComida,
          ImpresoPorUsuarioId: user.userId
        }
      });

      await logAudit(req, 'IMPRIMIR_VOUCHER_JEFE', `Voucher de ${tipoComida} impreso por Jefe de Servicio ID ${user.userId} para fecha ${fecha}`);
      res.json({ ok: true, message: 'Impresión registrada correctamente.' });
      return;
    }

    // Rol 2 (GERENTE), 1 (ADMIN), 5 (NUTRICION): Excepción / Reimpresión libre sin bloqueo
    if (!impresionExistente) {
      await prisma.impresionesVoucher.create({
        data: {
          HospitalId: targetHospitalId,
          ServicioId: targetServicioId,
          FechaPedido: fechaDate,
          TipoComida: tipoComida,
          ImpresoPorUsuarioId: user.userId
        }
      }).catch(() => {});
    }

    await logAudit(req, 'IMPRIMIR_VOUCHER_GERENCIA', `Voucher de ${tipoComida} impreso por usuario ID ${user.userId} (Rol: ${user?.roleId}) para fecha ${fecha}`);
    res.json({ ok: true, reimpresion: !!impresionExistente, message: 'Impresión autorizada por Gerencia.' });
  } catch (error) {
    console.error('Error al registrar impresion de voucher:', error);
    res.status(500).json({ error: 'Error interno al registrar la impresión del voucher.' });
  }
});

// 6.1 Reportes con filtros
app.get('/api/reports', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { fechaInicio, fechaFin, hospitalId, servicioId, personalId } = req.query;
  const user = req.user;

  try {
    let whereClause: any = {};
    if (fechaInicio && fechaFin) {
      const startStr = fechaInicio as string;
      const endStr = fechaFin as string;
      const start = new Date(`${startStr}T00:00:00.000Z`);
      const end = new Date(`${endStr}T23:59:59.999Z`);

      whereClause.FechaPedido = { gte: start, lte: end };
    }

    // Role-based filtering
    let jefeServicioNombre = '';
    if (user?.roleId === 3) {
      // JEFE_SERVICIO: ver todos los pedidos pertenecientes a su servicio
      if (user.servicioId) {
        const jefeServicioObj = await prisma.servicios.findUnique({ where: { Id: user.servicioId } });
        jefeServicioNombre = jefeServicioObj?.Nombre || '';

        whereClause.AND = [
          ...(user.hospitalId ? [{
            OR: [
              { SolicitadoPor: { HospitalId: user.hospitalId } },
              { Personal: { HospitalId: user.hospitalId } },
              { PersonalReemplazado: { HospitalId: user.hospitalId } }
            ]
          }] : []),
          {
            OR: [
              { Personal: { ServicioId: user.servicioId } },
              { PersonalReemplazado: { ServicioId: user.servicioId } },
              ...(jefeServicioNombre ? [{ JustificacionSolicitud: { contains: `[SERVICIO:${jefeServicioNombre}]` } }] : []),
              { SolicitadoPorUsuarioId: user.userId }
            ]
          }
        ];
      } else {
        whereClause.SolicitadoPorUsuarioId = user.userId;
      }
    } else if ((user?.roleId === 2 || user?.roleId === 5) && user?.hospitalId) {
      // GERENTE y NUTRICION: ver todos los pedidos de su hospital (sea via SolicitadoPor, Personal o Reemplazado)
      whereClause.OR = [
        { SolicitadoPor: { HospitalId: user.hospitalId } },
        { Personal: { HospitalId: user.hospitalId } },
        { PersonalReemplazado: { HospitalId: user.hospitalId } }
      ];
    }

    if (personalId) {
      whereClause.PersonalId = Number(personalId);
    }

    const report = await prisma.pedidosComida.findMany({
      where: whereClause,
      include: {
        Agente: { include: { Servicio: true, Hospital: true } },
        ReemplazaAgente: { include: { Servicio: true, Hospital: true } },
        Personal: { include: { Servicio: true, Hospital: true } },
        PersonalReemplazado: { include: { Servicio: true, Hospital: true } },
        SolicitadoPor: { include: { Servicio: true, Hospital: true } },
        EntregadoPor: true,
        RetiradoPorAgente: { include: { Servicio: true, Hospital: true } }
      }
    });
    
    // Filtrado manual simple
    let filteredReport = report;
    const effectiveHospitalId = hospitalId ? Number(hospitalId) : user?.hospitalId;
    if (user?.roleId !== 2 && user?.roleId !== 5 && effectiveHospitalId) {
      filteredReport = filteredReport.filter(r => 
        r.Personal?.HospitalId === effectiveHospitalId || r.SolicitadoPor?.HospitalId === effectiveHospitalId || r.PersonalReemplazado?.HospitalId === effectiveHospitalId
      );
    }
    if (user?.roleId !== 3 && servicioId) {
      filteredReport = filteredReport.filter(r => 
        r.Personal?.ServicioId === Number(servicioId) || r.SolicitadoPor?.ServicioId === Number(servicioId) || r.PersonalReemplazado?.ServicioId === Number(servicioId)
      );
    }

    // Map para identificar agentes titulares que fueron reemplazados en una fecha y turno específico
    const replacedMap = new Set<string>();
    filteredReport.forEach(r => {
      if (r.Estado === 'Aprobado' && (r.EmergenciaReemplazaId || r.PersonalReemplazado)) {
        const pId = r.EmergenciaReemplazaId || r.PersonalReemplazado?.Id;
        const pDni = r.PersonalReemplazado?.DNI;
        const fStr = r.FechaPedido ? new Date(r.FechaPedido).toISOString().split('T')[0] : '';
        const tcStr = (r.TipoComida || '').toLowerCase();
        if (pId) replacedMap.add(`ID_${pId}_${fStr}_${tcStr}`);
        if (pDni) replacedMap.add(`DNI_${pDni}_${fStr}_${tcStr}`);
      }
    });

    // Excluir del reporte órdenes de agentes titulares reemplazados por una emergencia para no duplicar raciones
    filteredReport = filteredReport.filter(r => {
      if (r.Personal && !r.EmergenciaDNI) {
        const p = r.Personal;
        const fStr = r.FechaPedido ? new Date(r.FechaPedido).toISOString().split('T')[0] : '';
        const tcStr = (r.TipoComida || '').toLowerCase();

        // Si el agente fue reemplazado en esta fecha y turno por otra ración de reemplazo
        if (replacedMap.has(`ID_${p.Id}_${fStr}_${tcStr}`) || replacedMap.has(`DNI_${p.DNI}_${fStr}_${tcStr}`)) {
          return false;
        }
      }
      return true;
    });

    // Enriquecer registros que carezcan de Servicio consultando Padrón / Personal por DNI
    const dnisToLookup = [...new Set(
      filteredReport
        .filter(r => !r.Personal?.Servicio && !r.PersonalReemplazado?.Servicio && !r.SolicitadoPor?.Servicio && r.EmergenciaDNI)
        .map(r => r.EmergenciaDNI as string)
    )];

    let padronMap = new Map<string, any>();
    if (dnisToLookup.length > 0) {
      const padronEntries = await prisma.padronHabilitados.findMany({
        where: { DNI: { in: dnisToLookup } },
        include: { Servicio: true }
      });
      padronEntries.forEach(p => {
        if (p.Servicio) padronMap.set(p.DNI, p.Servicio);
      });
      
      const remainingDnis = dnisToLookup.filter(d => !padronMap.has(d));
      if (remainingDnis.length > 0) {
        const personalEntries = await prisma.personal.findMany({
          where: { DNI: { in: remainingDnis } },
          include: { Servicio: true }
        });
        personalEntries.forEach(p => {
          if (p.Servicio) padronMap.set(p.DNI, p.Servicio);
        });
      }
    }

    function getOrigenPedido(r: any): string {
      const just = r.JustificacionSolicitud || '';
      const solRolId = r.SolicitadoPor?.RolId;
      const isAuto = just.includes('[EMERGENCIA NUTRICIÓN / GERENCIA]') || solRolId === 2 || solRolId === 5;
      
      if (r.EsExcepcional || just.toLowerCase().includes('excepcional') || just.toLowerCase().includes('último momento')) {
        return 'Emergencia Último Momento';
      }
      
      if (isAuto && (r.EmergenciaDNI || r.EmergenciaReemplazaId || r.PersonalReemplazado || r.PersonalId)) {
        return 'Emergencia Autoautorizada (Nutrición / Gerencia)';
      }
      
      if (r.EmergenciaReemplazaId || r.PersonalReemplazado) {
        return 'Emergencia Reemplazo';
      }
      
      if (r.EmergenciaDNI) {
        return 'Emergencia Extra';
      }
      
      return 'Planilla';
    }

    const finalReport = filteredReport.map(r => {
      let servicio = null;
      if (r.JustificacionSolicitud && r.JustificacionSolicitud.includes('[SERVICIO:')) {
        const match = r.JustificacionSolicitud.match(/\[SERVICIO:(.*?)\]/);
        if (match && match[1]) {
          servicio = { Nombre: match[1] };
        }
      }
      if (!servicio) {
        servicio = r.Personal?.Servicio || 
                   r.PersonalReemplazado?.Servicio || 
                   r.SolicitadoPor?.Servicio || 
                   (r.EmergenciaDNI ? padronMap.get(r.EmergenciaDNI) : null);
      }
      const agenteNombre = r.Agente?.NombreCompleto || r.Personal?.NombreCompleto || r.EmergenciaNombreCompleto;
      const agenteDni = r.Agente?.DNI || r.Personal?.DNI || r.EmergenciaDNI;

      return {
        ...r,
        Agente: r.Agente || (agenteDni ? { DNI: agenteDni, NombreCompleto: agenteNombre, HospitalId: r.Personal?.HospitalId, ServicioId: r.Personal?.ServicioId } : null),
        Personal: r.Personal || (agenteDni ? { ...r.Agente, DNI: agenteDni, NombreCompleto: agenteNombre, Servicio: servicio, Id: r.PersonalId || 0 } : null),
        EmergenciaNombreCompleto: agenteNombre || r.EmergenciaNombreCompleto,
        EmergenciaDNI: agenteDni || r.EmergenciaDNI,
        Servicio: servicio,
        Origen: getOrigenPedido(r)
      };
    });

    // Si es JEFE_SERVICIO, filtrar para que el servicio efectivo coincida estrictamente con su servicio
    let resultReport = finalReport;
    if (user?.roleId === 3 && jefeServicioNombre) {
      resultReport = finalReport.filter(r => {
        if (!r.Servicio?.Nombre) return false;
        const itemServicioNombre = r.Servicio.Nombre.trim().toLowerCase();
        return itemServicioNombre === jefeServicioNombre.trim().toLowerCase();
      });
    }

    res.json(resultReport);
  } catch (error) {
    res.status(500).json({ error: 'Error al generar el reporte' });
  }
});

// --- ENDPOINTS DE OBSERVACIONES Y SUGERENCIAS ---

// Crear nueva observación (Jefe de Servicio / Usuario)
app.post('/api/observaciones', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { tipo, observacion } = req.body;
  const user = req.user;

  if (!user || !user.userId) {
    res.status(401).json({ error: 'Usuario no autenticado' });
    return;
  }

  if (!observacion || !observacion.trim()) {
    res.status(400).json({ error: 'La observación es requerida' });
    return;
  }

  try {
    const usuarioDB = await prisma.usuarios.findUnique({
      where: { Id: user.userId },
      select: { HospitalId: true, ServicioId: true }
    });

    const hospitalId = user.hospitalId || usuarioDB?.HospitalId;
    const servicioId = user.servicioId || usuarioDB?.ServicioId;

    if (!hospitalId || !servicioId) {
      res.status(400).json({ error: 'Usuario sin hospital o servicio asignado para registrar observaciones' });
      return;
    }

    const nuevaObs = await prisma.observacionesServicio.create({
      data: {
        HospitalId: hospitalId,
        ServicioId: servicioId,
        UsuarioId: user.userId,
        Tipo: tipo || 'Observación',
        Observacion: observacion.trim(),
        VisibleGerencia: false
      },
      include: {
        Servicio: true,
        Hospital: true,
        Usuario: { select: { Id: true, NombreUsuario: true, NombreCompleto: true } }
      }
    });

    await logAudit(req, 'CREAR_OBSERVACION', `Observación ID ${nuevaObs.Id} creada por usuario ${user.userId} para servicio ID ${servicioId}`);
    res.json({ message: 'Observación registrada exitosamente', data: nuevaObs });
  } catch (error: any) {
    console.error('Error al crear observación:', error);
    res.status(500).json({ error: 'Error al registrar observación: ' + (error?.message || String(error)) });
  }
});

// Obtener observaciones (Jefe, Nutrición, Gerente, Admin)
app.get('/api/observaciones', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user || !user.userId) {
    res.status(401).json({ error: 'Usuario no autenticado' });
    return;
  }

  try {
    let whereClause: any = {};

    if (user.roleId === 3) {
      // JEFE_SERVICIO: Ver observaciones de su servicio
      const usuarioDB = await prisma.usuarios.findUnique({
        where: { Id: user.userId },
        select: { ServicioId: true, HospitalId: true }
      });
      const sId = user.servicioId || usuarioDB?.ServicioId;
      if (sId) {
        whereClause = { ServicioId: sId };
      } else {
        whereClause = { UsuarioId: user.userId };
      }
    } else if (user.roleId === 5) {
      // NUTRICION: Ver todas las observaciones de su hospital
      const hId = user.hospitalId;
      if (!hId) {
        res.status(400).json({ error: 'Usuario sin hospital asignado' });
        return;
      }
      whereClause = { HospitalId: hId };
    } else if (user.roleId === 2 || user.roleId === 1) {
      // GERENTE / ADMIN: Ver únicamente las observaciones derivadas a Gerencia (VisibleGerencia = true)
      const hId = user.hospitalId;
      if (hId && user.roleId === 2) {
        whereClause = { HospitalId: hId, VisibleGerencia: true };
      } else {
        whereClause = { VisibleGerencia: true };
      }
    }

    const observaciones = await prisma.observacionesServicio.findMany({
      where: whereClause,
      orderBy: { Fecha: 'desc' },
      include: {
        Servicio: true,
        Hospital: true,
        Usuario: { select: { Id: true, NombreUsuario: true, NombreCompleto: true } },
        EvaluadoPor: { select: { Id: true, NombreUsuario: true, NombreCompleto: true } }
      }
    });

    res.json(observaciones);
  } catch (error: any) {
    console.error('Error al obtener observaciones:', error);
    res.status(500).json({ error: 'Error al obtener observaciones' });
  }
});

// Modificar visibilidad para Gerencia y respuesta de Nutrición (Nutrición / Admin / Gerente)
app.put('/api/observaciones/:id/gerencia-visibility', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const user = req.user;
  if (!user || (user.roleId !== 5 && user.roleId !== 1 && user.roleId !== 2)) {
    res.status(403).json({ error: 'No tienes permisos para modificar la visibilidad para Gerencia' });
    return;
  }

  const id = Number(req.params.id);
  const { visibleGerencia, respuestaNutricion } = req.body;

  try {
    const obs = await prisma.observacionesServicio.findUnique({ where: { Id: id } });
    if (!obs) {
      res.status(404).json({ error: 'Observación no encontrada' });
      return;
    }

    const updated = await prisma.observacionesServicio.update({
      where: { Id: id },
      data: {
        VisibleGerencia: visibleGerencia !== undefined ? Boolean(visibleGerencia) : obs.VisibleGerencia,
        RespuestaNutricion: respuestaNutricion !== undefined ? respuestaNutricion : obs.RespuestaNutricion,
        FechaEvaluadoNutricion: new Date(),
        EvaluadoPorUsuarioId: user.userId
      },
      include: {
        Servicio: true,
        Hospital: true,
        Usuario: { select: { Id: true, NombreUsuario: true, NombreCompleto: true } },
        EvaluadoPor: { select: { Id: true, NombreUsuario: true, NombreCompleto: true } }
      }
    });

    await logAudit(
      req,
      'EVALUAR_OBSERVACION',
      `Observación ID ${id} actualizada por Nutrición/Admin. VisibleGerencia: ${updated.VisibleGerencia}`
    );

    res.json({ message: 'Observación actualizada exitosamente', data: updated });
  } catch (error: any) {
    console.error('Error al actualizar observación:', error);
    res.status(500).json({ error: 'Error al actualizar observación' });
  }
});

// --- RRHH / ADMIN ENDPOINTS ---

app.post('/api/hospitals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) {
    res.status(403).json({ 
      error: 'No autorizado. Solo los usuarios con rol Administrador (RRHH) pueden crear efectores.',
      code: 'AUTH_FORBIDDEN'
    });
    return;
  }
  const { nombre, codigo } = req.body;
  const nombreTrim = (nombre || '').trim();
  if (!nombreTrim) {
    res.status(400).json({ 
      error: 'El nombre del efector es obligatorio y no puede quedar vacío.',
      code: 'VALIDATION_FAILED',
      field: 'nombre'
    });
    return;
  }

  try {
    let finalCode = (codigo || '').trim().toUpperCase();
    if (!finalCode) {
      const cleanPrefix = nombreTrim.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'HOSP';
      let isUnique = false;
      let attempts = 0;
      while (!isUnique && attempts < 15) {
        attempts++;
        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        finalCode = `${cleanPrefix}${randomSuffix}`;
        const existing = await prisma.hospitales.findUnique({ where: { Codigo: finalCode } });
        if (!existing) isUnique = true;
      }
    } else {
      const existing = await prisma.hospitales.findUnique({ where: { Codigo: finalCode } });
      if (existing) {
        res.status(400).json({ 
          error: `El código "${finalCode}" ya está en uso por el efector "${existing.Nombre}". Por favor ingresa otro código.`,
          details: `Conflicto de clave única: Codigo = '${finalCode}' ya existe en la base de datos (ID: ${existing.Id}, Nombre: ${existing.Nombre}).`,
          code: 'ERR_DUPLICATE_CODE',
          field: 'codigo',
          conflictingEfector: existing.Nombre
        });
        return;
      }
    }

    const hospital = await prisma.hospitales.create({
      data: { Nombre: nombreTrim, Codigo: finalCode }
    });

    await logAudit(req, 'CREAR_HOSPITAL', `Efector creado: ${nombreTrim} (Código: ${finalCode})`);
    res.json({ message: 'Efector creado exitosamente', hospital });
  } catch (error: any) {
    handleApiError(res, 'Error al crear efector en la base de datos', error);
  }
});

app.get('/api/hospitals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const hospitales = await prisma.hospitales.findMany({
      include: {
        Servicios: {
          include: {
            Personal: {
              select: { Id: true, DNI: true, NombreCompleto: true, Horario: true, Activo: true },
              orderBy: { NombreCompleto: 'asc' }
            }
          }
        },
        Usuarios: {
          where: { RolId: 2 }, // Gerentes
          select: { Id: true, NombreUsuario: true, NombreCompleto: true, Activo: true }
        }
      }
    });
    res.json(hospitales);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener hospitales' });
  }
});

app.post('/api/users/gerente', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) {
    res.status(403).json({ error: 'No autorizado. Solo RRHH/Admin.' });
    return;
  }
  const { username, nombreCompleto, hospitalId } = req.body;
  const password = req.body.password || '123456';

  if (!username || !nombreCompleto || !hospitalId) {
    res.status(400).json({ error: 'Faltan campos requeridos (Nombre completo, usuario y hospital)' });
    return;
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.usuarios.create({
      data: {
        NombreUsuario: username,
        NombreCompleto: nombreCompleto,
        ContrasenaHash: hashedPassword,
        RolId: 2, // GERENTE
        HospitalId: Number(hospitalId),
        DebeCambiarContrasena: true
      }
    });
    res.json({ message: 'Gerente creado exitosamente', userId: user.Id });
  } catch (error: any) {
    console.error(error);
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Ese nombre de usuario ya está en uso. Por favor, elige otro.' });
    } else {
      res.status(500).json({ error: 'Error al crear gerente' });
    }
  }
});

app.get('/api/admin/auditoria', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const roleId = req.user?.roleId;
  if (roleId !== 1 && roleId !== 2) { // 1 = Admin, 2 = Gerente
    res.status(403).json({ error: 'No autorizado para ver registros de auditoría.' });
    return;
  }

  try {
    let whereClause: any = {};
    if (roleId === 2) {
      // Gerente: solo acciones de Jefes de Servicio (roleId 3) de su propio efector
      const hospitalId = req.user?.hospitalId;
      if (!hospitalId) {
        res.status(403).json({ error: 'El usuario no tiene hospital asignado.' });
        return;
      }
      whereClause = {
        Usuario: {
          RolId: 3, // Jefe de Servicio
          HospitalId: hospitalId
        }
      };
    }

    // @ts-ignore
    const logs = await prisma.auditoria.findMany({
      where: whereClause,
      orderBy: { Fecha: 'desc' },
      include: {
        Usuario: {
          select: { 
            NombreUsuario: true, 
            NombreCompleto: true,
            Rol: { select: { Nombre: true } },
            Servicio: { select: { Nombre: true } }
          }
        }
      },
      take: 300
    });

    const formattedLogs = logs.map((l: any) => {
      let fechaIso = l.Fecha;
      if (l.Fecha instanceof Date) {
        // Al estar guardada en hora local (UTC-3) en SQL Server,
        // le añadimos el offset -03:00 para garantizar su correcta visualización en clientes
        fechaIso = l.Fecha.toISOString().replace('Z', '-03:00');
      }
      return {
        ...l,
        Fecha: fechaIso
      };
    });

    res.json(formattedLogs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Error al obtener registros de auditoría' });
  }
});
// --------------------------------------------------
// CACHE SILENCIOSO ETAG Y VERSIÓN POR HOSPITAL
// --------------------------------------------------
const hospitalVersionMap: Record<number, number> = {};
const getHospitalVersion = (hId?: number | null) => {
  if (!hId) return 1;
  return hospitalVersionMap[hId] || 1;
};
const bumpHospitalVersion = (hId?: number | null) => {
  if (!hId) return;
  hospitalVersionMap[hId] = (hospitalVersionMap[hId] || 1) + 1;
};

const sanitizeEncoding = (str: string): string => {
  if (!str) return '';
  return String(str)
    .replace(/Â°/g, '°')
    .replace(/Âº/g, 'º')
    .replace(/Â/g, '')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã+/g, 'Ñ')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã/g, 'Á')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã /g, 'Í')
    .replace(/Ã"/g, 'Ó')
    .replace(/Ãš/g, 'Ú')
    .replace(/[\uFFFD\u00A0]/g, '')
    .trim();
};

const normalizeForMatching = (str: string): string => {
  return sanitizeEncoding(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

// 8. Configuración de Horarios y Permisos
app.get('/api/hospital/config', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const queryHId = req.query.hospitalId ? Number(req.query.hospitalId) : null;
  const hospitalId = (req.user?.roleId === 1 && queryHId) ? queryHId : req.user?.hospitalId;
  if (!hospitalId) {
    res.json({
      LimiteAlmuerzo: '10:00',
      LimiteCena: '17:00',
      LimiteAutorizacionAlmuerzo: '11:00',
      LimiteAutorizacionCena: '18:00',
      DietasHabilitadas: 'Normal,Hiposódica,Diabética,Hepática,Vegetariano,Celíaca,Especial',
      RolCambioVoucher: 'JEFE'
    });
    return;
  }
  
  const currentEtag = `W/"hosp_${hospitalId}_ver_${getHospitalVersion(hospitalId)}"`;
  if (req.headers['if-none-match'] === currentEtag) {
    res.status(304).end();
    return;
  }
  res.setHeader('ETag', currentEtag);
  
  try {
    const hospital = await prisma.hospitales.findUnique({
      where: { Id: hospitalId },
      select: { 
        LimiteAlmuerzo: true, 
        LimiteCena: true, 
        LimiteAutorizacionAlmuerzo: true,
        LimiteAutorizacionCena: true,
        DietasHabilitadas: true,
        RolCambioVoucher: true
      }
    });
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

app.put('/api/hospital/config', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const userHospitalId = req.user?.hospitalId;
  const targetHospitalId = (req.user?.roleId === 1 && req.body.hospitalId) ? Number(req.body.hospitalId) : userHospitalId;
  const { limiteAlmuerzo, limiteCena, limiteAutorizacionAlmuerzo, limiteAutorizacionCena, dietasHabilitadas, rolCambioVoucher } = req.body;
  
  if (!targetHospitalId) {
    res.status(400).json({ error: 'Hospital no especificado' });
    return;
  }

  const toMins = (hStr?: string) => {
    if (!hStr) return null;
    const [h, m] = hStr.split(':').map(Number);
    return (isNaN(h) || isNaN(m)) ? null : h * 60 + m;
  };

  const almMins = toMins(limiteAlmuerzo);
  const authAlmMins = toMins(limiteAutorizacionAlmuerzo);
  const cenMins = toMins(limiteCena);
  const authCenMins = toMins(limiteAutorizacionCena);

  if (almMins !== null && authAlmMins !== null && authAlmMins <= almMins) {
    res.status(400).json({ error: `La hora límite para autorizar emergencias de Almuerzo (${limiteAutorizacionAlmuerzo}) debe ser posterior a la hora de cierre de pedidos (${limiteAlmuerzo}).` });
    return;
  }

  if (cenMins !== null && authCenMins !== null && authCenMins <= cenMins) {
    res.status(400).json({ error: `La hora límite para autorizar emergencias de Cena (${limiteAutorizacionCena}) debe ser posterior a la hora de cierre de pedidos (${limiteCena}).` });
    return;
  }

  let finalRolCambioVoucher = rolCambioVoucher;
  if (finalRolCambioVoucher && !['JEFE', 'GERENTE', 'AMBOS'].includes(finalRolCambioVoucher)) {
    finalRolCambioVoucher = 'JEFE';
  }
  
  try {
    const updated = await prisma.hospitales.update({
      where: { Id: targetHospitalId },
      data: { 
        ...(limiteAlmuerzo ? { LimiteAlmuerzo: limiteAlmuerzo } : {}),
        ...(limiteCena ? { LimiteCena: limiteCena } : {}),
        ...(limiteAutorizacionAlmuerzo ? { LimiteAutorizacionAlmuerzo: limiteAutorizacionAlmuerzo } : {}),
        ...(limiteAutorizacionCena ? { LimiteAutorizacionCena: limiteAutorizacionCena } : {}),
        ...(dietasHabilitadas !== undefined ? { DietasHabilitadas: dietasHabilitadas } : {}),
        ...(finalRolCambioVoucher ? { RolCambioVoucher: finalRolCambioVoucher } : {})
      }
    });
    bumpHospitalVersion(targetHospitalId);
    res.json({ message: 'Configuración actualizada', data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar configuración' });
  }
});

app.post('/api/personal/bulk', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) {
    res.status(403).json({ error: 'No autorizado. Solo RRHH/Admin.' });
    return;
  }
  const { data } = req.body;
  if (!data || !Array.isArray(data)) {
    res.status(400).json({ error: 'Data invalida' });
    return;
  }

  try {
    let imported = 0;
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const details: any[] = [];

    const getRowVal = (r: any, ...possibleKeys: string[]) => {
      for (const pk of possibleKeys) {
        if (r[pk] !== undefined && r[pk] !== null) return r[pk];
      }
      const rKeys = Object.keys(r);
      for (const pk of possibleKeys) {
        const cleanPk = pk.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchKey = rKeys.find(rk => rk.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanPk);
        if (matchKey && r[matchKey] !== undefined && r[matchKey] !== null) {
          return r[matchKey];
        }
      }
      return '';
    };

    // PASO 0: Validar que el archivo contenga las cabeceras obligatorias y al menos una columna de ración/vianda
    const allRowKeys = new Set<string>();
    for (const row of data.slice(0, 20)) {
      if (row && typeof row === 'object') {
        Object.keys(row).forEach(k => allRowKeys.add(k));
      }
    }
    const detectedHeaders = Array.from(allRowKeys);

    const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
    const hasHeaderMatch = (headers: string[], ...patterns: string[]) => {
      return headers.some(h => {
        const cleanH = normKey(h);
        return patterns.some(p => {
          const cleanP = normKey(p);
          return cleanH === cleanP || cleanH.includes(cleanP) || cleanP.includes(cleanH);
        });
      });
    };

    const hasDni = hasHeaderMatch(detectedHeaders, 'documento', 'dni', 'numdoc', 'num_doc', 'nrodoc', 'nro_doc', 'cedula');
    const hasAgente = hasHeaderMatch(detectedHeaders, 'agente', 'nombre', 'nombrecompleto', 'apellido');
    const hasEfector = hasHeaderMatch(detectedHeaders, 'efector', 'hospital', 'establecimiento');
    const hasServicio = hasHeaderMatch(detectedHeaders, 'servicio', 'area', 'sector');
    const hasRacionVianda = hasHeaderMatch(detectedHeaders, 'convianda', 'con_vianda', 'vianda', 'esguardia24', 'guardia24', 'esguardia12', 'guardia12', 'racion', 'raciones', 'horario', 'guardia', 'conracion');

    if (!hasDni || !hasAgente || !hasEfector || !hasServicio) {
      const missingList: string[] = [];
      if (!hasDni) missingList.push('Documento/DNI (ej: "documento", "dni")');
      if (!hasAgente) missingList.push('Nombre del Agente (ej: "agente", "nombre")');
      if (!hasEfector) missingList.push('Efector/Hospital (ej: "efector", "hospital")');
      if (!hasServicio) missingList.push('Servicio/Área (ej: "servicio", "area")');
      res.status(400).json({
        error: `No se realizó la importación. Faltan cabeceras obligatorias en el archivo: ${missingList.join(', ')}. Cabeceras detectadas: [${detectedHeaders.join(', ')}].`
      });
      return;
    }

    if (!hasRacionVianda) {
      res.status(400).json({
        error: `No se realizó la importación. El archivo no contiene ninguna columna de Ración, Vianda o Guardia (ej: 'con_vianda', 'vianda', 'esguardia12', 'esguardia24', 'racion', 'horario'). Cabeceras detectadas: [${detectedHeaders.join(', ')}]. Se canceló la operación para evitar importar agentes sin ración habilitada.`
      });
      return;
    }

    // PASO 1: Pre-validar que TODOS los hospitales y servicios del archivo existan en la base de datos antes de realizar cualquier cambio
    const missingServices = new Set<string>();
    const missingHospitals = new Set<string>();

    let rIdx = 0;
    for (const row of data) {
      rIdx++;
      const docVal = getRowVal(row, 'documento', 'dni', 'num_doc', 'numdoc');
      const agenteVal = getRowVal(row, 'agente', 'nombre', 'nombrecompleto', 'agente_nombre');
      if (!docVal || !agenteVal) continue;

      const efectorStr = sanitizeEncoding(String(getRowVal(row, 'efector', 'hospital', 'establecimiento') || ''));
      const servicioStr = sanitizeEncoding(String(getRowVal(row, 'servicio', 'area', 'sector') || ''));

      if (!servicioStr) continue;

      let hospital = await prisma.hospitales.findFirst({ where: { Nombre: efectorStr } });
      if (!hospital) {
        const todosHospitales = await prisma.hospitales.findMany();
        const targetNormH = normalizeForMatching(efectorStr);
        hospital = todosHospitales.find(h => 
          h.Nombre.trim().toLowerCase() === efectorStr.toLowerCase() ||
          normalizeForMatching(h.Nombre) === targetNormH
        ) || null;
      }
      if (!hospital) {
        missingHospitals.add(efectorStr || 'Efector sin nombre');
        continue;
      }

      let servicio = await prisma.servicios.findFirst({ where: { Nombre: servicioStr, HospitalId: hospital.Id } });
      if (!servicio) {
        const todosServicios = await prisma.servicios.findMany({ where: { HospitalId: hospital.Id } });
        const targetNormS = normalizeForMatching(servicioStr);
        servicio = todosServicios.find(s => 
          s.Nombre.trim().toLowerCase() === servicioStr.toLowerCase() ||
          normalizeForMatching(s.Nombre) === targetNormS
        ) || null;
      }

      if (!servicio) {
        // Auto-crear el servicio faltante en el efector
        servicio = await prisma.servicios.create({
          data: {
            HospitalId: hospital.Id,
            Nombre: servicioStr.trim()
          }
        });
      }
    }

    if (missingHospitals.size > 0) {
      const hList = Array.from(missingHospitals).join(', ');
      res.status(400).json({
        error: `No se realizó la importación. Los siguientes establecimientos/hospitales no existen en el sistema: ${hList}. Por favor verifique el archivo o cree el establecimiento antes de volver a importar.`
      });
      return;
    }

    // PASO 2: Procesar la importación masiva auto-creando servicios faltantes si aplica
    let rowIndex = 0;
    for (const row of data) {
      rowIndex++;
      const docVal = getRowVal(row, 'documento', 'dni', 'num_doc', 'numdoc');
      const agenteVal = getRowVal(row, 'agente', 'nombre', 'nombrecompleto', 'agente_nombre');
      
      if (!docVal || !agenteVal) {
        skippedCount++;
        details.push({
          rowNumber: rowIndex,
          type: 'OMITIDO',
          reason: 'Falta Documento (DNI) o Nombre de Agente'
        });
        continue;
      }

      const efectorStr = sanitizeEncoding(String(getRowVal(row, 'efector', 'hospital', 'establecimiento') || ''));
      const servicioStr = sanitizeEncoding(String(getRowVal(row, 'servicio', 'area', 'sector') || ''));

      let hospital = await prisma.hospitales.findFirst({ where: { Nombre: efectorStr } });
      if (!hospital) {
        const todosHospitales = await prisma.hospitales.findMany();
        const targetNormH = normalizeForMatching(efectorStr);
        hospital = todosHospitales.find(h => 
          h.Nombre.trim().toLowerCase() === efectorStr.toLowerCase() ||
          normalizeForMatching(h.Nombre) === targetNormH
        ) || null;
      }
      if (!hospital) {
        skippedCount++;
        details.push({
          rowNumber: rowIndex,
          type: 'OMITIDO',
          reason: `Hospital '${efectorStr}' no encontrado`
        });
        continue;
      }

      let servicio = await prisma.servicios.findFirst({ where: { Nombre: servicioStr, HospitalId: hospital.Id } });
      if (!servicio) {
        const todosServicios = await prisma.servicios.findMany({ where: { HospitalId: hospital.Id } });
        const targetNormS = normalizeForMatching(servicioStr);
        servicio = todosServicios.find(s => 
          s.Nombre.trim().toLowerCase() === servicioStr.toLowerCase() ||
          normalizeForMatching(s.Nombre) === targetNormS
        ) || null;
      }
      if (!servicio) {
        // Auto-crear el servicio si aún no se había creado
        servicio = await prisma.servicios.create({
          data: {
            HospitalId: hospital.Id,
            Nombre: servicioStr.trim()
          }
        });
      }

      const rawDniStr = String(docVal).trim();
      const dniStr = rawDniStr.replace(/[^0-9]/g, '');

      if (!dniStr) {
        skippedCount++;
        details.push({
          rowNumber: rowIndex,
          type: 'OMITIDO',
          reason: `Documento de DNI inválido: '${rawDniStr}'`
        });
        continue;
      }

      const rawNombre = String(agenteVal).trim();
      const isTruthy = (v: any) => {
        if (!v) return false;
        const str = String(v).trim().toLowerCase();
        return str === 's' || str === 'si' || str === 'sí' || str === 'true' || str === '1' || v === true || v === 1;
      };

      const racionRaw = getRowVal(row, 'racion', 'raciones', 'con_racion', 'conracion', 'tipo_racion', 'tiporacion');
      let racionNum: number | null = null;
      if (racionRaw !== '' && racionRaw !== undefined && racionRaw !== null) {
        const parsed = parseInt(String(racionRaw).trim(), 10);
        if (!isNaN(parsed)) {
          racionNum = parsed;
        }
      }

      const horarioRaw = String(getRowVal(row, 'horario', 'turno') || '').trim();

      let isGuardia24 = isTruthy(getRowVal(row, 'esguardia24', 'esguardia24h', 'guardia24', 'guardia24h', 'g24'));
      let isGuardia12 = isTruthy(getRowVal(row, 'esguardia12', 'esguardia12h', 'guardia12', 'guardia12h', 'g12'));
      let conVianda = isTruthy(getRowVal(row, 'con_vianda', 'convianda', 'vianda'));

      if (racionNum !== null) {
        if (racionNum >= 2) {
          isGuardia24 = true;
          conVianda = true;
        } else if (racionNum === 1) {
          isGuardia12 = true;
          conVianda = true;
        } else if (racionNum === 0) {
          conVianda = false;
          isGuardia24 = false;
          isGuardia12 = false;
        }
      }

      if (racionNum !== null) {
        if (racionNum >= 2) {
          isGuardia24 = true;
          conVianda = true;
        } else if (racionNum === 1) {
          isGuardia12 = true;
          conVianda = true;
        } else if (racionNum === 0) {
          conVianda = false;
          isGuardia24 = false;
          isGuardia12 = false;
        }
      } else if (horarioRaw) {
        // Adaptador exclusivamente para planillas legacy que no tengan columna numérica de raciones
        const normH = horarioRaw.toLowerCase();
        if (normH.includes('24') || normH.includes('y cena') || normH.includes('2 racion')) {
          isGuardia24 = true;
          conVianda = true;
        } else if (normH.includes('12') || normH.includes('o cena') || normH.includes('1 racion')) {
          isGuardia12 = true;
          conVianda = true;
        }
      }

      if (isGuardia24 || isGuardia12) {
        conVianda = true;
      }

      const existingAgente = await prisma.personal.findFirst({
        where: { HospitalId: hospital.Id, ServicioId: servicio.Id, DNI: dniStr },
        include: { Hospital: true, Servicio: true }
      });

      // Lógica de protección de nombre: si el agente existe y el nombre en DB es más completo o igual de largo, no sobreescribir con un nombre incompleto
      let nombreCompleto = rawNombre;
      if (existingAgente && existingAgente.NombreCompleto) {
        const dbName = existingAgente.NombreCompleto.trim();
        const hasReplacementChars = rawNombre.includes('') || rawNombre.includes('?');
        const isDbNameLongerOrEqual = dbName.length >= rawNombre.length;

        if (isDbNameLongerOrEqual || hasReplacementChars) {
          nombreCompleto = dbName;
        }
      }

      if (existingAgente) {
        updatedCount++;
        const changes: string[] = [];

        if (existingAgente.NombreCompleto !== nombreCompleto) {
          changes.push(`Nombre: '${existingAgente.NombreCompleto}' -> '${nombreCompleto}'`);
        }
        if (existingAgente.HospitalId !== hospital.Id) {
          changes.push(`Efector: '${existingAgente.Hospital?.Nombre}' -> '${hospital.Nombre}'`);
        }
        if (existingAgente.ServicioId !== servicio.Id) {
          changes.push(`Servicio: '${existingAgente.Servicio?.Nombre}' -> '${servicio.Nombre}'`);
        }
        if (existingAgente.ConVianda !== conVianda) {
          changes.push(`Con Vianda: ${existingAgente.ConVianda ? 'SI' : 'NO'} -> ${conVianda ? 'SI' : 'NO'}`);
        }
        if (existingAgente.EsGuardia24 !== isGuardia24) {
          changes.push(`Guardia 24h: ${existingAgente.EsGuardia24 ? 'SI' : 'NO'} -> ${isGuardia24 ? 'SI' : 'NO'}`);
        }
        if (existingAgente.EsGuardia12 !== isGuardia12) {
          changes.push(`Guardia 12h: ${existingAgente.EsGuardia12 ? 'SI' : 'NO'} -> ${isGuardia12 ? 'SI' : 'NO'}`);
        }

        details.push({
          rowNumber: rowIndex,
          type: 'ACTUALIZADO',
          dni: dniStr,
          nombre: nombreCompleto,
          efector: hospital.Nombre,
          servicio: servicio.Nombre,
          changes: changes.length > 0 ? changes : ['Sin cambios de campos (datos idénticos)']
        });
      } else {
        createdCount++;
        details.push({
          rowNumber: rowIndex,
          type: 'NUEVO',
          dni: dniStr,
          nombre: nombreCompleto,
          efector: hospital.Nombre,
          servicio: servicio.Nombre,
          conVianda,
          isGuardia24,
          isGuardia12
        });
      }

      const existingPadron = await prisma.padronHabilitados.findUnique({ where: { DNI: dniStr } });
      let padronRecord;
      if (existingPadron) {
        const isFromSameHospital = existingPadron.HospitalId === hospital.Id;
        const newActivo = Boolean(existingPadron.Activo || conVianda);
        const newEsGuardia24 = Boolean(existingPadron.EsGuardia24h || isGuardia24);
        const newRaciones = Math.max(existingPadron.RacionesMaximasDia || 0, isGuardia24 ? 2 : (conVianda ? 1 : 0), newEsGuardia24 ? 2 : 1);

        padronRecord = await prisma.padronHabilitados.update({
          where: { DNI: dniStr },
          data: {
            NombreCompleto: isFromSameHospital ? (nombreCompleto || existingPadron.NombreCompleto) : existingPadron.NombreCompleto,
            ...(isFromSameHospital ? { HospitalId: hospital.Id, ServicioId: servicio.Id } : {}),
            EsGuardia24h: newEsGuardia24,
            RacionesMaximasDia: newRaciones,
            Activo: newActivo
          }
        });
      } else {
        padronRecord = await prisma.padronHabilitados.create({
          data: {
            DNI: dniStr,
            NombreCompleto: nombreCompleto,
            HospitalId: hospital.Id,
            ServicioId: servicio.Id,
            EsGuardia24h: isGuardia24,
            RacionesMaximasDia: isGuardia24 ? 2 : (conVianda ? 1 : 0),
            Activo: conVianda
          }
        });
      }

      await prisma.personal.upsert({
        where: {
          HospitalId_ServicioId_DNI: {
            HospitalId: hospital.Id,
            ServicioId: servicio.Id,
            DNI: dniStr
          }
        },
        update: {
          NombreCompleto: padronRecord.NombreCompleto,
          HospitalId: hospital.Id,
          ServicioId: servicio.Id,
          IdPuesto: String(getRowVal(row, 'idpuesto', 'puesto') || ''),
          TipoFuncion: String(getRowVal(row, 'tipofuncion', 'funcion') || ''),
          TipoPlanta: String(getRowVal(row, 'tipoplanta', 'planta') || ''),
          ConVianda: conVianda,
          EsGuardia12: isGuardia12,
          EsGuardia24: isGuardia24,
          AgenteId: padronRecord.Id
        },
        create: {
          DNI: dniStr,
          NombreCompleto: padronRecord.NombreCompleto,
          HospitalId: hospital.Id,
          ServicioId: servicio.Id,
          IdPersonal: String(getRowVal(row, 'idagente', 'idpersonal') || ''),
          Horario: horarioRaw || (isGuardia24 ? 'Guardia 24h (Almuerzo y Cena)' : (isGuardia12 ? 'Guardia 12h' : '08:00 a 16:00')),
          PeriodoInicio: new Date(2020, 0, 1),
          PeriodoFin: new Date(2035, 11, 31),
          IdPuesto: String(getRowVal(row, 'idpuesto', 'puesto') || ''),
          TipoFuncion: String(getRowVal(row, 'tipofuncion', 'funcion') || ''),
          TipoPlanta: String(getRowVal(row, 'tipoplanta', 'planta') || ''),
          ConVianda: conVianda,
          EsGuardia12: isGuardia12,
          EsGuardia24: isGuardia24,
          AgenteId: padronRecord.Id
        }
      });

      imported++;
    }

    await logAudit(req, 'IMPORTACION_EXCEL', `Importación completada: ${createdCount} nuevos, ${updatedCount} actualizados, ${skippedCount} omitidos.`);
    res.json({
      message: 'Importacion completada',
      count: imported,
      createdCount,
      updatedCount,
      skippedCount,
      details
    });
  } catch (error) {
    console.error('Error importing personal:', error);
    res.status(500).json({ error: 'Error al importar datos' });
  }
});

// 5.b VERIFICACIÓN DE DNI EN TIEMPO REAL
app.get('/api/staff/check-dni', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const userServicioId = req.user?.servicioId;
  const targetServicioId = req.query.servicioId ? Number(req.query.servicioId) : userServicioId;
  const rawDni = String(req.query.dni || '').trim();
  const dni = rawDni.replace(/\D/g, '');

  if (!dni) {
    res.status(400).json({ error: 'DNI inválido' });
    return;
  }

  try {
    // 1. Verificar si ya se encuentra ACTIVO en este servicio específico
    const activeInCurrentService = await prisma.personal.findFirst({
      where: {
        DNI: dni,
        HospitalId: Number(hospitalId),
        ...(targetServicioId ? { ServicioId: Number(targetServicioId) } : {}),
        Activo: true
      },
      include: { Servicio: true }
    });

    if (activeInCurrentService) {
      res.json({
        exists: true,
        agente: {
          NombreCompleto: activeInCurrentService.NombreCompleto,
          Servicio: activeInCurrentService.Servicio?.Nombre || 'Este Servicio'
        },
        message: `El agente ya se encuentra activo en el plantel de este servicio.`
      });
      return;
    }

    // 2. Verificar si el agente ya pertenece o perteneció al personal o padrón de este hospital
    const existingInThisHospital = await prisma.personal.findFirst({
      where: { DNI: dni, HospitalId: Number(hospitalId) },
      include: { Servicio: true }
    });
    const padronInThisHospital = await prisma.padronHabilitados.findFirst({
      where: { DNI: dni, HospitalId: Number(hospitalId) },
      include: { Servicio: true }
    });
    const belongsToThisHospital = Boolean(existingInThisHospital || padronInThisHospital);

    // 3. Verificar en el Padrón Central (en este u otro hospital)
    const globalPadron = await prisma.padronHabilitados.findUnique({
      where: { DNI: dni },
      include: { Hospital: true, Servicio: true }
    });

    if (globalPadron) {
      const is24Effective = Boolean(globalPadron.EsGuardia24h || globalPadron.RacionesMaximasDia === 2);
      res.json({
        exists: false,
        alreadyInHospital: belongsToThisHospital,
        globalMatch: {
          NombreCompleto: globalPadron.NombreCompleto,
          HospitalNombre: globalPadron.Hospital?.Nombre || (globalPadron.HospitalId === Number(hospitalId) ? 'Este Hospital' : 'Otro Efector'),
          HospitalId: globalPadron.HospitalId,
          ServicioNombre: existingInThisHospital?.Servicio?.Nombre || globalPadron.Servicio?.Nombre || '',
          RacionesMaximasDia: globalPadron.RacionesMaximasDia,
          EsGuardia24h: is24Effective
        }
      });
      return;
    }

    // 4. Si no está en PadronHabilitados pero existe registro previo en Personal de este hospital
    if (existingInThisHospital) {
      res.json({
        exists: false,
        alreadyInHospital: true,
        globalMatch: {
          NombreCompleto: existingInThisHospital.NombreCompleto,
          HospitalNombre: 'Este Hospital',
          HospitalId: Number(hospitalId),
          ServicioNombre: existingInThisHospital.Servicio?.Nombre || '',
          RacionesMaximasDia: 1,
          EsGuardia24h: false
        }
      });
      return;
    }

    res.json({ exists: false, alreadyInHospital: false, globalMatch: null });
  } catch (error) {
    console.error('Error checking DNI:', error);
    res.status(500).json({ error: 'Error al verificar DNI' });
  }
});

// 5.c.1 ASIGNACIÓN DIRECTA DE PLANTEL (para agentes que ya existen en la BD y no cambian cantidad de raciones)
app.post('/api/staff/plantel-directo', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const userServicioId = req.user?.servicioId;
  const { agendados, servicioId } = req.body;

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const targetServicioId = servicioId ? Number(servicioId) : userServicioId;
  if (!targetServicioId) {
    res.status(400).json({ error: 'Servicio no especificado' });
    return;
  }

  if (!agendados || !Array.isArray(agendados)) {
    res.status(400).json({ error: 'Datos inválidos' });
    return;
  }

  try {
    for (const item of agendados) {
      if (!item.DNI) continue;
      const cleanDni = String(item.DNI).replace(/\D/g, '');
      if (!cleanDni) continue;

      const padronItem = await prisma.padronHabilitados.findUnique({
        where: { DNI: cleanDni }
      });

      const nombreCompleto = padronItem?.NombreCompleto || item.NombreCompleto || 'AGENTE HOSPITAL';

      // 1. Resolver raciones numéricas estructuradas (Única Fuente de Verdad)
      const racionFinal = item.racion !== undefined ? Number(item.racion) : (item.racionNueva !== undefined ? Number(item.racionNueva) : (padronItem?.RacionesMaximasDia ?? 1));
      const isGuardia24 = racionFinal === 2;
      const isGuardia12 = racionFinal === 1;
      const conVianda = item.ConVianda !== false && racionFinal > 0;
      // 2. Dual-writing derivado para retrocompatibilidad con la tabla Personal
      const horarioLegacy = racionFinal === 2 ? 'Guardia 24h (Almuerzo y Cena)' : (racionFinal === 1 ? 'Almuerzo o Cena' : 'Sin Ración');

      const isRemoval = Boolean(item.remove);

      if (isRemoval) {
        await prisma.personal.updateMany({
          where: { DNI: cleanDni, HospitalId: Number(hospitalId), ServicioId: Number(targetServicioId) },
          data: {
            Activo: false
          }
        });
      } else {
        let agenteId = padronItem?.Id;
        if (!agenteId) {
          const nuevoPadron = await prisma.padronHabilitados.create({
            data: {
              DNI: cleanDni,
              NombreCompleto: nombreCompleto,
              HospitalId: Number(hospitalId),
              ServicioId: Number(targetServicioId),
              EsGuardia24h: isGuardia24,
              RacionesMaximasDia: racionFinal,
              Activo: conVianda,
              OrigenAlta: 'PLANTEL_DIRECTO'
            }
          });
          agenteId = nuevoPadron.Id;
        } else {
          await prisma.padronHabilitados.update({
            where: { Id: agenteId },
            data: {
              EsGuardia24h: isGuardia24,
              RacionesMaximasDia: racionFinal,
              Activo: conVianda
            }
          });
        }

        await prisma.personal.upsert({
          where: {
            HospitalId_ServicioId_DNI: {
              HospitalId: Number(hospitalId),
              ServicioId: Number(targetServicioId),
              DNI: cleanDni
            }
          },
          update: {
            NombreCompleto: nombreCompleto,
            HospitalId: Number(hospitalId),
            ServicioId: Number(targetServicioId),
            ConVianda: conVianda,
            EsGuardia12: isGuardia12,
            EsGuardia24: isGuardia24,
            Horario: horarioLegacy,
            Activo: conVianda,
            AgenteId: agenteId
          },
          create: {
            DNI: cleanDni,
            NombreCompleto: nombreCompleto,
            HospitalId: Number(hospitalId),
            ServicioId: Number(targetServicioId),
            Horario: horarioLegacy,
            PeriodoInicio: new Date(2020, 0, 1),
            PeriodoFin: new Date(2035, 11, 31),
            ConVianda: conVianda,
            EsGuardia12: isGuardia12,
            EsGuardia24: isGuardia24,
            Activo: conVianda,
            AgenteId: agenteId
          }
        });
      }
    }

    bumpHospitalVersion(hospitalId);
    await logAudit(req, 'ACTUALIZACION_PLANTEL_DIRECTO', `Plantel actualizado directamente para servicio ID ${targetServicioId} con ${agendados.length} agentes.`);
    res.json({ message: 'Plantel actualizado correctamente.' });
  } catch (error: any) {
    console.error('Error actualizando plantel directo:', error);
    res.status(500).json({ error: 'Error al actualizar plantel: ' + (error?.message || error?.toString() || 'Error interno') });
  }
});

// 5.c GESTIÓN DE SOLICITUDES DE CAMBIOS DE PLANTEL (JEFE -> GERENCIA)
app.post('/api/staff/plantel-solicitud', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const userServicioId = req.user?.servicioId;
  const { plantel, servicioId } = req.body;

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const targetServicioId = servicioId ? Number(servicioId) : userServicioId;
  if (!targetServicioId) {
    res.status(400).json({ error: 'Servicio no especificado' });
    return;
  }

  if (!plantel || !Array.isArray(plantel)) {
    res.status(400).json({ error: 'No se incluyeron agentes en la solicitud' });
    return;
  }

  try {
    // Buscar si ya existe una solicitud en estado 'Pendiente' para este servicio
    const existente = await prisma.solicitudesPlantel.findFirst({
      where: {
        HospitalId: Number(hospitalId),
        ServicioId: Number(targetServicioId),
        Estado: 'Pendiente'
      }
    });

    if (plantel.length === 0) {
      if (existente) {
        await prisma.solicitudesPlantel.delete({ where: { Id: existente.Id } });
        bumpHospitalVersion(hospitalId);
        await logAudit(req, 'SOLICITUD_PLANTEL_CANCELADA', `Solicitud de modificación de plantel cancelada/eliminada para servicio ID ${targetServicioId}.`);
      }
      res.json({ message: 'Solicitudes pendientes canceladas correctamente.', id: existente?.Id || null });
      return;
    }

    let finalPlantel = plantel;
    if (existente && existente.DatosJson) {
      try {
        const existingItems: any[] = JSON.parse(existente.DatosJson);
        const mapByDni = new Map<string, any>();
        existingItems.forEach(item => {
          const dni = String(item.DNI || item.dni || '').replace(/\D/g, '');
          if (dni) mapByDni.set(dni, item);
        });
        
        plantel.forEach((newItem: any) => {
          const dni = String(newItem.DNI || newItem.dni || '').replace(/\D/g, '');
          if (dni) {
            mapByDni.set(dni, newItem);
          }
        });
        finalPlantel = Array.from(mapByDni.values());
      } catch (e) {
        console.error('Error parsing existing DatosJson during merge:', e);
      }
    }

    let solicitud;
    if (existente) {
      solicitud = await prisma.solicitudesPlantel.update({
        where: { Id: existente.Id },
        data: {
          SolicitadoPorId: Number(req.user!.userId),
          DatosJson: JSON.stringify(finalPlantel),
          FechaSolicitud: new Date()
        }
      });
    } else {
      solicitud = await prisma.solicitudesPlantel.create({
        data: {
          HospitalId: Number(hospitalId),
          ServicioId: Number(targetServicioId),
          SolicitadoPorId: Number(req.user!.userId),
          Estado: 'Pendiente',
          DatosJson: JSON.stringify(finalPlantel)
        }
      });
    }

    bumpHospitalVersion(hospitalId);
    await logAudit(req, 'SOLICITUD_PLANTEL', `Solicitud de modificación de plantel ${existente ? 'actualizada' : 'enviada'} para servicio ID ${targetServicioId} con ${finalPlantel.length} novedades.`);

    res.json({
      message: 'Solicitud de actualización enviada correctamente a Gerencia para su aprobación.',
      id: solicitud.Id
    });
  } catch (error: any) {
    console.error('Error registrando solicitud de plantel:', error);
    res.status(500).json({ error: 'Error al registrar solicitud de plantel: ' + (error?.message || error?.toString() || 'Error interno') });
  }
});

app.get('/api/staff/plantel-solicitudes', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.json([]);
    return;
  }

  const currentEtag = `W/"hosp_${hospitalId}_ver_${getHospitalVersion(hospitalId)}"`;
  if (req.headers['if-none-match'] === currentEtag) {
    res.status(304).end();
    return;
  }
  res.setHeader('ETag', currentEtag);

  try {
    const solicitudes = await prisma.solicitudesPlantel.findMany({
      where: { HospitalId: Number(hospitalId) },
      include: {
        Servicio: true,
        SolicitadoPor: { select: { Id: true, NombreCompleto: true, NombreUsuario: true } }
      },
      orderBy: { Id: 'desc' },
      take: 50
    });

    // Auto-reparar solicitudes pendientes que perdieron agentes por la sobrescritura anterior
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const sol of solicitudes) {
      if (sol.Estado !== 'Pendiente') continue;

      let items: any[] = [];
      try { items = JSON.parse(sol.DatosJson || '[]'); } catch (e) { items = []; }

      // Buscar pedidos de comida solicitados por el usuario para hoy/fechas recientes
      const orders = await prisma.pedidosComida.findMany({
        where: {
          SolicitadoPorUsuarioId: sol.SolicitadoPorId,
          FechaPedido: { gte: today },
          Estado: { in: ['Pendiente', 'Aprobado'] }
        },
        include: { Personal: true }
      });

      let modified = false;
      const existingDnis = new Set(items.map(i => String(i.DNI || i.dni || '').replace(/\D/g, '')));

      for (const ord of orders) {
        const dni = ord.EmergenciaDNI || (ord.Personal ? ord.Personal.DNI : null);
        const cleanDni = dni ? String(dni).replace(/\D/g, '') : null;
        if (!cleanDni) continue;

        if (!existingDnis.has(cleanDni)) {
          // Verificar si ya está activo en Personal para ese servicio
          const alreadyActive = await prisma.personal.findFirst({
            where: { HospitalId: sol.HospitalId, ServicioId: sol.ServicioId, DNI: cleanDni, Activo: true }
          });

          if (!alreadyActive) {
            const nombre = ord.EmergenciaNombreCompleto || (ord.Personal ? ord.Personal.NombreCompleto : 'AGENTE NUEVO');
            items.push({
              DNI: cleanDni,
              NombreCompleto: nombre,
              Horario: 'Almuerzo o Cena',
              ConVianda: true,
              isNuevo: true,
              racionAnterior: 0,
              racionNueva: 1
            });
            existingDnis.add(cleanDni);
            modified = true;
          }
        }
      }

      if (modified) {
        const newJson = JSON.stringify(items);
        await prisma.solicitudesPlantel.update({
          where: { Id: sol.Id },
          data: { DatosJson: newJson }
        });
        sol.DatosJson = newJson;
      }
    }

    res.json(solicitudes);
  } catch (error) {
    console.error('Error fetching solicitudes de plantel:', error);
    res.status(500).json({ error: 'Error al consultar solicitudes de plantel' });
  }
});

app.post('/api/staff/plantel-solicitudes/:id/aprobar', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const solicitudId = Number(req.params.id);
  const { approvedDnis } = req.body || {};
  const hasApprovedFilter = Array.isArray(approvedDnis);

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  try {
    const solicitud = await prisma.solicitudesPlantel.findFirst({
      where: { Id: solicitudId, HospitalId: Number(hospitalId) }
    });

    if (!solicitud) {
      res.status(404).json({ error: 'Solicitud no encontrada' });
      return;
    }

    if (solicitud.Estado !== 'Pendiente') {
      res.status(400).json({ error: `La solicitud ya fue procesada anteriormente (${solicitud.Estado}).` });
      return;
    }

    const items = JSON.parse(solicitud.DatosJson || '[]');
    let cantAprobados = 0;
    let cantRechazados = 0;

    const updatedItems = [];

    for (const item of items) {
      const cleanDni = String(item.DNI || item.dni || '').replace(/\D/g, '');
      const nombreCompleto = String(item.NombreCompleto || item.nombre || '').trim().toUpperCase();
      if (!cleanDni || !nombreCompleto) {
        updatedItems.push(item);
        continue;
      }

      const isApproved = !hasApprovedFilter || approvedDnis.includes(cleanDni);
      const itemConEstado = {
        ...item,
        EstadoDetalle: isApproved ? 'Aprobado' : 'Rechazado'
      };
      updatedItems.push(itemConEstado);

      if (isApproved) {
        cantAprobados++;
        // 1. Resolver raciones numéricas puras de la solicitud
        const racionTarget = item.racionNueva !== undefined ? Number(item.racionNueva) : (item.racion !== undefined ? Number(item.racion) : (item.EsGuardia24 ? 2 : 1));
        const isGuardia24 = racionTarget === 2;
        const isGuardia12 = racionTarget === 1;
        const conVianda = item.ConVianda !== undefined ? Boolean(item.ConVianda) : (racionTarget > 0);
        // 2. Dual writing derivado para retrocompatibilidad con la tabla Personal
        const horarioLegacy = racionTarget === 2 ? 'Guardia 24h (Almuerzo y Cena)' : (racionTarget === 1 ? 'Almuerzo o Cena' : 'Sin Ración');

        const existingPadron = await prisma.padronHabilitados.findUnique({
          where: { DNI: cleanDni }
        });

        let padronRecord;
        if (existingPadron) {
          const isFromSameHospital = existingPadron.HospitalId === Number(solicitud.HospitalId);
          padronRecord = await prisma.padronHabilitados.update({
            where: { DNI: cleanDni },
            data: {
              NombreCompleto: existingPadron.NombreCompleto || nombreCompleto,
              ...(isFromSameHospital ? { HospitalId: Number(solicitud.HospitalId), ServicioId: Number(solicitud.ServicioId) } : {}),
              EsGuardia24h: isGuardia24,
              RacionesMaximasDia: racionTarget,
              Activo: conVianda
            }
          });
        } else {
          padronRecord = await prisma.padronHabilitados.create({
            data: {
              DNI: cleanDni,
              NombreCompleto: nombreCompleto,
              HospitalId: Number(solicitud.HospitalId),
              ServicioId: Number(solicitud.ServicioId),
              EsGuardia24h: isGuardia24,
              RacionesMaximasDia: racionTarget,
              Activo: conVianda,
              OrigenAlta: 'SOLICITUD_PLANTEL'
            }
          });
        }

        // Crear o actualizar ÚNICAMENTE la fila de Personal para ESTE hospital y servicio con la FK AgenteId
        const personalRecord = await prisma.personal.upsert({
          where: {
            HospitalId_ServicioId_DNI: {
              HospitalId: Number(solicitud.HospitalId),
              ServicioId: Number(solicitud.ServicioId),
              DNI: cleanDni
            }
          },
          update: {
            NombreCompleto: padronRecord.NombreCompleto,
            HospitalId: Number(solicitud.HospitalId),
            ServicioId: Number(solicitud.ServicioId),
            Horario: horarioLegacy,
            ConVianda: conVianda,
            EsGuardia12: isGuardia12,
            EsGuardia24: isGuardia24,
            Activo: conVianda,
            AgenteId: padronRecord.Id
          },
          create: {
            DNI: cleanDni,
            NombreCompleto: padronRecord.NombreCompleto,
            HospitalId: Number(solicitud.HospitalId),
            ServicioId: Number(solicitud.ServicioId),
            Horario: horarioLegacy,
            PeriodoInicio: new Date(2020, 0, 1),
            PeriodoFin: new Date(2035, 11, 31),
            ConVianda: conVianda,
            EsGuardia12: isGuardia12,
            EsGuardia24: isGuardia24,
            Activo: conVianda,
            AgenteId: padronRecord.Id
          }
        });

        // Vincular AgenteId únicamente en filas que tengan AgenteId nulo, SIN pisar horario/raciones de otros hospitales
        await prisma.personal.updateMany({
          where: { DNI: cleanDni, AgenteId: null },
          data: {
            AgenteId: padronRecord.Id
          }
        });

        // Vincular pedidos de comida existentes para este DNI y aprobarlos al dar el alta
        await prisma.pedidosComida.updateMany({
          where: {
            OR: [
              { EmergenciaDNI: cleanDni },
              { Personal: { DNI: cleanDni } }
            ],
            SolicitadoPorUsuarioId: solicitud.SolicitadoPorId,
            Estado: 'Pendiente'
          },
          data: {
            PersonalId: personalRecord.Id,
            AgenteId: padronRecord.Id,
            Estado: 'Aprobado'
          }
        });
      } else {
        cantRechazados++;
        // Agente desmarcado/rechazado: Rechazar sus pedidos de comida pendientes
        await prisma.pedidosComida.updateMany({
          where: {
            OR: [
              { EmergenciaDNI: cleanDni },
              { Personal: { DNI: cleanDni } }
            ],
            SolicitadoPorUsuarioId: solicitud.SolicitadoPorId,
            Estado: 'Pendiente'
          },
          data: {
            Estado: 'Rechazado'
          }
        });
      }
    }

    const estadoFinal = cantAprobados > 0 ? 'Aprobado' : 'Rechazado';

    await prisma.solicitudesPlantel.update({
      where: { Id: solicitudId },
      data: {
        Estado: estadoFinal,
        DatosJson: JSON.stringify(updatedItems),
        FechaRespuesta: new Date(),
        RespuestaPorId: req.user!.userId
      }
    });

    bumpHospitalVersion(hospitalId);
    await logAudit(req, 'APROBACION_PLANTEL', `Solicitud de plantel ID ${solicitudId} procesada (${cantAprobados} aprobados, ${cantRechazados} rechazados).`);

    res.json({ message: 'Solicitud procesada y plantel actualizado correctamente.', cantAprobados, cantRechazados });
  } catch (error) {
    console.error('Error aprobando solicitud de plantel:', error);
    res.status(500).json({ error: 'Error al aprobar solicitud de plantel' });
  }
});

app.post('/api/staff/plantel-solicitudes/:id/rechazar', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const solicitudId = Number(req.params.id);

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  try {
    const solicitud = await prisma.solicitudesPlantel.findFirst({
      where: { Id: solicitudId, HospitalId: Number(hospitalId) }
    });

    if (!solicitud) {
      res.status(404).json({ error: 'Solicitud no encontrada' });
      return;
    }

    const items = JSON.parse(solicitud.DatosJson || '[]');

    const updatedItems = items.map((item: any) => ({
      ...item,
      EstadoDetalle: 'Rechazado'
    }));

    for (const item of items) {
      const cleanDni = String(item.DNI || item.dni || '').replace(/\D/g, '');
      if (!cleanDni) continue;

      await prisma.pedidosComida.updateMany({
        where: {
          OR: [
            { EmergenciaDNI: cleanDni },
            { Personal: { DNI: cleanDni } }
          ],
          SolicitadoPorUsuarioId: solicitud.SolicitadoPorId,
          Estado: 'Pendiente'
        },
        data: {
          Estado: 'Rechazado'
        }
      });
    }

    await prisma.solicitudesPlantel.update({
      where: { Id: solicitudId },
      data: {
        Estado: 'Rechazado',
        DatosJson: JSON.stringify(updatedItems),
        FechaRespuesta: new Date(),
        RespuestaPorId: req.user!.userId
      }
    });

    bumpHospitalVersion(hospitalId);
    await logAudit(req, 'RECHAZO_PLANTEL', `Solicitud de plantel ID ${solicitudId} rechazada.`);

    res.json({ message: 'Solicitud rechazada.' });
  } catch (error) {
    console.error('Error rechazando solicitud de plantel:', error);
    res.status(500).json({ error: 'Error al rechazar solicitud de plantel' });
  }
});

// 6. ENTREGAS DE VIANDAS MEDIANTE ESCANEO DNI / QR
app.get(['/api/deliveries/scan-check', '/api/deliveries/check'], authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const { code, query, fecha, tipoComida } = req.query;

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const rawCode = String(code || query || '').trim();
  if (!rawCode) {
    res.status(400).json({ error: 'Código o DNI no proporcionado' });
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const targetFechaStr = fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? String(fecha) : todayStr;
  const targetDate = new Date(`${targetFechaStr}T00:00:00.000Z`);

  try {
    let serviceId: number | null = null;
    let searchedDni: string | null = null;
    let isConsolidado = false;
    let scannedTipoComidaFromQR: string | null = null;
    let qrDateStr: string | null = null;

    if (rawCode.startsWith('SERVICE_ORDER:')) {
      const parts = rawCode.split(':');
      if (parts[1]) serviceId = Number(parts[1]);
      if (parts[2] && (parts[2].toLowerCase() === 'almuerzo' || parts[2].toLowerCase() === 'cena')) {
        scannedTipoComidaFromQR = parts[2];
      }
      if (parts[4]) {
        qrDateStr = parts[4].trim();
      }
      isConsolidado = true;
    } else if (rawCode.includes('-Total:')) {
      const parts = rawCode.split('-');
      if (parts[1] && (parts[1].toLowerCase() === 'almuerzo' || parts[1].toLowerCase() === 'cena')) {
        scannedTipoComidaFromQR = parts[1];
      }
      for (const p of parts) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(p) || /^\d{2}\/\d{2}\/\d{4}$/.test(p)) {
          qrDateStr = p;
          break;
        }
      }
      isConsolidado = true;
    }

    if (!isConsolidado) {
      searchedDni = extractDniFromScan(rawCode);
      if (searchedDni && (searchedDni.startsWith('SERVICE_ORDER:') || searchedDni.includes('-Total:'))) {
        searchedDni = null;
        isConsolidado = true;
      }
      // Buscar fecha en código individual
      const dateIsoMatch = rawCode.match(/\b\d{4}-\d{2}-\d{2}\b/);
      const dateArMatch = rawCode.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
      if (dateIsoMatch) {
        qrDateStr = dateIsoMatch[0];
      } else if (dateArMatch) {
        qrDateStr = dateArMatch[0];
      }
    }

    // Normalizar fecha del QR a YYYY-MM-DD si vino en DD/MM/YYYY
    let normalizedQrDate = qrDateStr;
    if (qrDateStr && /^\d{2}\/\d{2}\/\d{4}$/.test(qrDateStr)) {
      const [d, m, y] = qrDateStr.split('/');
      normalizedQrDate = `${y}-${m}-${d}`;
    }

    // VALIDACIÓN DE SEGURIDAD TEMPORAL DEL VOUCHER
    // Ventana de gracia para vouchers legacy sin fecha: hasta el final del lunes 26/10/2026
    const FECHA_LIMITE_GRACIA_LEGACY = '2026-10-26';

    if (normalizedQrDate) {
      if (normalizedQrDate !== targetFechaStr) {
        const displayQrDate = normalizedQrDate.split('-').reverse().join('/');
        const displayTargetDate = targetFechaStr.split('-').reverse().join('/');
        res.status(400).json({
          error: `🛑 VOUCHER EXPIRADO / INVÁLIDO: Este voucher corresponde a la fecha ${displayQrDate} y no coincide con la fecha operativa de entrega (${displayTargetDate}).`
        });
        return;
      }
    } else {
      // Si el voucher no contiene fecha (formato legacy anterior)
      if (targetFechaStr > FECHA_LIMITE_GRACIA_LEGACY) {
        res.status(400).json({
          error: `🛑 VOUCHER OBSOLETO: El voucher escaneado no contiene fecha de emisión segura. El período de tolerancia para vouchers sin fecha expiró el 26/10/2026. Por favor solicite la reimpresión oficial del voucher del día.`
        });
        return;
      }
    }

    let agenteMain: any = null;
    let pedidoExistente: any = null;

    if (searchedDni && !isConsolidado) {
      let filterComida: any = {};
      const activeTipoComida = scannedTipoComidaFromQR || tipoComida;
      if (activeTipoComida) {
        filterComida = { TipoComida: String(activeTipoComida) };
      }

      pedidoExistente = await prisma.pedidosComida.findFirst({
        where: {
          FechaPedido: targetDate,
          Estado: 'Aprobado',
          OR: [
            { Agente: { DNI: searchedDni } },
            { ReemplazaAgente: { DNI: searchedDni } },
            { Personal: { DNI: searchedDni } },
            { EmergenciaDNI: searchedDni },
            { PersonalReemplazado: { DNI: searchedDni } }
          ],
          ...filterComida
        },
        include: {
          Agente: { include: { Servicio: true } },
          ReemplazaAgente: { include: { Servicio: true } },
          Personal: { include: { Servicio: true } },
          PersonalReemplazado: { include: { Servicio: true } },
          SolicitadoPor: { include: { Servicio: true } }
        },
        orderBy: { Id: 'desc' }
      });

      agenteMain = await prisma.padronHabilitados.findFirst({
        where: { DNI: searchedDni, HospitalId: Number(hospitalId) },
        include: { Servicio: true }
      });
      if (!agenteMain) {
        agenteMain = await prisma.personal.findFirst({
          where: { DNI: searchedDni, HospitalId: Number(hospitalId) },
          include: { Servicio: true }
        });
      }
    }

    // Fallback: si no hay serviceId ni agenteMain ni pedidoExistente, buscar si rawCode contiene el nombre de algún servicio del hospital
    if (!serviceId && !agenteMain && !pedidoExistente) {
      const hospitalServices = await prisma.servicios.findMany({
        where: { HospitalId: Number(hospitalId) }
      });
      const matchS = hospitalServices.find(s => 
        rawCode.toLowerCase().includes(s.Nombre.toLowerCase()) || 
        normalizeForMatching(rawCode).includes(normalizeForMatching(s.Nombre))
      );
      if (matchS) {
        serviceId = matchS.Id;
        isConsolidado = true;
      }
    }

    const orderedServiceObj = pedidoExistente?.SolicitadoPor?.Servicio || pedidoExistente?.Personal?.Servicio || pedidoExistente?.PersonalReemplazado?.Servicio || pedidoExistente?.Agente?.Servicio;
    const orderedServiceId = orderedServiceObj?.Id || null;

    let targetServiceId: number | null = serviceId || orderedServiceId || agenteMain?.ServicioId || null;
    let servicioObj: any = orderedServiceObj || null;

    if (targetServiceId && !servicioObj) {
      servicioObj = await prisma.servicios.findUnique({ where: { Id: Number(targetServiceId) } });
    }

    // Determinar si es consolidado: QR de servicio OR servicio configurado con VoucherIndividual === false
    const isConsolidadoMode = Boolean(isConsolidado || rawCode.startsWith('SERVICE_ORDER:') || rawCode.includes('-Total:') || (servicioObj && servicioObj.VoucherIndividual === false));

    let rawPedidos: any[] = [];

    if (isConsolidadoMode && (targetServiceId || servicioObj)) {
      isConsolidado = true;
      // MODALIDAD CONSOLIDADO: Cargar TODOS los pedidos aprobados del hospital para la fecha y luego filtrar por servicio
      const whereCondition: any = {
        FechaPedido: targetDate,
        Estado: 'Aprobado',
        SolicitadoPor: { HospitalId: Number(hospitalId) }
      };

      if (targetServiceId) {
        whereCondition.OR = [
          { Agente: { ServicioId: Number(targetServiceId) } },
          { Personal: { ServicioId: Number(targetServiceId) } },
          { PersonalReemplazado: { ServicioId: Number(targetServiceId) } },
          { SolicitadoPor: { ServicioId: Number(targetServiceId) } },
          { JustificacionSolicitud: { contains: `[SERVICIO:` } }
        ];
      }

      rawPedidos = await prisma.pedidosComida.findMany({
        where: whereCondition,
        include: {
          Agente: { include: { Servicio: true } },
          ReemplazaAgente: { include: { Servicio: true } },
          Personal: { include: { Servicio: true } },
          PersonalReemplazado: { include: { Servicio: true } },
          SolicitadoPor: { include: { Servicio: true } },
          EntregadoPor: true
        },
        orderBy: { Id: 'asc' }
      });
    } else if (searchedDni) {
      isConsolidado = false;
      // MODALIDAD INDIVIDUAL: Cargar el pedido directo del DNI escaneado
      rawPedidos = await prisma.pedidosComida.findMany({
        where: {
          FechaPedido: targetDate,
          Estado: 'Aprobado',
          OR: [
            { Agente: { DNI: searchedDni } },
            { ReemplazaAgente: { DNI: searchedDni } },
            { Personal: { DNI: searchedDni } },
            { EmergenciaDNI: searchedDni },
            { PersonalReemplazado: { DNI: searchedDni } }
          ]
        },
        include: {
          Agente: { include: { Servicio: true } },
          ReemplazaAgente: { include: { Servicio: true } },
          Personal: { include: { Servicio: true } },
          PersonalReemplazado: { include: { Servicio: true } },
          SolicitadoPor: { include: { Servicio: true } },
          EntregadoPor: true
        }
      });
    }

    let enrichedPedidos = await enrichEmergencyList(rawPedidos);

    // En modo consolidado con servicioObj, filtrar los pedidos por el servicio correspondiente usando matching normalizado
    if (isConsolidadoMode && servicioObj) {
      const targetNormServicio = normalizeForMatching(servicioObj.Nombre);
      enrichedPedidos = enrichedPedidos.filter((p: any) => {
        const pServicioNombre = p.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || p.PersonalReemplazado?.Servicio?.Nombre || p.SolicitadoPor?.Servicio?.Nombre || '';
        if (pServicioNombre && normalizeForMatching(pServicioNombre) === targetNormServicio) return true;
        if (p.Personal?.ServicioId === targetServiceId || p.PersonalReemplazado?.ServicioId === targetServiceId || p.SolicitadoPor?.ServicioId === targetServiceId) return true;
        return false;
      });
    }

    const activeTipoComida = scannedTipoComidaFromQR || tipoComida;
    if (activeTipoComida) {
      enrichedPedidos = enrichedPedidos.filter((p: any) => p.TipoComida.toLowerCase() === String(activeTipoComida).toLowerCase());
    }

    if (!servicioObj) {
      const s = agenteMain?.Servicio || (enrichedPedidos[0]?.Servicio) || (rawPedidos[0]?.Personal?.Servicio) || (rawPedidos[0]?.SolicitadoPor?.Servicio);
      if (s) {
        servicioObj = s;
      }
    }

    const formattedPedidos = enrichedPedidos.map((p: any) => {
      const sNombre = p.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || p.PersonalReemplazado?.Servicio?.Nombre || p.SolicitadoPor?.Servicio?.Nombre || 'Servicio General';
      const aNombre = p.EmergenciaNombreCompleto || p.Personal?.NombreCompleto || p.PersonalReemplazado?.NombreCompleto || 'Agente';
      const aDni = p.EmergenciaDNI || p.Personal?.DNI || p.PersonalReemplazado?.DNI || '-';

      return {
        Id: p.Id,
        AgenteNombre: aNombre,
        AgenteDNI: aDni,
        ServicioNombre: sNombre,
        TipoComida: p.TipoComida,
        TipoDieta: p.TipoDieta,
        Estado: p.Estado,
        Entregado: Boolean(p.FechaEntregado),
        FechaEntregado: p.FechaEntregado ? new Date(p.FechaEntregado).toISOString() : null,
        EntregadoPor: p.EntregadoPor?.NombreCompleto || p.EntregadoPor?.NombreUsuario || null,
        Justificacion: p.JustificacionSolicitud ? p.JustificacionSolicitud.replace(/\[SERVICIO:.*?\]/g, '').trim() : ''
      };
    });

    res.json({
      mode: isConsolidado ? 'servicio' : 'individual',
      dniScanned: searchedDni,
      agenteScanned: agenteMain ? {
        Id: agenteMain.Id,
        NombreCompleto: agenteMain.NombreCompleto,
        DNI: agenteMain.DNI,
        ServicioNombre: agenteMain.Servicio?.Nombre || 'Servicio'
      } : null,
      servicio: servicioObj ? {
        Id: servicioObj.Id,
        Nombre: servicioObj.Nombre,
        VoucherIndividual: servicioObj.VoucherIndividual
      } : null,
      pedidos: formattedPedidos
    });
  } catch (error: any) {
    console.error('Error al chequear escaneo:', error);
    res.status(500).json({ error: 'Error al procesar escaneo: ' + (error?.message || String(error)) });
  }
});

// Endpoint para validar el DNI del agente que retira viandas consolidadas
app.get('/api/deliveries/check-pickup-agent', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const { dni } = req.query;
  const hospitalId = req.user?.hospitalId;

  if (!dni) {
    res.status(400).json({ error: 'DNI es requerido.' });
    return;
  }

  const cleanDni = String(dni).trim();

  try {
    const agente = await prisma.padronHabilitados.findFirst({
      where: {
        DNI: cleanDni,
        Activo: true,
        ...(hospitalId ? { HospitalId: Number(hospitalId) } : {})
      },
      include: {
        Servicio: true
      }
    });

    if (!agente) {
      res.status(404).json({ error: 'El DNI ingresado no pertenece a ningún agente habilitado de este hospital.' });
      return;
    }

    res.json({
      id: agente.Id,
      dni: agente.DNI,
      nombreCompleto: agente.NombreCompleto,
      servicio: agente.Servicio?.Nombre || 'Sin Servicio'
    });
  } catch (error: any) {
    console.error('Error al verificar agente que retira:', error);
    res.status(500).json({ error: 'Error al verificar agente: ' + (error?.message || String(error)) });
  }
});

app.post('/api/deliveries/confirm-delivery', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const { pedidoIds, retiradoPorAgenteId } = req.body;
  const userId = req.user?.userId || (req.user as any)?.id;
  const hospitalId = req.user?.hospitalId;

  if (!Array.isArray(pedidoIds) || pedidoIds.length === 0) {
    res.status(400).json({ error: 'Debe seleccionar al menos un pedido para entregar.' });
    return;
  }

  try {
    const ids = pedidoIds.map(Number);

    const yaEntregados = await prisma.pedidosComida.findMany({
      where: {
        Id: { in: ids },
        FechaEntregado: { not: null }
      }
    });

    if (yaEntregados.length > 0) {
      res.status(400).json({
        error: `Algunos pedidos seleccionados ya habían sido entregados previamente.`
      });
      return;
    }

    const targetPedidos = await prisma.pedidosComida.findMany({
      where: { Id: { in: ids } },
      include: {
        Agente: { include: { Servicio: true } },
        Personal: { include: { Servicio: true } },
        SolicitadoPor: { include: { Servicio: true } }
      }
    });

    const isConsolidadoService = targetPedidos.some((p: any) => {
      const s = p.Agente?.Servicio || p.Personal?.Servicio || p.SolicitadoPor?.Servicio;
      return s && s.VoucherIndividual === false;
    });

    if (isConsolidadoService && !retiradoPorAgenteId) {
      res.status(400).json({ error: 'Para entregas de servicios consolidados es obligatorio registrar el DNI del agente que retira.' });
      return;
    }

    let agenteRetiraObj: any = null;
    if (retiradoPorAgenteId) {
      agenteRetiraObj = await prisma.padronHabilitados.findUnique({
        where: { Id: Number(retiradoPorAgenteId) },
        include: { Servicio: true }
      });
      if (!agenteRetiraObj || !agenteRetiraObj.Activo || (hospitalId && agenteRetiraObj.HospitalId && agenteRetiraObj.HospitalId !== hospitalId)) {
        res.status(400).json({ error: 'El agente especificado para el retiro no es válido o no pertenece a este hospital.' });
        return;
      }
    }

    const updateCount = await prisma.pedidosComida.updateMany({
      where: {
        Id: { in: ids },
        FechaEntregado: null
      },
      data: {
        FechaEntregado: new Date(),
        EntregadoPorUsuarioId: Number(userId),
        ...(retiradoPorAgenteId ? { RetiradoPorAgenteId: Number(retiradoPorAgenteId) } : {})
      }
    });

    if (updateCount.count === 0) {
      res.status(400).json({ error: 'Las raciones seleccionadas ya fueron marcadas como entregadas por otra terminal o puesto.' });
      return;
    }

    const retiraTexto = agenteRetiraObj 
      ? ` | Retirado por: ${agenteRetiraObj.NombreCompleto} (DNI ${agenteRetiraObj.DNI} - ${agenteRetiraObj.Servicio?.Nombre || 'Servicio'})`
      : '';

    await logAudit(req, 'ENTREGA_RACIONES_DNI_QR', `Entregadas ${ids.length} raciones mediante escaneo de DNI/QR${retiraTexto}`);
    res.json({ message: `Se registraron exitosamente ${ids.length} entrega(s) de raciones.` });
  } catch (error: any) {
    console.error('Error al confirmar entrega:', error);
    res.status(500).json({ error: 'Error al registrar entrega: ' + (error?.message || String(error)) });
  }
});

// =============================================================================
// TERMINAL DE AUTOSERVICIO (TÓTEM) PARA VALIDACIÓN DE RACIONES INDIVIDUALES
// =============================================================================

// Endpoint para consultar estado, hospital y turno activo del tótem
app.get('/api/totem/info', authenticateToken, isTotem, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const terminalId = req.user?.terminalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'Tótem sin hospital configurado.' });
    return;
  }

  // Si tiene terminalId, auditar y actualizar actividad
  if (terminalId) {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
    await prisma.terminalesTotem.update({
      where: { Id: terminalId },
      data: { UltimaActividad: new Date(), ...(clientIp ? { IpAddress: clientIp } : {}) }
    }).catch(err => console.error('Error al actualizar actividad de terminal:', err));
  }

  const now = new Date();
  const hourAr = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: 'numeric',
      hour12: false
    }).format(now),
    10
  );
  const activeTurno = hourAr < 16 ? 'Almuerzo' : 'Cena';

  try {
    const hospital = await prisma.hospitales.findUnique({
      where: { Id: Number(hospitalId) }
    });

    res.json({
      hospitalId,
      hospitalNombre: hospital?.Nombre || 'Hospital',
      activeTurno,
      horaServidor: now.toISOString()
    });
  } catch (error: any) {
    console.error('Error al obtener info del totem:', error);
    res.status(500).json({ error: 'Error al consultar información del tótem: ' + (error?.message || String(error)) });
  }
});

// Almacén en memoria de códigos cortos de vinculación de tótem (PIN de 6 dígitos) con TTL estricto
const totemPairingCodes = new Map<string, { token: string; hospitalId: number; hospitalName: string; expiresAt: number }>();

// Endpoint para emitir token / QR maestro de activación de terminales tótem (10 MINUTOS DE CADUCIDAD)
app.get('/api/totem/activation-token', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId || req.query.hospitalId;
  if (!hospitalId) {
    res.status(400).json({ error: 'Hospital no especificado' });
    return;
  }

  try {
    const hospital = await prisma.hospitales.findUnique({
      where: { Id: Number(hospitalId) }
    });
    if (!hospital) {
      res.status(404).json({ error: 'Hospital no encontrado' });
      return;
    }

    let totemUser = await prisma.usuarios.findFirst({
      where: { HospitalId: Number(hospitalId), RolId: 6, Activo: true }
    });

    if (!totemUser) {
      const dummyPasswordHash = await bcrypt.hash(`Totem_${hospital.Codigo}_2026!`, 10);
      totemUser = await prisma.usuarios.create({
        data: {
          NombreUsuario: `totem_${hospital.Codigo.toLowerCase().replace(/[^a-z0-9]/g, '')}_${hospital.Id}`,
          NombreCompleto: `Tótem Autoservicio - ${hospital.Nombre}`,
          ContrasenaHash: dummyPasswordHash,
          RolId: 6,
          HospitalId: Number(hospitalId),
          Activo: true,
          DebeCambiarContrasena: false
        }
      });
    }

    const token = jwt.sign(
      {
        userId: totemUser.Id,
        roleId: 6,
        hospitalId: totemUser.HospitalId,
        servicioId: null
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    // Generar PIN numérico de 6 dígitos con expiración máxima de 10 minutos (Seguridad OTP)
    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutos
    totemPairingCodes.set(pinCode, {
      token,
      hospitalId: hospital.Id,
      hospitalName: hospital.Nombre,
      expiresAt
    });

    // Código QR ultraliviano de 12 caracteres (decodificación instantánea)
    const activationCode = `TOTEM-${pinCode}`;
    const qrDataUrl = await qrcode.toDataURL(activationCode, { width: 320, margin: 2, errorCorrectionLevel: 'M' });

    res.json({
      token,
      pinCode,
      activationCode,
      qrDataUrl,
      hospitalName: hospital.Nombre,
      username: totemUser.NombreUsuario,
      expiresInMinutes: 10
    });
  } catch (error: any) {
    console.error('Error generando token de activación de tótem:', error);
    res.status(500).json({ error: 'Error al generar código de activación del tótem: ' + (error?.message || String(error)) });
  }
});

// Endpoint público para vincular tótem mediante código PIN o QR de activación (UN SOLO USO)
app.post('/api/totem/pair', async (req: Request, res: Response): Promise<void> => {
  const rawCode = String(req.body.code || '').trim();
  if (!rawCode) {
    res.status(400).json({ error: 'Código de activación requerido.' });
    return;
  }

  // Extraer los 6 dígitos si viene como "TOTEM-123456" o "123456" o escaneado con caracteres especiales
  const digitsMatch = rawCode.match(/\b\d{6}\b/);
  const code = digitsMatch ? digitsMatch[0] : rawCode.replace(/[^0-9]/g, '');

  const pairing = totemPairingCodes.get(code);
  if (!pairing) {
    res.status(404).json({ error: 'Código de activación no válido, expirado o ya utilizado. Solicite uno nuevo desde Nutrición.' });
    return;
  }

  if (Date.now() > pairing.expiresAt) {
    totemPairingCodes.delete(code);
    res.status(400).json({ error: 'El código de activación ha superado los 10 minutos de validez y expiró.' });
    return;
  }

  // 1. INMEDIATA ELIMINACIÓN: Garantizar uso único estricto (Anti-Replay Attack)
  totemPairingCodes.delete(code);

  try {
    // 2. Extraer IP y registrar la nueva terminal física en la base de datos
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const terminalName = req.body.name || `Tótem (${clientIp})`;
    const tokenHash = crypto.createHash('sha256').update(pairing.token + Date.now()).digest('hex');

    const terminal = await prisma.terminalesTotem.create({
      data: {
        HospitalId: pairing.hospitalId,
        Nombre: terminalName,
        IpAddress: clientIp,
        TokenHash: tokenHash,
        Activo: true,
        FechaVinculacion: new Date(),
        UltimaActividad: new Date()
      }
    });

    // 3. Generar token individualizado firmado con el ID de la terminal para permitir revocación
    const decodedMaster: any = jwt.decode(pairing.token);
    const terminalToken = jwt.sign(
      {
        userId: decodedMaster?.userId,
        roleId: 6,
        hospitalId: pairing.hospitalId,
        servicioId: null,
        terminalId: terminal.Id
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    await logAudit(req, 'VINCULACION_TOTEM', `Nueva terminal vinculada: ${terminal.Nombre} (ID ${terminal.Id}) - IP ${clientIp} - Hospital ID ${pairing.hospitalId}`);

    res.json({
      success: true,
      token: terminalToken,
      hospitalName: pairing.hospitalName,
      hospitalId: pairing.hospitalId,
      terminalId: terminal.Id
    });
  } catch (error: any) {
    console.error('Error al vincular terminal tótem:', error);
    res.status(500).json({ error: 'Error al registrar la terminal tótem: ' + (error?.message || String(error)) });
  }
});

// Almacén en memoria de solicitudes de vinculación inversa iniciadas por tótems
const totemClaimRequests = new Map<string, {
  createdAt: number;
  token: string | null;
  hospitalId: number | null;
  hospitalName: string | null;
  terminalId: number | null;
  boundHospitalId?: number | null;
}>();

// 1. Endpoint público para que un tótem desvinculado solicite un código PIN de emparejamiento
app.post('/api/totem/request-claim', async (req: Request, res: Response): Promise<void> => {
  try {
    const rawHospital = req.body?.hospitalId || req.body?.hospital || req.query?.hospitalId || req.query?.hospital;
    let boundHospitalId: number | null = null;
    let boundHospitalName: string | null = null;

    if (rawHospital) {
      const numId = Number(rawHospital);
      const hospital = await prisma.hospitales.findFirst({
        where: !isNaN(numId) && numId > 0
          ? { Id: numId }
          : { Codigo: String(rawHospital).trim() }
      });
      if (hospital) {
        boundHospitalId = hospital.Id;
        boundHospitalName = hospital.Nombre;
      }
    }

    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    totemClaimRequests.set(pin, {
      createdAt: Date.now(),
      token: null,
      hospitalId: null,
      hospitalName: null,
      terminalId: null,
      boundHospitalId
    });
    res.json({ success: true, pinCode: pin });
  } catch (error: any) {
    res.status(500).json({ error: 'Error al solicitar PIN de vinculación: ' + (error?.message || String(error)) });
  }
});

// 2. Endpoint público de polling para que el tótem consulte si su PIN fue autorizado por Nutrición
app.get('/api/totem/check-claim', async (req: Request, res: Response): Promise<void> => {
  const code = String(req.query.code || '').trim();
  if (!code) {
    res.status(400).json({ error: 'Código requerido' });
    return;
  }

  const claim = totemClaimRequests.get(code);
  if (!claim) {
    res.json({ claimed: false, expired: true });
    return;
  }

  // Expiración a los 15 minutos
  if (Date.now() - claim.createdAt > 15 * 60 * 1000) {
    totemClaimRequests.delete(code);
    res.json({ claimed: false, expired: true });
    return;
  }

  if (claim.token) {
    totemClaimRequests.delete(code);
    res.json({
      claimed: true,
      token: claim.token,
      hospitalName: claim.hospitalName,
      hospitalId: claim.hospitalId,
      terminalId: claim.terminalId
    });
    return;
  }

  res.json({ claimed: false, expired: false });
});

// 3. Endpoint en Nutrición para autorizar y vincular un tótem introduciendo su PIN de pantalla
app.post('/api/totem/authorize-claim', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const { code, terminalName } = req.body;

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const cleanCode = String(code || '').replace(/[^0-9]/g, '');
  if (!cleanCode || cleanCode.length !== 6) {
    res.status(400).json({ error: 'Ingrese el PIN de 6 dígitos que figura en la pantalla del tótem.' });
    return;
  }

  const claim = totemClaimRequests.get(cleanCode);
  if (!claim) {
    res.status(404).json({ error: 'El PIN ingresado no existe o ha expirado. Verifique el número en la pantalla del tótem.' });
    return;
  }

  // BLINDAJE ANTIFRAUDE INTER-HOSPITAL:
  // Si la terminal fue configurada para un hospital específico, impedir que otro hospital la vincule
  if (claim.boundHospitalId && claim.boundHospitalId !== Number(hospitalId)) {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    await logAudit(
      req,
      'INTENTO_VINCULACION_CRUZADA_TOTEM',
      `Bloqueado intento de vinculación cruzada: Usuario del Hospital ID ${hospitalId} (IP ${clientIp}) intentó reclamar tótem con PIN ${cleanCode} asignado al Hospital ID ${claim.boundHospitalId}`
    );
    res.status(403).json({ error: 'El PIN ingresado no es válido para este hospital.' });
    return;
  }

  try {
    const hospital = await prisma.hospitales.findUnique({
      where: { Id: Number(hospitalId) }
    });
    if (!hospital) {
      res.status(404).json({ error: 'Hospital no encontrado' });
      return;
    }

    let totemUser = await prisma.usuarios.findFirst({
      where: { HospitalId: Number(hospitalId), RolId: 6, Activo: true }
    });

    if (!totemUser) {
      const dummyPasswordHash = await bcrypt.hash(`Totem_${hospital.Codigo}_2026!`, 10);
      totemUser = await prisma.usuarios.create({
        data: {
          NombreUsuario: `totem_${hospital.Codigo.toLowerCase().replace(/[^a-z0-9]/g, '')}_${hospital.Id}`,
          NombreCompleto: `Tótem Autoservicio - ${hospital.Nombre}`,
          ContrasenaHash: dummyPasswordHash,
          RolId: 6,
          HospitalId: Number(hospitalId),
          Activo: true,
          DebeCambiarContrasena: false
        }
      });
    }

    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const name = terminalName || `Tótem (PIN ${cleanCode})`;
    const tokenHash = crypto.createHash('sha256').update(cleanCode + Date.now()).digest('hex');

    const terminal = await prisma.terminalesTotem.create({
      data: {
        HospitalId: hospital.Id,
        Nombre: name,
        IpAddress: clientIp,
        TokenHash: tokenHash,
        Activo: true,
        FechaVinculacion: new Date(),
        UltimaActividad: new Date()
      }
    });

    const terminalToken = jwt.sign(
      {
        userId: totemUser.Id,
        roleId: 6,
        hospitalId: hospital.Id,
        servicioId: null,
        terminalId: terminal.Id
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    claim.token = terminalToken;
    claim.hospitalId = hospital.Id;
    claim.hospitalName = hospital.Nombre;
    claim.terminalId = terminal.Id;

    await logAudit(req, 'VINCULAR_TOTEM_PIN', `Tótem vinculado por PIN ${cleanCode}: ${terminal.Nombre} (ID ${terminal.Id}) - Hospital ${hospital.Nombre}`);

    res.json({
      success: true,
      message: `¡Terminal "${terminal.Nombre}" vinculada exitosamente! Se activará en el tótem en segundos.`
    });
  } catch (error: any) {
    console.error('Error al autorizar claim de tótem:', error);
    res.status(500).json({ error: 'Error al autorizar vinculación del tótem: ' + (error?.message || String(error)) });
  }
});

// --- PANEL DE CONTROL DE TERMINALES TÓTEM EN NUTRICIÓN ---
app.get('/api/totem/terminals', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  try {
    const terminals = await prisma.terminalesTotem.findMany({
      where: { HospitalId: Number(hospitalId) },
      orderBy: { Id: 'desc' }
    });
    res.json(terminals);
  } catch (error: any) {
    console.error('Error al obtener terminales tótem:', error);
    res.status(500).json({ error: 'Error al consultar terminales: ' + (error?.message || String(error)) });
  }
});

// Revocar o Reactivar acceso de una terminal tótem
app.put('/api/totem/terminals/:id/toggle', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const terminalId = Number(req.params.id);

  try {
    const terminal = await prisma.terminalesTotem.findFirst({
      where: { Id: terminalId, HospitalId: Number(hospitalId) }
    });

    if (!terminal) {
      res.status(404).json({ error: 'Terminal no encontrada en este hospital' });
      return;
    }

    const updated = await prisma.terminalesTotem.update({
      where: { Id: terminalId },
      data: { Activo: !terminal.Activo }
    });

    await logAudit(req, 'TOGGLE_TOTEM_TERMINAL', `Terminal ${terminal.Nombre} (ID ${terminal.Id}) cambiada a ${updated.Activo ? 'ACTIVA' : 'REVOCADA'}`);
    res.json({ success: true, activo: updated.Activo, terminal: updated });
  } catch (error: any) {
    console.error('Error al cambiar estado de terminal tótem:', error);
    res.status(500).json({ error: 'Error al actualizar terminal: ' + (error?.message || String(error)) });
  }
});

// Eliminar vinculación de terminal tótem
app.delete('/api/totem/terminals/:id', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const terminalId = Number(req.params.id);

  try {
    const terminal = await prisma.terminalesTotem.findFirst({
      where: { Id: terminalId, HospitalId: Number(hospitalId) }
    });

    if (!terminal) {
      res.status(404).json({ error: 'Terminal no encontrada en este hospital' });
      return;
    }

    await prisma.terminalesTotem.delete({
      where: { Id: terminalId }
    });

    await logAudit(req, 'ELIMINAR_TOTEM_TERMINAL', `Terminal ${terminal.Nombre} (ID ${terminal.Id}) eliminada del sistema`);
    res.json({ success: true, message: 'Terminal eliminada con éxito' });
  } catch (error: any) {
    console.error('Error al eliminar terminal tótem:', error);
    res.status(500).json({ error: 'Error al eliminar terminal: ' + (error?.message || String(error)) });
  }
});

// Endpoint transaccional para dispensar ración en tótem e imprimir ticket
app.post('/api/totem/dispense', authenticateToken, isTotem, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const userId = req.user?.userId;
  const terminalId = req.user?.terminalId;

  if (!hospitalId) {
    res.status(403).json({ error: 'Tótem no tiene hospital asignado en su token.' });
    return;
  }

  const rawCode = String(req.body.code || '').trim();
  if (!rawCode) {
    res.status(400).json({ error: 'No se recibió código de escaneo.' });
    return;
  }

  // 1. RECHAZO INMEDIATO DE VOUCHERS CONSOLIDADOS
  if (rawCode.startsWith('SERVICE_ORDER:') || rawCode.includes('-Total:')) {
    res.status(400).json({
      code: 'CONSOLIDATED_VOUCHER',
      error: 'Voucher de Servicio Consolidado: Este tipo de pedido se valida en nutricion'
    });
    return;
  }

  // 2. EXTRACCIÓN DE DNI
  const searchedDni = extractDniFromScan(rawCode);
  if (!searchedDni || searchedDni.startsWith('SERVICE_ORDER:') || searchedDni.includes('-Total:')) {
    res.status(400).json({
      code: 'INVALID_SCAN',
      error: 'Código inválido. Por favor acerque su DNI o voucher individual al lector.'
    });
    return;
  }

  // 3. CÁLCULO DE HORA Y TURNO EN BUENOS AIRES CON TOLERANCIA HORARIA INTELIGENTE
  const now = new Date();
  const timeFormat = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(now);
  const hourAr = parseInt(timeFormat.find(p => p.type === 'hour')?.value || '0', 10);
  const minuteAr = parseInt(timeFormat.find(p => p.type === 'minute')?.value || '0', 10);
  const timeDecimal = hourAr + minuteAr / 60;

  // Ventana de Almuerzo Tardío: entre 16:00 y 17:30 hs para personal de cirugía o emergencias
  const isLateLunchWindow = timeDecimal >= 16.0 && timeDecimal <= 17.5;

  let activeTurno = hourAr < 16 ? 'Almuerzo' : 'Cena';
  let isLateLunch = false;

  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
  const targetDate = new Date(`${dateParts}T00:00:00.000Z`);

  // 4. VERIFICACIÓN DE FECHA SI ES UN VOUCHER INDIVIDUAL CON FECHA
  const dateIsoMatch = rawCode.match(/\b\d{4}-\d{2}-\d{2}\b/);
  const dateArMatch = rawCode.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
  let qrDateStr = dateIsoMatch ? dateIsoMatch[0] : (dateArMatch ? dateArMatch[0] : null);
  if (qrDateStr && /^\d{2}\/\d{2}\/\d{4}$/.test(qrDateStr)) {
    const [d, m, y] = qrDateStr.split('/');
    qrDateStr = `${y}-${m}-${d}`;
  }
  if (qrDateStr && qrDateStr !== dateParts) {
    const displayQr = qrDateStr.split('-').reverse().join('/');
    const displayHoy = dateParts.split('-').reverse().join('/');
    res.status(400).json({
      code: 'EXPIRED_VOUCHER',
      error: `Voucher no corresponde a hoy: Fecha voucher ${displayQr} vs Hoy ${displayHoy}`
    });
    return;
  }

  try {
    // Si estamos en la ventana de Almuerzo Tardío (16:00 a 17:30 hs):
    // Verificamos si tiene Cena aprobada. Si NO tiene Cena pero tiene un Almuerzo pendiente, se lo otorgamos.
    if (isLateLunchWindow) {
      const tieneCena = await prisma.pedidosComida.findFirst({
        where: {
          FechaPedido: targetDate,
          TipoComida: 'Cena',
          Estado: 'Aprobado',
          OR: [
            { Agente: { DNI: searchedDni } },
            { ReemplazaAgente: { DNI: searchedDni } },
            { Personal: { DNI: searchedDni } },
            { EmergenciaDNI: searchedDni },
            { PersonalReemplazado: { DNI: searchedDni } }
          ],
          AND: [
            {
              OR: [
                { SolicitadoPor: { HospitalId: Number(hospitalId) } },
                { Agente: { HospitalId: Number(hospitalId) } },
                { Personal: { HospitalId: Number(hospitalId) } }
              ]
            }
          ]
        }
      });

      if (tieneCena) {
        activeTurno = 'Cena';
        isLateLunch = false;
      } else {
        const almuerzoPendiente = await prisma.pedidosComida.findFirst({
          where: {
            FechaPedido: targetDate,
            TipoComida: 'Almuerzo',
            Estado: 'Aprobado',
            FechaEntregado: null,
            OR: [
              { Agente: { DNI: searchedDni } },
              { ReemplazaAgente: { DNI: searchedDni } },
              { Personal: { DNI: searchedDni } },
              { EmergenciaDNI: searchedDni },
              { PersonalReemplazado: { DNI: searchedDni } }
            ],
            AND: [
              {
                OR: [
                  { SolicitadoPor: { HospitalId: Number(hospitalId) } },
                  { Agente: { HospitalId: Number(hospitalId) } },
                  { Personal: { HospitalId: Number(hospitalId) } }
                ]
              }
            ]
          }
        });

        if (almuerzoPendiente) {
          activeTurno = 'Almuerzo';
          isLateLunch = true;
        } else {
          activeTurno = 'Cena';
          isLateLunch = false;
        }
      }
    }

    // 5. BÚSQUEDA DE PEDIDO APROBADO PARA EL TURNO RESUELTO
    const pedidos = await prisma.pedidosComida.findMany({
      where: {
        FechaPedido: targetDate,
        TipoComida: activeTurno,
        Estado: 'Aprobado',
        OR: [
          { Agente: { DNI: searchedDni } },
          { ReemplazaAgente: { DNI: searchedDni } },
          { Personal: { DNI: searchedDni } },
          { EmergenciaDNI: searchedDni },
          { PersonalReemplazado: { DNI: searchedDni } }
        ],
        AND: [
          {
            OR: [
              { SolicitadoPor: { HospitalId: Number(hospitalId) } },
              { Agente: { HospitalId: Number(hospitalId) } },
              { Personal: { HospitalId: Number(hospitalId) } }
            ]
          }
        ]
      },
      include: {
        Agente: { include: { Servicio: true, Hospital: true } },
        ReemplazaAgente: { include: { Servicio: true } },
        Personal: { include: { Servicio: true, Hospital: true } },
        PersonalReemplazado: { include: { Servicio: true } },
        SolicitadoPor: { include: { Servicio: true, Hospital: true } }
      },
      orderBy: { Id: 'desc' }
    });

    if (pedidos.length === 0) {
      const otherTurno = activeTurno === 'Almuerzo' ? 'Cena' : 'Almuerzo';
      const pedidoOtroTurno = await prisma.pedidosComida.findFirst({
        where: {
          FechaPedido: targetDate,
          TipoComida: otherTurno,
          Estado: 'Aprobado',
          OR: [
            { Agente: { DNI: searchedDni } },
            { ReemplazaAgente: { DNI: searchedDni } },
            { Personal: { DNI: searchedDni } },
            { EmergenciaDNI: searchedDni },
            { PersonalReemplazado: { DNI: searchedDni } }
          ],
          AND: [
            {
              OR: [
                { SolicitadoPor: { HospitalId: Number(hospitalId) } },
                { Agente: { HospitalId: Number(hospitalId) } },
                { Personal: { HospitalId: Number(hospitalId) } }
              ]
            }
          ]
        }
      });

      if (pedidoOtroTurno) {
        res.status(404).json({
          code: 'WRONG_MEAL_TIME',
          error: `Turno actual: ${activeTurno.toUpperCase()}. Su pedido aprobado es para ${otherTurno.toUpperCase()}.`
        });
        return;
      }

      res.status(404).json({
        code: 'NO_ORDER_FOUND',
        error: `No posee un pedido aprobado de ${activeTurno} para hoy.`
      });
      return;
    }

    const pedido = pedidos[0];
    const servicioObj = pedido.Agente?.Servicio || pedido.Personal?.Servicio || pedido.PersonalReemplazado?.Servicio || pedido.SolicitadoPor?.Servicio;

    // 6. VALIDAR SI EL SERVICIO ES DE TIPO CONSOLIDADO
    if (servicioObj && servicioObj.VoucherIndividual === false) {
      res.status(400).json({
        code: 'CONSOLIDATED_SERVICE',
        error: 'Voucher de Servicio Consolidado: Este tipo de pedido se valida en nutricion'
      });
      return;
    }

    // 7. VALIDAR SI YA FUE ENTREGADO
    if (pedido.FechaEntregado) {
      const horaEntrega = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).format(new Date(pedido.FechaEntregado));

      res.status(400).json({
        code: 'ALREADY_DELIVERED',
        error: `Ración ya retirada hoy a las ${horaEntrega} hs.`
      });
      return;
    }

    // 8. REGISTRAR ENTREGA ATÓMICA ESTRICTA (ANTI CONDICIÓN DE CARRERA)
    const nowDelivery = new Date();
    const updateResult = await prisma.pedidosComida.updateMany({
      where: {
        Id: pedido.Id,
        FechaEntregado: null
      },
      data: {
        FechaEntregado: nowDelivery,
        EntregadoPorUsuarioId: Number(userId),
        RetiradoPorAgenteId: pedido.AgenteId || null
      }
    });

    if (updateResult.count === 0) {
      res.status(400).json({
        code: 'ALREADY_DELIVERED',
        error: 'Esta ración ya fue registrada como entregada por otra terminal o puesto de entrega en este instante.'
      });
      return;
    }

    // 9. CÁLCULO DE CADUCIDAD DEL TICKET (MÁXIMO 20 MINUTOS)
    const expiryDate = new Date(nowDelivery.getTime() + 20 * 60 * 1000);
    const horaTicket = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(nowDelivery);

    const horaVencimiento = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(expiryDate);

    const fechaTicket = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(nowDelivery);

    const agenteNombre = pedido.EmergenciaNombreCompleto || pedido.Personal?.NombreCompleto || pedido.PersonalReemplazado?.NombreCompleto || pedido.Agente?.NombreCompleto || 'Agente';
    const agenteDni = pedido.EmergenciaDNI || pedido.Personal?.DNI || pedido.PersonalReemplazado?.DNI || pedido.Agente?.DNI || searchedDni;
    const hospitalNombre = pedido.SolicitadoPor?.Hospital?.Nombre || pedido.Personal?.Hospital?.Nombre || pedido.Agente?.Hospital?.Nombre || 'Hospital';
    const servicioNombre = servicioObj?.Nombre || 'Servicio';

    // Actualizar última actividad de la terminal si corresponde
    if (terminalId) {
      const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || null;
      await prisma.terminalesTotem.update({
        where: { Id: terminalId },
        data: { UltimaActividad: new Date(), ...(clientIp ? { IpAddress: clientIp } : {}) }
      }).catch(err => console.error('Error al actualizar actividad de terminal:', err));
    }

    const auditTurnoTxt = isLateLunch ? 'ALMUERZO TARDÍO' : activeTurno;
    await logAudit(req, 'ENTREGA_TOTEM', `Entrega Tótem ID Pedido ${pedido.Id} - DNI ${agenteDni} - ${auditTurnoTxt} - Dieta: ${pedido.TipoDieta}`);

    res.json({
      success: true,
      ticket: {
        id: pedido.Id,
        hospital: hospitalNombre,
        fecha: fechaTicket,
        hora: horaTicket,
        horaVencimiento: horaVencimiento,
        validezTexto: 'VALIDEZ: MÁXIMO 20 MINUTOS DESDE SU EMISIÓN',
        avisoCocina: 'COCINA: RETENER Y DESCARTAR ESTE COMPROBANTE',
        turno: isLateLunch ? 'ALMUERZO [TARDÍO]' : activeTurno.toUpperCase(),
        isLateLunch: isLateLunch,
        agenteNombre: agenteNombre,
        agenteDni: agenteDni,
        servicio: servicioNombre,
        tipoDieta: pedido.TipoDieta || 'Normal',
        pie: 'Entregue este ticket en cocina para recibir su vianda'
      }
    });
  } catch (error: any) {
    console.error('Error al dispensar ración en tótem:', error);
    res.status(500).json({ error: 'Error al procesar entrega en tótem: ' + (error?.message || String(error)) });
  }
});

// --- AUXILIO Y REIMPRESIÓN EN NUTRICIÓN (FALLAS O ATASCOS DE IMPRESORA) ---
app.post('/api/deliveries/:id/unmark-delivery', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const pedidoId = Number(req.params.id);
  const { motivo } = req.body || {};

  try {
    const pedido = await prisma.pedidosComida.findUnique({
      where: { Id: pedidoId },
      include: {
        SolicitadoPor: true,
        Agente: true,
        Personal: true
      }
    });

    if (!pedido) {
      res.status(404).json({ error: 'Pedido no encontrado' });
      return;
    }

    const pedidoHospId = pedido.SolicitadoPor?.HospitalId || pedido.Agente?.HospitalId || pedido.Personal?.HospitalId;
    if (hospitalId && pedidoHospId && pedidoHospId !== hospitalId) {
      res.status(403).json({ error: 'No posee permisos para modificar entregas de otro hospital.' });
      return;
    }

    if (!pedido.FechaEntregado) {
      res.status(400).json({ error: 'La ración no figura como entregada.' });
      return;
    }

    await prisma.pedidosComida.update({
      where: { Id: pedidoId },
      data: {
        FechaEntregado: null,
        EntregadoPorUsuarioId: null,
        RetiradoPorAgenteId: null
      }
    });

    const motivoTexto = motivo ? ` | Motivo: ${motivo}` : ' | Motivo: Falla o atasco de papel en tótem';
    await logAudit(req, 'DESMARCAR_ENTREGA', `Entrega ID ${pedidoId} revertida a pendiente por Nutrición${motivoTexto}`);

    res.json({ success: true, message: 'Entrega desmarcada con éxito. El agente puede volver a validar su ración.' });
  } catch (error: any) {
    console.error('Error al desmarcar entrega:', error);
    res.status(500).json({ error: 'Error al revertir entrega: ' + (error?.message || String(error)) });
  }
});

app.get('/api/deliveries/:id/ticket', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const pedidoId = Number(req.params.id);

  try {
    const pedido = await prisma.pedidosComida.findUnique({
      where: { Id: pedidoId },
      include: {
        SolicitadoPor: { include: { Hospital: true, Servicio: true } },
        Agente: { include: { Hospital: true, Servicio: true } },
        Personal: { include: { Hospital: true, Servicio: true } },
        PersonalReemplazado: { include: { Servicio: true } }
      }
    });

    if (!pedido) {
      res.status(404).json({ error: 'Pedido no encontrado' });
      return;
    }

    const nowDelivery = pedido.FechaEntregado ? new Date(pedido.FechaEntregado) : new Date();
    const horaTicket = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(nowDelivery);

    const fechaTicket = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(nowDelivery);

    const expiryDate = new Date(nowDelivery.getTime() + 20 * 60 * 1000);
    const horaVencimiento = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(expiryDate);

    const agenteNombre = pedido.EmergenciaNombreCompleto || pedido.Personal?.NombreCompleto || pedido.PersonalReemplazado?.NombreCompleto || pedido.Agente?.NombreCompleto || 'Agente';
    const agenteDni = pedido.EmergenciaDNI || pedido.Personal?.DNI || pedido.PersonalReemplazado?.DNI || pedido.Agente?.DNI || '-';
    const hospitalNombre = pedido.SolicitadoPor?.Hospital?.Nombre || pedido.Personal?.Hospital?.Nombre || pedido.Agente?.Hospital?.Nombre || 'Hospital';
    const servicioObj = pedido.Agente?.Servicio || pedido.Personal?.Servicio || pedido.PersonalReemplazado?.Servicio || pedido.SolicitadoPor?.Servicio;
    const servicioNombre = servicioObj?.Nombre || 'Servicio';

    await logAudit(req, 'REIMPRESION_TICKET', `Reimpresión de ticket para pedido ID ${pedido.Id} - DNI ${agenteDni}`);

    res.json({
      success: true,
      ticket: {
        id: pedido.Id,
        hospital: hospitalNombre,
        fecha: fechaTicket,
        hora: horaTicket,
        horaVencimiento: horaVencimiento,
        validezTexto: 'VALIDEZ: MÁXIMO 20 MINUTOS DESDE SU EMISIÓN',
        avisoCocina: 'COCINA: RETENER Y DESCARTAR ESTE COMPROBANTE (REIMPRESIÓN)',
        turno: `${pedido.TipoComida.toUpperCase()} [REIMPRESIÓN NUTRICIÓN]`,
        agenteNombre: agenteNombre,
        agenteDni: agenteDni,
        servicio: servicioNombre,
        tipoDieta: pedido.TipoDieta || 'Normal',
        pie: 'Reimpresión autorizada por Nutrición'
      }
    });
  } catch (error: any) {
    console.error('Error al generar ticket de reimpresión:', error);
    res.status(500).json({ error: 'Error al generar ticket: ' + (error?.message || String(error)) });
  }
});


// Obtener resumen de entregas (progreso e historial descendente) para un hospital, fecha y tipoComida
app.get('/api/deliveries/summary', authenticateToken, isNutricion, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const { fecha, tipoComida } = req.query;

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;

  const targetFechaStr = fecha && /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? String(fecha) : todayStr;
  const targetDate = new Date(`${targetFechaStr}T00:00:00.000Z`);

  try {
    const whereCondition: any = {
      FechaPedido: targetDate,
      Estado: 'Aprobado',
      SolicitadoPor: { HospitalId: Number(hospitalId) }
    };

    if (tipoComida && (tipoComida === 'Almuerzo' || tipoComida === 'Cena')) {
      whereCondition.TipoComida = String(tipoComida);
    }

    const rawPedidos = await prisma.pedidosComida.findMany({
      where: whereCondition,
      include: {
        Personal: { include: { Servicio: true } },
        PersonalReemplazado: { include: { Servicio: true } },
        SolicitadoPor: { include: { Servicio: true } },
        EntregadoPor: true,
        RetiradoPorAgente: { include: { Servicio: true } }
      },
      orderBy: { Id: 'asc' }
    });

    const enriched = await enrichEmergencyList(rawPedidos);

    const totalApproved = enriched.length;
    const deliveredList = enriched.filter((p: any) => Boolean(p.FechaEntregado));
    const totalDelivered = deliveredList.length;
    const totalPending = totalApproved - totalDelivered;
    const percentage = totalApproved > 0 ? Math.round((totalDelivered / totalApproved) * 100) : 0;

    // Ordenar historial por FechaEntregado DESC (el último entregado siempre primero)
    deliveredList.sort((a: any, b: any) => {
      const timeA = new Date(a.FechaEntregado).getTime();
      const timeB = new Date(b.FechaEntregado).getTime();
      return timeB - timeA;
    });

    const historyFormatted = deliveredList.map((p: any) => {
      const sNombre = p.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || p.PersonalReemplazado?.Servicio?.Nombre || p.SolicitadoPor?.Servicio?.Nombre || 'Servicio General';
      const aNombre = p.EmergenciaNombreCompleto || p.Personal?.NombreCompleto || p.PersonalReemplazado?.NombreCompleto || 'Agente';
      const aDni = p.EmergenciaDNI || p.Personal?.DNI || p.PersonalReemplazado?.DNI || '-';

      return {
        Id: p.Id,
        AgenteNombre: aNombre,
        AgenteDNI: aDni,
        ServicioNombre: sNombre,
        TipoComida: p.TipoComida,
        TipoDieta: p.TipoDieta,
        FechaEntregado: p.FechaEntregado ? new Date(p.FechaEntregado).toISOString() : null,
        EntregadoPor: p.EntregadoPor?.NombreCompleto || p.EntregadoPor?.NombreUsuario || 'Nutrición',
        RetiradoPor: p.RetiradoPorAgente ? {
          NombreCompleto: p.RetiradoPorAgente.NombreCompleto,
          DNI: p.RetiradoPorAgente.DNI,
          Servicio: p.RetiradoPorAgente.Servicio?.Nombre || ''
        } : null
      };
    });

    res.json({
      targetFechaStr,
      tipoComida: tipoComida || 'Todos',
      totalApproved,
      totalDelivered,
      totalPending,
      percentage,
      deliveriesHistory: historyFormatted
    });
  } catch (error: any) {
    console.error('Error al obtener resumen de entregas:', error);
    res.status(500).json({ error: 'Error al procesar el resumen de entregas: ' + (error?.message || String(error)) });
  }
});

// --- GESTIÓN DE USUARIOS ROL NUTRICIÓN POR GERENTE ---
app.get('/api/gerente/nutricion', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  try {
    const usuarios = await prisma.usuarios.findMany({
      where: { HospitalId: hospitalId, RolId: 5 },
      select: {
        Id: true,
        NombreUsuario: true,
        NombreCompleto: true,
        Activo: true,
        DebeCambiarContrasena: true,
        HospitalId: true,
      },
      orderBy: { Id: 'desc' }
    });
    res.json(usuarios);
  } catch (error: any) {
    console.error('Error fetching usuarios nutricion:', error);
    res.status(500).json({ error: 'Error al obtener usuarios de Nutrición' });
  }
});

app.post('/api/gerente/nutricion', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const { username, nombreCompleto, password } = req.body;
  if (!username) {
    res.status(400).json({ error: 'Nombre de usuario requerido' });
    return;
  }

  const rawPassword = password || "123456";

  try {
    const existing = await prisma.usuarios.findUnique({ where: { NombreUsuario: username } });
    if (existing) {
      res.status(400).json({ error: 'El nombre de usuario ya existe' });
      return;
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const nuevoUsuario = await prisma.usuarios.create({
      data: {
        NombreUsuario: username,
        NombreCompleto: nombreCompleto || username,
        ContrasenaHash: hashedPassword,
        RolId: 5, // NUTRICIÓN
        HospitalId: hospitalId,
        Activo: true,
        DebeCambiarContrasena: true
      }
    });

    await logAudit(req, 'CREAR_USUARIO_NUTRICION', `Creado usuario Nutrición: ${username} (Hospital ${hospitalId})`, req.user?.userId);
    res.json({ message: 'Usuario de Nutrición creado exitosamente con clave 123456', userId: nuevoUsuario.Id });
  } catch (error: any) {
    console.error('Error creating usuario nutricion:', error);
    res.status(500).json({ error: 'Error al crear usuario de Nutrición: ' + (error?.message || String(error)) });
  }
});

app.put('/api/gerente/nutricion/:id/toggle', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const targetId = Number(req.params.id);

  try {
    const user = await prisma.usuarios.findFirst({
      where: { Id: targetId, HospitalId: hospitalId, RolId: 5 }
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario de Nutrición no encontrado en su hospital' });
      return;
    }

    const updated = await prisma.usuarios.update({
      where: { Id: targetId },
      data: { Activo: !user.Activo }
    });

    await logAudit(req, 'TOGGLE_ESTADO_NUTRICION', `Usuario ${user.NombreUsuario} ahora ${updated.Activo ? 'ACTIVO' : 'INACTIVO'}`, req.user?.userId);
    res.json({ message: `Estado cambiado a ${updated.Activo ? 'Activo' : 'Inactivo'}`, activo: updated.Activo });
  } catch (error: any) {
    console.error('Error toggling usuario nutricion:', error);
    res.status(500).json({ error: 'Error al cambiar estado' });
  }
});

app.post('/api/gerente/nutricion/:id/reset-password', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const targetId = Number(req.params.id);
  const rawPassword = req.body?.newPassword || "123456";

  try {
    const user = await prisma.usuarios.findFirst({
      where: { Id: targetId, HospitalId: hospitalId, RolId: 5 }
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario de Nutrición no encontrado en su hospital' });
      return;
    }

    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    await prisma.usuarios.update({
      where: { Id: targetId },
      data: { ContrasenaHash: hashedPassword, DebeCambiarContrasena: true }
    });

    await logAudit(req, 'RESET_PASSWORD_NUTRICION', `Contraseña reseteada para ${user.NombreUsuario}`, req.user?.userId);
    res.json({ message: "Contraseña reseteada a '123456'" });
  } catch (error: any) {
    console.error('Error resetting password nutricion:', error);
    res.status(500).json({ error: 'Error al resetear contraseña' });
  }
});

// --- REPORTE GERENCIAL AVANZADO DE RACIONES ENTREGADAS VS SIN ENTREGAR ---
app.get('/api/gerente/reports/entregas-detallado', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const { fechaDesde, fechaHasta, servicioId, tipoComida } = req.query;
  const fDesdeStr = (fechaDesde as string) || new Date().toISOString().split('T')[0];
  const fHastaStr = (fechaHasta as string) || fDesdeStr;

  try {
    const dateStart = new Date(`${fDesdeStr}T00:00:00.000Z`);
    const dateEnd = new Date(`${fHastaStr}T23:59:59.999Z`);

    const whereCondition: any = {
      FechaPedido: { gte: dateStart, lte: dateEnd },
      Estado: 'Aprobado',
      OR: [
        { SolicitadoPor: { HospitalId: Number(hospitalId) } },
        { Personal: { HospitalId: Number(hospitalId) } },
        { PersonalReemplazado: { HospitalId: Number(hospitalId) } }
      ]
    };

    if (tipoComida && tipoComida !== 'Todos') {
      whereCondition.TipoComida = tipoComida as string;
    }

    const pedidos = await prisma.pedidosComida.findMany({
      where: whereCondition,
      include: {
        Personal: { include: { Servicio: true } },
        PersonalReemplazado: { include: { Servicio: true } },
        SolicitadoPor: { include: { Servicio: true } },
        EntregadoPor: true,
        RetiradoPorAgente: { include: { Servicio: true } }
      },
      orderBy: { FechaPedido: 'desc' }
    });

    // Identificar agentes titulares que fueron reemplazados por una emergencia para no duplicar raciones
    const replacedMap = new Set<string>();
    pedidos.forEach((r: any) => {
      if (r.EmergenciaReemplazaId || r.PersonalReemplazado) {
        const pId = r.EmergenciaReemplazaId || r.PersonalReemplazado?.Id;
        const pDni = r.PersonalReemplazado?.DNI;
        const fStr = r.FechaPedido ? new Date(r.FechaPedido).toISOString().split('T')[0] : '';
        const tcStr = (r.TipoComida || '').toLowerCase();
        if (pId) replacedMap.add(`ID_${pId}_${fStr}_${tcStr}`);
        if (pDni) replacedMap.add(`DNI_${pDni}_${fStr}_${tcStr}`);
      }
    });

    let filteredPedidos = pedidos.filter((r: any) => {
      if (r.Personal && !r.EmergenciaDNI) {
        const p = r.Personal;
        const fStr = r.FechaPedido ? new Date(r.FechaPedido).toISOString().split('T')[0] : '';
        const tcStr = (r.TipoComida || '').toLowerCase();
        if (replacedMap.has(`ID_${p.Id}_${fStr}_${tcStr}`) || replacedMap.has(`DNI_${p.DNI}_${fStr}_${tcStr}`)) {
          return false;
        }
      }
      return true;
    });

    if (servicioId && servicioId !== 'Todos') {
      const sIdNum = Number(servicioId);
      filteredPedidos = filteredPedidos.filter((p: any) =>
        p.Personal?.ServicioId === sIdNum ||
        p.PersonalReemplazado?.ServicioId === sIdNum ||
        p.SolicitadoPor?.ServicioId === sIdNum
      );
    }

    let entregadosCount = 0;
    let sinEntregarCount = 0;
    let almuerzoSolicitadas = 0;
    let almuerzoEntregadas = 0;
    let almuerzoSinEntregar = 0;
    let cenaSolicitadas = 0;
    let cenaEntregadas = 0;
    let cenaSinEntregar = 0;

    const listadoEntregados: any[] = [];
    const listadoSinEntregar: any[] = [];

    filteredPedidos.forEach((p: any) => {
      const sNombre = p.Servicio?.Nombre || p.Personal?.Servicio?.Nombre || p.PersonalReemplazado?.Servicio?.Nombre || p.SolicitadoPor?.Servicio?.Nombre || 'Servicio General';
      const aNombre = p.EmergenciaNombreCompleto || p.Personal?.NombreCompleto || p.PersonalReemplazado?.NombreCompleto || 'Agente';
      const aDni = p.EmergenciaDNI || p.Personal?.DNI || p.PersonalReemplazado?.DNI || '-';
      const fPedidoStr = new Date(p.FechaPedido).toISOString().split('T')[0];
      const isAlmuerzo = (p.TipoComida || '').toLowerCase() === 'almuerzo';
      const isCena = (p.TipoComida || '').toLowerCase() === 'cena';

      if (isAlmuerzo) almuerzoSolicitadas++;
      if (isCena) cenaSolicitadas++;

      const itemData = {
        Id: p.Id,
        FechaPedido: fPedidoStr,
        AgenteNombre: aNombre,
        AgenteDNI: aDni,
        ServicioNombre: sNombre,
        TipoComida: p.TipoComida,
        TipoDieta: p.TipoDieta,
        EsExcepcional: p.EsExcepcional,
        Justificacion: p.JustificacionSolicitud || '-'
      };

      if (p.FechaEntregado) {
        entregadosCount++;
        if (isAlmuerzo) almuerzoEntregadas++;
        if (isCena) cenaEntregadas++;
        listadoEntregados.push({
          ...itemData,
          FechaEntregado: new Date(p.FechaEntregado).toISOString(),
          EntregadoPor: p.EntregadoPor?.NombreCompleto || p.EntregadoPor?.NombreUsuario || 'Nutrición',
          RetiradoPor: p.RetiradoPorAgente ? {
            NombreCompleto: p.RetiradoPorAgente.NombreCompleto,
            DNI: p.RetiradoPorAgente.DNI,
            Servicio: p.RetiradoPorAgente.Servicio?.Nombre || ''
          } : null
        });
      } else {
        sinEntregarCount++;
        if (isAlmuerzo) almuerzoSinEntregar++;
        if (isCena) cenaSinEntregar++;
        listadoSinEntregar.push({
          ...itemData,
          EstadoEntrega: 'Sin Entregar / No Reclamada'
        });
      }
    });

    const totalPedidos = filteredPedidos.length;
    const porcentajeCumplimiento = totalPedidos > 0 ? Math.round((entregadosCount / totalPedidos) * 100) : 0;
    const porcentajeAusentismo = totalPedidos > 0 ? Math.round((sinEntregarCount / totalPedidos) * 100) : 0;

    const pctEntregadoAlmuerzo = almuerzoSolicitadas > 0 ? Math.round((almuerzoEntregadas / almuerzoSolicitadas) * 100) : 0;
    const pctSinEntregarAlmuerzo = almuerzoSolicitadas > 0 ? Math.round((almuerzoSinEntregar / almuerzoSolicitadas) * 100) : 0;
    const pctShareAlmuerzo = totalPedidos > 0 ? Math.round((almuerzoSolicitadas / totalPedidos) * 100) : 0;

    const pctEntregadoCena = cenaSolicitadas > 0 ? Math.round((cenaEntregadas / cenaSolicitadas) * 100) : 0;
    const pctSinEntregarCena = cenaSolicitadas > 0 ? Math.round((cenaSinEntregar / cenaSolicitadas) * 100) : 0;
    const pctShareCena = totalPedidos > 0 ? Math.round((cenaSolicitadas / totalPedidos) * 100) : 0;

    res.json({
      rangoFechas: { desde: fDesdeStr, hasta: fHastaStr },
      totalPedidos,
      entregadosCount,
      sinEntregarCount,
      porcentajeCumplimiento,
      porcentajeAusentismo,
      totales: {
        solicitadas: totalPedidos,
        entregadas: entregadosCount,
        sinEntregar: sinEntregarCount,
        pctEntregado: porcentajeCumplimiento,
        pctSinEntregar: porcentajeAusentismo,
        almuerzo: {
          solicitadas: almuerzoSolicitadas,
          entregadas: almuerzoEntregadas,
          sinEntregar: almuerzoSinEntregar,
          pctEntregado: pctEntregadoAlmuerzo,
          pctSinEntregar: pctSinEntregarAlmuerzo,
          pctDelTotal: pctShareAlmuerzo
        },
        cena: {
          solicitadas: cenaSolicitadas,
          entregadas: cenaEntregadas,
          sinEntregar: cenaSinEntregar,
          pctEntregado: pctEntregadoCena,
          pctSinEntregar: pctSinEntregarCena,
          pctDelTotal: pctShareCena
        }
      },
      listadoEntregados,
      listadoSinEntregar
    });
  } catch (error: any) {
    console.error('Error generating gerente delivery report:', error);
    res.status(500).json({ error: 'Error al generar el reporte de entregas: ' + (error?.message || String(error)) });
  }
});

async function ensureRoles() {
  try {
    const rolesToUpsert = [
      { Id: 1, Nombre: 'Admin' },
      { Id: 2, Nombre: 'Gerente' },
      { Id: 3, Nombre: 'Jefe' },
      { Id: 4, Nombre: 'RRHH' },
      { Id: 5, Nombre: 'Nutricion' },
      { Id: 6, Nombre: 'Totem' }
    ];
    for (const r of rolesToUpsert) {
      await prisma.roles.upsert({
        where: { Id: r.Id },
        update: { Nombre: r.Nombre },
        create: { Id: r.Id, Nombre: r.Nombre }
      });
    }
    console.log('✅ Roles en base de datos verificados correctamente.');
  } catch (e) {
    console.error('⚠️ Error al verificar roles en base de datos:', e);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await ensureRoles();
  console.log(`Server running on port ${PORT}`);
});
