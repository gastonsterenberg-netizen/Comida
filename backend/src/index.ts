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
import { authenticateToken, isGerente, isJefeServicio } from './middleware/auth';
import { logAudit } from './utils/audit';
import { extractDniFromScan } from './utils/scan';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
      res.status(401).json({ error: 'Credenciales inválidas' });
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
      res.status(401).json({ error: 'Credenciales inválidas' });
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

// 3.1.b Obtener Servicios
app.get('/api/services', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'No tienes un hospital asignado' });
    return;
  }

  try {
    const services = await prisma.servicios.findMany({
      where: { HospitalId: hospitalId },
      include: {
        _count: {
          select: { Personal: true }
        },
        Personal: {
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

// 3.1.c Alternar tipo de voucher (Consolidado/Individual)
app.put('/api/services/:id/toggle-voucher', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  const hospitalId = req.user?.hospitalId;

  if (!id || !hospitalId) {
    res.status(400).json({ error: 'ID de servicio y hospital requerido' });
    return;
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

    const updatedAgente = await prisma.personal.update({
      where: { Id: id },
      data: { ServicioId: Number(servicioId) },
      include: { Servicio: true }
    });

    await logAudit(
      req, 
      'CAMBIO_SERVICIO_AGENTE', 
      `Agente '${agente.NombreCompleto}' (DNI ${agente.DNI}) cambiado del servicio '${oldServiceNombre}' al servicio '${targetService.Nombre}'`
    );

    res.json({ message: 'Servicio del agente actualizado exitosamente', agente: updatedAgente });
  } catch (error) {
    console.error('Error al cambiar servicio del agente:', error);
    res.status(500).json({ error: 'Error al cambiar servicio del agente' });
  }
});

// --- ENDPOINTS DE HABILITACIÓN DE CARGA ANTICIPADA (SÁBADOS, DOMINGOS Y FERIADOS) ---

// Obtener fechas anticipadas habilitadas activas para el hospital del usuario
app.get('/api/advance-dates', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hId = req.user?.hospitalId;
  if (!hId) {
    res.status(400).json({ error: 'Usuario sin hospital asignado' });
    return;
  }
  const hospitalId = Number(hId);

  try {
    const dates = await prisma.fechasAnticipadasHabilitadas.findMany({
      where: { HospitalId: hospitalId, Activo: true },
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
            where: { DNI: strDni },
            update: {
               IdPersonal: String(idPersonal || ''),
               NombreCompleto: (String(apellido) + ' ' + String(nombre)).trim(),
               HospitalId: userHospitalId,
               ServicioId: userServicioId,
               Horario: horario,
               PeriodoInicio: parseCSVDate(periodoInicio),
               PeriodoFin: parseCSVDate(periodoFin),
               Activo: true
            },
            create: {
               DNI: strDni,
               IdPersonal: String(idPersonal || ''),
               NombreCompleto: (String(apellido) + ' ' + String(nombre)).trim(),
               HospitalId: userHospitalId,
               ServicioId: userServicioId,
               Horario: horario,
               PeriodoInicio: parseCSVDate(periodoInicio),
               PeriodoFin: parseCSVDate(periodoFin),
               Activo: true
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
  
  if (tipoComida === 'Almuerzo' || tipoComida === 'Ambos') {
    const limitAlm = config.LimiteAlmuerzo || '09:00';
    const [limitH, limitM] = limitAlm.split(':').map(Number);
    if (currentTotalMins >= limitH * 60 + limitM) return `El horario límite para pedidos de Almuerzo (${limitAlm}) ha expirado.`;
  }
  if (tipoComida === 'Cena' || tipoComida === 'Ambos') {
    const limitCen = config.LimiteCena || '17:00';
    const [limitH, limitM] = limitCen.split(':').map(Number);
    if (currentTotalMins >= limitH * 60 + limitM) return `El horario límite para pedidos de Cena (${limitCen}) ha expirado.`;
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
    let padron = await prisma.padronHabilitados.findMany({
      where: { HospitalId: hospitalId },
      include: { Servicio: true },
      orderBy: { NombreCompleto: 'asc' }
    });

    if (padron.length === 0) {
      const staffPersonal = await prisma.personal.findMany({
        where: { HospitalId: hospitalId },
        include: { Servicio: true },
        orderBy: { NombreCompleto: 'asc' }
      });
      padron = staffPersonal.map(p => ({
        Id: p.Id,
        DNI: p.DNI,
        NombreCompleto: p.NombreCompleto,
        EsGuardia24h: p.EsGuardia24,
        Activo: p.Activo,
        FechaCreacion: p.PeriodoInicio,
        HospitalId: p.HospitalId,
        ServicioId: p.ServicioId,
        Hospital: null as any,
        Servicio: p.Servicio
      }));
    }

    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const activeStaff = await prisma.personal.findMany({
      where: { HospitalId: hospitalId, Activo: true, PeriodoFin: { gte: today } }
    });

    const padronWithStatus = padron.map(p => {
       const assignments = activeStaff.filter(s => s.DNI === p.DNI);
       const has24h = assignments.some(a => a.Horario.includes('24h'));
       const count12h = assignments.filter(a => a.Horario.includes('12h')).length;
       return { ...p, has24h, count12h };
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
      const is24h = p.Horario && (p.Horario.toLowerCase().includes("24") || p.Horario.toLowerCase().includes("y cena"));
      
      await prisma.padronHabilitados.updateMany({
        where: { DNI: p.DNI },
        data: { 
          EsGuardia24h: Boolean(is24h), 
          Activo: true,
          HospitalId: hospitalId,
          ServicioId: servicioId
        }
      });

      await prisma.personal.upsert({
        where: { DNI: p.DNI },
        update: {
          NombreCompleto: p.NombreCompleto,
          HospitalId: hospitalId,
          ServicioId: servicioId,
          Horario: p.Horario,
          PeriodoInicio: inicioValido,
          PeriodoFin: finValido,
          Activo: true,
          BajaProvisoriaFecha: null,
          BajaProvisoriaHasta: null,
          BajaMotivo: null
        },
        create: {
          DNI: p.DNI,
          NombreCompleto: p.NombreCompleto,
          HospitalId: hospitalId,
          ServicioId: servicioId,
          Horario: p.Horario,
          PeriodoInicio: inicioValido,
          PeriodoFin: finValido,
          Activo: true
        }
      });
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
        ServicioId: servicioId
      },
      include: {
        PedidosComida: {
          where: { FechaPedido: targetDate }
        }
      },
      orderBy: { NombreCompleto: 'asc' }
    });

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

      return { 
        ...s,
        bajaProvisoriaHoy: isBajaEnFecha,
        bajaDefinitivaHoy: !s.Activo,
        bajaMotivo: s.BajaMotivo || null,
        esInhabilitadoParaReemplazo: esInhabilitado
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
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    if (tipo === 'PROVISORIA') {
      const { desde, hasta, motivo } = req.body;
      const startDate = desde ? new Date(`${desde}T00:00:00.000Z`) : today;
      const endDate = hasta ? new Date(`${hasta}T23:59:59.999Z`) : new Date(`${startDate.toISOString().split('T')[0]}T23:59:59.999Z`);
      const bajaMotivo = motivo || null;
      // @ts-ignore
      await prisma.personal.update({ where: { Id: Number(id) }, data: { BajaProvisoriaFecha: startDate, BajaProvisoriaHasta: endDate, BajaMotivo: bajaMotivo } });
      
      // Borrar pedidos que caigan en ese rango de inhabilitación
      await prisma.pedidosComida.deleteMany({
        where: {
          PersonalId: Number(id),
          FechaPedido: {
            gte: startDate,
            lte: endDate
          }
        }
      });
      
      await logAudit(req, 'BAJA_PROVISIONAL', `Baja provisoria aplicada al agente ID: ${id}`);
    } else if (tipo === 'DEFINITIVA') {
      // @ts-ignore
      await prisma.personal.update({ where: { Id: Number(id) }, data: { Activo: false, PeriodoFin: today, BajaMotivo: req.body.motivo || null } });
      await logAudit(req, 'BAJA_DEFINITIVA', `Baja definitiva aplicada al agente ID: ${id}`);
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

    // Verificar si el agente titular posee un reemplazo activo (Pendiente o Aprobado) para hoy o fechas futuras
    const reemplazoActivo = await prisma.pedidosComida.findFirst({
      where: {
        EmergenciaReemplazaId: personalId,
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
    const padron = await prisma.padronHabilitados.findUnique({ where: { DNI: personal.DNI } });
    if (!padron || !padron.Activo) {
      res.status(403).json({ error: 'El agente no se encuentra en el padrón de habilitados para recibir comida.' });
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
      // Validar límite si no es 24h
      if (!padron.EsGuardia24h) {
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

  // Si la fecha solicitada es HOY, se evaluan los limites de horario habituales
  if (targetFechaStr === todayStr) {
    const tc = tipoComida || 'Ambos';
    const errorMsg = await checkDeadlines(solicitadoPorUsuarioId, tc);
    if (errorMsg) {
      res.status(400).json({ error: errorMsg });
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

    // Borramos los pedidos de la fecha objetivo para el personal especificado y tipoComida (si aplica)
    const personalIds = orders.map((o: any) => o.personalId);
    await prisma.pedidosComida.deleteMany({
      where: {
        FechaPedido: targetDate,
        PersonalId: { in: personalIds },
        ...(tipoComida ? { TipoComida: tipoComida } : {})
      }
    });

    // Creamos los nuevos pedidos para targetDate
    const newOrders = [];
    for (const o of orders) {
      const isAlmuerzo = tipoComida ? tipoComida === 'Almuerzo' : true;
      const isCena = tipoComida ? tipoComida === 'Cena' : true;
      
      const mealsRequested = (isAlmuerzo && o.almuerzoDieta ? 1 : 0) + (isCena && o.cenaDieta ? 1 : 0);
      if (mealsRequested === 0) continue;

      const personal = await prisma.personal.findUnique({ where: { Id: o.personalId } });
      if (!personal) continue;
      
      if (!personal.Horario.includes('24h')) {
        if (mealsRequested > 1) {
          throw new Error(`El agente ${personal.NombreCompleto} (Guardia 12h) solo puede solicitar 1 comida por día.`);
        }
        if (isAlmuerzo && o.almuerzoDieta) {
          const cenaExistentePlanilla = await prisma.pedidosComida.findFirst({
            where: {
              FechaPedido: targetDate,
              TipoComida: 'Cena',
              Estado: { in: ['Pendiente', 'Aprobado'] },
              Personal: { DNI: personal.DNI },
              OR: [
                { EmergenciaDNI: null },
                { EmergenciaDNI: '' }
              ]
            },
            include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
          });
          if (cenaExistentePlanilla) {
            const cenaServicioId = cenaExistentePlanilla.SolicitadoPor?.ServicioId || cenaExistentePlanilla.Personal?.ServicioId;
            if (solicitanteServicioId && cenaServicioId === solicitanteServicioId) {
              // El mismo servicio esta cambiando de Cena a Almuerzo: borramos la Cena anterior de la planilla
              await prisma.pedidosComida.delete({ where: { Id: cenaExistentePlanilla.Id } });
            } else {
              const sNombre = cenaExistentePlanilla.SolicitadoPor?.Servicio?.Nombre || cenaExistentePlanilla.Personal?.Servicio?.Nombre || 'otro servicio';
              throw new Error(`El agente ${personal.NombreCompleto} (Guardia 12h) ya tiene registrada una Cena para esa fecha en la planilla del servicio "${sNombre}".`);
            }
          }
        }
        if (isCena && o.cenaDieta) {
          const almuerzoExistentePlanilla = await prisma.pedidosComida.findFirst({
            where: {
              FechaPedido: targetDate,
              TipoComida: 'Almuerzo',
              Estado: { in: ['Pendiente', 'Aprobado'] },
              Personal: { DNI: personal.DNI },
              OR: [
                { EmergenciaDNI: null },
                { EmergenciaDNI: '' }
              ]
            },
            include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
          });
          if (almuerzoExistentePlanilla) {
            const almuerzoServicioId = almuerzoExistentePlanilla.SolicitadoPor?.ServicioId || almuerzoExistentePlanilla.Personal?.ServicioId;
            if (solicitanteServicioId && almuerzoServicioId === solicitanteServicioId) {
              // El mismo servicio esta cambiando de Almuerzo a Cena: borramos el Almuerzo anterior de la planilla
              await prisma.pedidosComida.delete({ where: { Id: almuerzoExistentePlanilla.Id } });
            } else {
              const sNombre = almuerzoExistentePlanilla.SolicitadoPor?.Servicio?.Nombre || almuerzoExistentePlanilla.Personal?.Servicio?.Nombre || 'otro servicio';
              throw new Error(`El agente ${personal.NombreCompleto} (Guardia 12h) ya tiene registrado un Almuerzo para esa fecha en la planilla del servicio "${sNombre}".`);
            }
          }
        }
      }

      if (isAlmuerzo && o.almuerzoDieta) {
        const almuerzoExistente = await prisma.pedidosComida.findFirst({
          where: {
            FechaPedido: targetDate,
            TipoComida: 'Almuerzo',
            Estado: { in: ['Pendiente', 'Aprobado'] },
            OR: [
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
          SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
          Estado: 'Aprobado'
        });
      }
      if (isCena && o.cenaDieta) {
        const cenaExistente = await prisma.pedidosComida.findFirst({
          where: {
            FechaPedido: targetDate,
            TipoComida: 'Cena',
            Estado: { in: ['Pendiente', 'Aprobado'] },
            OR: [
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
          SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
          Estado: 'Aprobado'
        });
      }
    }

    if (newOrders.length > 0) {
      await prisma.pedidosComida.createMany({ data: newOrders });
    }

    res.json({ message: 'Pedidos guardados exitosamente' });
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
    let name = p.EmergenciaNombreCompleto;
    if ((!name || name.trim() === '') && p.Personal?.NombreCompleto) {
      name = p.Personal.NombreCompleto;
    }
    if ((!name || name.trim() === '') && p.EmergenciaDNI) {
      name = padronMap.get(p.EmergenciaDNI) || personalMap.get(p.EmergenciaDNI) || '';
    }
    if ((!name || name.trim() === '') && p.PersonalReemplazado?.NombreCompleto) {
      name = p.PersonalReemplazado.NombreCompleto;
    }

    let dni = p.EmergenciaDNI;
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
      include: { PersonalReemplazado: true, Personal: true, EvaluadoPor: true, SolicitadoPor: true }
    });

    const enriched = await enrichEmergencyList(history);
    let finalHistory = enriched;
    if (requestingUser?.ServicioId) {
      const jefeServicioObj = await prisma.servicios.findUnique({ where: { Id: requestingUser.ServicioId } });
      if (jefeServicioObj?.Nombre) {
        const jNombre = jefeServicioObj.Nombre.trim().toLowerCase();
        finalHistory = enriched.filter((e: any) => {
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
      const currentTotalMins = now.getHours() * 60 + now.getMinutes();

      if (pedido.TipoComida === 'Almuerzo' || pedido.TipoComida === 'Ambos') {
        const limitAuthAlm = hospital.LimiteAutorizacionAlmuerzo || '11:00';
        const [h, m] = limitAuthAlm.split(':').map(Number);
        if (currentTotalMins >= h * 60 + m) {
          res.status(400).json({ error: `La hora límite para autorizar o modificar emergencias de Almuerzo (${limitAuthAlm}) ha expirado.` });
          return;
        }
      }

      if (pedido.TipoComida === 'Cena' || pedido.TipoComida === 'Ambos') {
        const limitAuthCen = hospital.LimiteAutorizacionCena || '18:00';
        const [h, m] = limitAuthCen.split(':').map(Number);
        if (currentTotalMins >= h * 60 + m) {
          res.status(400).json({ error: `La hora límite para autorizar o modificar emergencias de Cena (${limitAuthCen}) ha expirado.` });
          return;
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
    await logAudit(req, isPending ? 'REVERTIR_EMERGENCIA' : 'AUTORIZACION_EMERGENCIA', `Solicitud de emergencia ID ${id} - ${estado}`);
    res.json({ message: isPending ? 'Solicitud devuelta a estado pendiente exitosamente.' : `Solicitud ${estado.toLowerCase()} exitosamente.` });
  } catch (error) {
    res.status(500).json({ error: 'Error al resolver la solicitud' });
  }
});

// 5.5 Eliminar solicitud de emergencia pendiente
app.delete('/api/emergencies/:id', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const pedido = await prisma.pedidosComida.findUnique({
      where: { Id: Number(id) }
    });

    if (!pedido) {
      res.status(404).json({ error: 'Solicitud de emergencia no encontrada.' });
      return;
    }

    if (pedido.Estado !== 'Pendiente') {
      res.status(400).json({ error: 'Solo se pueden eliminar solicitudes de emergencia en estado Pendiente.' });
      return;
    }

    await prisma.pedidosComida.delete({
      where: { Id: Number(id) }
    });

    await logAudit(req, 'ELIMINAR_EMERGENCIA', `Solicitud de emergencia ID ${id} eliminada`);
    res.json({ message: 'Solicitud de emergencia eliminada exitosamente.' });
  } catch (error) {
    console.error('Error deleting emergency:', error);
    res.status(500).json({ error: 'Error al eliminar la solicitud de emergencia.' });
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

        whereClause.OR = [
          { SolicitadoPor: { ServicioId: user.servicioId } },
          { Personal: { ServicioId: user.servicioId } },
          { PersonalReemplazado: { ServicioId: user.servicioId } },
          ...(jefeServicioNombre ? [{ JustificacionSolicitud: { contains: `[SERVICIO:${jefeServicioNombre}]` } }] : [])
        ];
      } else {
        whereClause.SolicitadoPorUsuarioId = user.userId;
      }
    } else if (user?.roleId === 2) {
      // GERENTE: solo ver su hospital
      whereClause.SolicitadoPor = {
        HospitalId: user.hospitalId
      };
    }

    if (personalId) {
      whereClause.PersonalId = Number(personalId);
    }

    const report = await prisma.pedidosComida.findMany({
      where: whereClause,
      include: {
        Personal: { include: { Servicio: true, Hospital: true } },
        PersonalReemplazado: { include: { Servicio: true, Hospital: true } },
        SolicitadoPor: { include: { Servicio: true, Hospital: true } }
      }
    });
    
    // Filtrado manual simple
    let filteredReport = report;
    if (user?.roleId !== 2 && hospitalId) {
      filteredReport = filteredReport.filter(r => 
        r.Personal?.HospitalId === Number(hospitalId) || r.SolicitadoPor?.HospitalId === Number(hospitalId)
      );
    }
    if (user?.roleId !== 3 && servicioId) {
      filteredReport = filteredReport.filter(r => 
        r.Personal?.ServicioId === Number(servicioId) || r.SolicitadoPor?.ServicioId === Number(servicioId)
      );
    }

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
                   (r.EmergenciaDNI ? padronMap.get(r.EmergenciaDNI) : null) || 
                   null;
      }
      return {
        ...r,
        Servicio: servicio
      };
    });

    // Si es JEFE_SERVICIO, filtrar estrictamente para que el servicio efectivo coincida con su servicio
    let resultReport = finalReport;
    if (user?.roleId === 3 && jefeServicioNombre) {
      resultReport = finalReport.filter(r => {
        const itemServicioNombre = r.Servicio?.Nombre ? r.Servicio.Nombre.trim().toLowerCase() : '';
        return itemServicioNombre === jefeServicioNombre.trim().toLowerCase();
      });
    }

    res.json(resultReport);
  } catch (error) {
    res.status(500).json({ error: 'Error al generar el reporte' });
  }
});

// --- RRHH / ADMIN ENDPOINTS ---

app.post('/api/hospitals', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) {
    res.status(403).json({ error: 'No autorizado. Solo RRHH/Admin.' });
    return;
  }
  const { nombre, codigo } = req.body;
  try {
    const hospital = await prisma.hospitales.create({
      data: { Nombre: nombre, Codigo: codigo || nombre.substring(0,5).toUpperCase() }
    });
    res.json({ message: 'Hospital creado', hospital });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear hospital' });
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
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Error al obtener registros de auditoría' });
  }
});
// 8. Configuración de Horarios
app.get('/api/hospital/config', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.json({
      LimiteAlmuerzo: '10:00',
      LimiteCena: '17:00',
      LimiteAutorizacionAlmuerzo: '11:00',
      LimiteAutorizacionCena: '18:00',
      DietasHabilitadas: 'Normal,Gástrica,Diabética,Hepática,Vegetariano,Celíaca'
    });
    return;
  }
  
  try {
    const hospital = await prisma.hospitales.findUnique({
      where: { Id: hospitalId },
      select: { 
        LimiteAlmuerzo: true, 
        LimiteCena: true, 
        LimiteAutorizacionAlmuerzo: true,
        LimiteAutorizacionCena: true,
        DietasHabilitadas: true 
      }
    });
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

app.put('/api/hospital/config', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const { limiteAlmuerzo, limiteCena, limiteAutorizacionAlmuerzo, limiteAutorizacionCena, dietasHabilitadas } = req.body;
  
  if (!hospitalId) {
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
  
  try {
    const updated = await prisma.hospitales.update({
      where: { Id: hospitalId },
      data: { 
        ...(limiteAlmuerzo ? { LimiteAlmuerzo: limiteAlmuerzo } : {}),
        ...(limiteCena ? { LimiteCena: limiteCena } : {}),
        ...(limiteAutorizacionAlmuerzo ? { LimiteAutorizacionAlmuerzo: limiteAutorizacionAlmuerzo } : {}),
        ...(limiteAutorizacionCena ? { LimiteAutorizacionCena: limiteAutorizacionCena } : {}),
        ...(dietasHabilitadas !== undefined ? { DietasHabilitadas: dietasHabilitadas } : {})
      }
    });
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
        missingServices.add(`"${servicioStr}" (Efector: "${hospital ? hospital.Nombre : efectorStr}")`);
      }
    }

    if (missingHospitals.size > 0) {
      const hList = Array.from(missingHospitals).join(', ');
      res.status(400).json({
        error: `No se realizó la importación. Los siguientes establecimientos/hospitales no existen en el sistema: ${hList}. Por favor verifique el archivo o cree el establecimiento antes de volver a importar.`
      });
      return;
    }

    if (missingServices.size > 0) {
      const sList = Array.from(missingServices).join(', ');
      res.status(400).json({
        error: `No se realizó la importación. Los siguientes servicios no existen en el sistema: ${sList}. Por favor corrija el nombre del servicio en el archivo o cree el servicio correspondiente en SISAR antes de volver a importar.`
      });
      return;
    }

    // PASO 2: Procesar la importación masiva sabiendo que todos los servicios existen
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
        skippedCount++;
        details.push({
          rowNumber: rowIndex,
          type: 'OMITIDO',
          reason: `Servicio '${servicioStr}' no encontrado`
        });
        continue;
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

      const isGuardia24 = isTruthy(getRowVal(row, 'esguardia24', 'esguardia24h', 'guardia24', 'guardia24h', 'g24'));
      const isGuardia12 = isTruthy(getRowVal(row, 'esguardia12', 'esguardia12h', 'guardia12', 'guardia12h', 'g12'));
      const conVianda = isTruthy(getRowVal(row, 'con_vianda', 'convianda', 'vianda'));

      const existingAgente = await prisma.personal.findUnique({
        where: { DNI: dniStr },
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

      await prisma.personal.upsert({
        where: { DNI: dniStr },
        update: {
          NombreCompleto: nombreCompleto,
          HospitalId: hospital.Id,
          ServicioId: servicio.Id,
          IdPuesto: String(getRowVal(row, 'idpuesto', 'puesto') || ''),
          TipoFuncion: String(getRowVal(row, 'tipofuncion', 'funcion') || ''),
          TipoPlanta: String(getRowVal(row, 'tipoplanta', 'planta') || ''),
          ConVianda: conVianda,
          EsGuardia12: isGuardia12,
          EsGuardia24: isGuardia24,
        },
        create: {
          DNI: dniStr,
          NombreCompleto: nombreCompleto,
          HospitalId: hospital.Id,
          ServicioId: servicio.Id,
          IdPersonal: String(getRowVal(row, 'idagente', 'idpersonal') || ''),
          Horario: isGuardia24 ? 'Guardia 24h (Almuerzo y Cena)' : '08:00 a 16:00',
          PeriodoInicio: new Date(2020, 0, 1),
          PeriodoFin: new Date(2035, 11, 31),
          IdPuesto: String(getRowVal(row, 'idpuesto', 'puesto') || ''),
          TipoFuncion: String(getRowVal(row, 'tipofuncion', 'funcion') || ''),
          TipoPlanta: String(getRowVal(row, 'tipoplanta', 'planta') || ''),
          ConVianda: conVianda,
          EsGuardia12: isGuardia12,
          EsGuardia24: isGuardia24,
        }
      });

      await prisma.padronHabilitados.upsert({
        where: { DNI: dniStr },
        update: {
          NombreCompleto: nombreCompleto,
          HospitalId: hospital.Id,
          ServicioId: servicio.Id,
          EsGuardia24h: isGuardia24,
          Activo: conVianda
        },
        create: {
          DNI: dniStr,
          NombreCompleto: nombreCompleto,
          HospitalId: hospital.Id,
          ServicioId: servicio.Id,
          EsGuardia24h: isGuardia24,
          Activo: conVianda
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

// 6. ENTREGAS DE VIANDAS MEDIANTE ESCANEO DNI / QR
app.get('/api/deliveries/scan-check', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const { code, fecha, tipoComida } = req.query;

  if (!hospitalId) {
    res.status(403).json({ error: 'Usuario sin hospital asignado' });
    return;
  }

  const rawCode = String(code || '').trim();
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

    if (rawCode.startsWith('SERVICE_ORDER:')) {
      const parts = rawCode.split(':');
      if (parts[1]) serviceId = Number(parts[1]);
      isConsolidado = true;
    } else {
      searchedDni = extractDniFromScan(rawCode);
    }

    let agenteMain: any = null;
    if (searchedDni) {
      agenteMain = await prisma.personal.findFirst({
        where: { DNI: searchedDni, HospitalId: Number(hospitalId) },
        include: { Servicio: true }
      });
      if (!agenteMain) {
        agenteMain = await prisma.padronHabilitados.findFirst({
          where: { DNI: searchedDni, HospitalId: Number(hospitalId) },
          include: { Servicio: true }
        });
      }
    }

    // Si el servicio del agente escaneado utiliza Voucher Consolidado (VoucherIndividual === false)
    if (agenteMain?.ServicioId && agenteMain?.Servicio?.VoucherIndividual === false) {
      serviceId = agenteMain.ServicioId;
      isConsolidado = true;
    }

    let servicioObj: any = null;
    if (serviceId) {
      servicioObj = await prisma.servicios.findUnique({ where: { Id: Number(serviceId) } });
    }

    let rawPedidos: any[] = [];

    if (isConsolidado && serviceId) {
      // Para Voucher Consolidado: Cargar TODOS los pedidos aprobados de ese servicio para el efector y fecha
      rawPedidos = await prisma.pedidosComida.findMany({
        where: {
          FechaPedido: targetDate,
          Estado: 'Aprobado',
          OR: [
            { Personal: { ServicioId: Number(serviceId) } },
            { PersonalReemplazado: { ServicioId: Number(serviceId) } },
            { SolicitadoPor: { ServicioId: Number(serviceId) } },
            { JustificacionSolicitud: { contains: `[SERVICIO:` } }
          ]
        },
        include: {
          Personal: { include: { Servicio: true } },
          PersonalReemplazado: { include: { Servicio: true } },
          SolicitadoPor: { include: { Servicio: true } },
          EntregadoPor: true
        },
        orderBy: { Id: 'asc' }
      });

      if (servicioObj) {
        rawPedidos = rawPedidos.filter(p => {
          const sNombre = p.Personal?.Servicio?.Nombre || p.PersonalReemplazado?.Servicio?.Nombre || p.SolicitadoPor?.Servicio?.Nombre;
          if (sNombre && sNombre === servicioObj.Nombre) return true;
          if (p.JustificacionSolicitud && p.JustificacionSolicitud.includes(`[SERVICIO:${servicioObj.Nombre}]`)) return true;
          return p.Personal?.ServicioId === serviceId || p.PersonalReemplazado?.ServicioId === serviceId;
        });
      }
    } else if (searchedDni) {
      // Para Voucher Individual: Cargar el pedido directo del DNI escaneado
      rawPedidos = await prisma.pedidosComida.findMany({
        where: {
          FechaPedido: targetDate,
          Estado: 'Aprobado',
          OR: [
            { Personal: { DNI: searchedDni } },
            { EmergenciaDNI: searchedDni },
            { PersonalReemplazado: { DNI: searchedDni } }
          ]
        },
        include: {
          Personal: { include: { Servicio: true } },
          PersonalReemplazado: { include: { Servicio: true } },
          SolicitadoPor: { include: { Servicio: true } },
          EntregadoPor: true
        }
      });
    }

    let enrichedPedidos = await enrichEmergencyList(rawPedidos);
    if (tipoComida) {
      enrichedPedidos = enrichedPedidos.filter((p: any) => p.TipoComida === String(tipoComida));
    }

    if (!servicioObj) {
      const s = agenteMain?.Servicio || (rawPedidos[0]?.Personal?.Servicio) || (rawPedidos[0]?.SolicitadoPor?.Servicio);
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

app.post('/api/deliveries/confirm-delivery', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const { pedidoIds } = req.body;
  const userId = req.user?.userId || (req.user as any)?.id;

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

    await prisma.pedidosComida.updateMany({
      where: { Id: { in: ids } },
      data: {
        FechaEntregado: new Date(),
        EntregadoPorUsuarioId: Number(userId)
      }
    });

    await logAudit(req, 'ENTREGA_RACIONES_DNI_QR', `Entregadas ${ids.length} raciones mediante escaneo de DNI/QR`);
    res.json({ message: `Se registraron exitosamente ${ids.length} entrega(s) de raciones.` });
  } catch (error: any) {
    console.error('Error al confirmar entrega:', error);
    res.status(500).json({ error: 'Error al registrar entrega: ' + (error?.message || String(error)) });
  }
});

// Obtener resumen de entregas (progreso e historial descendente) para un hospital, fecha y tipoComida
app.get('/api/deliveries/summary', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
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
        EntregadoPor: true
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
        EntregadoPor: p.EntregadoPor?.NombreCompleto || p.EntregadoPor?.NombreUsuario || 'Nutrición'
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
