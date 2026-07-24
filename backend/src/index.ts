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

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

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
    const user = await prisma.usuarios.findUnique({ where: { NombreUsuario: username } });
    if (!user) {
      await logAudit(req, 'LOGIN_FALLIDO', `Intento con usuario: ${username}`);
      res.status(401).json({ error: 'Credenciales inválidas' });
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

    res.json({
      message: 'Login exitoso',
      token: sessionToken,
      user: {
        id: user.Id,
        username: user.NombreUsuario,
        roleId: user.RolId,
      },
    });
    await logAudit(req, 'LOGIN_EXITOSO', undefined, user.Id);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en login' });
  }
});

app.post('/api/auth/logout', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  await logAudit(req, 'LOGOUT', 'Cierre de sesión');
  res.json({ message: 'Logout registrado' });
});

// --- HOSPITAL MANAGEMENT ENDPOINTS (GERENTE) ---

// 3.1 Crear/Actualizar Servicio
app.post('/api/services', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const { nombre } = req.body;
  const hospitalId = req.user?.hospitalId;

  if (!hospitalId || !nombre) {
    res.status(400).json({ error: 'Nombre del servicio y hospital requerido' });
    return;
  }

  try {
    const service = await prisma.servicios.create({
      data: { Nombre: nombre, HospitalId: hospitalId }
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
      where: { HospitalId: hospitalId }
    });
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener servicios' });
  }
});

// 3.2 Crear usuario Jefe de Servicio
app.post('/api/users/jefe-servicio', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const { username, password, servicioId } = req.body;
  const hospitalId = req.user?.hospitalId;

  if (!username || !password || !servicioId || !hospitalId) {
    res.status(400).json({ error: 'Faltan campos requeridos' });
    return;
  }

  if (!isPasswordSecure(password)) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, incluir una letra mayúscula, una letra minúscula, un número y un carácter especial.' });
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
        ContrasenaHash: hashedPassword,
        RolId: 3, // JEFE_SERVICIO
        HospitalId: hospitalId,
        ServicioId: sId
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
               Nombre: String(nombre),
               Apellido: String(apellido),
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
               Nombre: String(nombre),
               Apellido: String(apellido),
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

// 4.1 Obtener personal activo del servicio

// --- NUEVOS ENDPOINTS DE PLANTEL ---
app.get('/api/staff/padron', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(403).json({ error: 'El usuario no pertenece a ningun hospital' });
    return;
  }
  try {
    const padron = await prisma.padronHabilitados.findMany({
      where: { HospitalId: hospitalId, Activo: true },
      include: { Servicio: true },
      orderBy: { NombreCompleto: 'asc' }
    });

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

  if (!Array.isArray(plantel) || plantel.length === 0) {
    res.status(400).json({ error: 'El plantel esta vacio' });
    return;
  }

  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    // Validar duplicados
    for (const p of plantel) {
      const existing = await prisma.personal.findMany({
        where: {
          DNI: p.DNI,
          Activo: true,
          PeriodoFin: { gte: today }
        }
      });
      
      const has24h = existing.some(e => e.Horario.includes('24h'));
      if (has24h) {
         res.status(400).json({ error: `El agente ${p.DNI} ya esta asignado a una Guardia de 24h activa.` });
         return;
      }
      if (p.Horario.includes('24h') && existing.length > 0) {
         res.status(400).json({ error: `No se puede asignar Guardia 24h al agente ${p.DNI} porque ya tiene guardias activas.` });
         return;
      }
      if (p.Horario.includes('12h') && existing.length >= 2) {
         res.status(400).json({ error: `El agente ${p.DNI} ya está asignado al máximo de 2 planteles con guardia de 12h.` });
         return;
      }
      
      const existingInService = existing.some(e => e.ServicioId === servicioId);
      if (existingInService) {
         res.status(400).json({ error: `El agente ${p.DNI} ya esta asignado a este servicio.` });
         return;
      }
    }

    const inserted = await prisma.$transaction(
      plantel.map(p => prisma.personal.upsert({
        where: { DNI: p.DNI },
        update: {
          Nombre: p.NombreCompleto.split(',')[1]?.trim() || p.NombreCompleto,
          Apellido: p.NombreCompleto.split(',')[0]?.trim() || '',
          HospitalId: hospitalId,
          ServicioId: servicioId,
          Horario: p.Horario,
          PeriodoInicio: today,
          PeriodoFin: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
          Activo: true,
          BajaProvisoriaFecha: null,
          BajaProvisoriaHasta: null,
          BajaMotivo: null
        },
        create: {
          DNI: p.DNI,
          Nombre: p.NombreCompleto.split(',')[1]?.trim() || p.NombreCompleto,
          Apellido: p.NombreCompleto.split(',')[0]?.trim() || '',
          HospitalId: hospitalId,
          ServicioId: servicioId,
          Horario: p.Horario,
          PeriodoInicio: today,
          PeriodoFin: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
          Activo: true
        }
      }))
    );

    res.json({ message: 'Plantel guardado exitosamente', count: inserted.length });
  } catch (error) {
    console.error('Error saving plantel:', error);
    res.status(500).json({ error: 'Error al guardar el plantel' });
  }
});
// -----------------------------------

app.get('/api/staff/active', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const servicioId = req.user?.servicioId || Number(req.query.servicioId); // Usar token si está
  
  if (!servicioId) {
    res.status(400).json({ error: 'Servicio no especificado o usuario no asignado' });
    return;
  }

  try {
    const now = new Date();
    // Crear una fecha en UTC a la medianoche (ej. 2026-06-30T00:00:00.000Z) para que coincida exacto con la BD
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    
    const staff = await prisma.personal.findMany({
      where: {
        ServicioId: servicioId,
        PeriodoInicio: { lte: today },
        PeriodoFin: { gte: today },
        OR: [
          { Activo: true },
          { PeriodoFin: today }
        ]
      },
      include: {
        PedidosComida: {
          where: { FechaPedido: today }
        }
      }
    });

    // Filtro estricto: Solo devolver los que estén activos en el Padrón del Administrador
    const activePadron = await prisma.padronHabilitados.findMany({
      where: { Activo: true }
    });
    const padronMap = new Map(activePadron.map(p => [p.DNI, p]));

    const verifiedStaff = staff
      .filter(s => padronMap.has(s.DNI))
      .map(s => {
        const p = padronMap.get(s.DNI);
        // @ts-ignore
        const isBajaHoy = s.BajaProvisoriaFecha && (
          new Date(s.BajaProvisoriaFecha).getTime() <= today.getTime() && 
          (!s.BajaProvisoriaHasta || new Date(s.BajaProvisoriaHasta).getTime() >= today.getTime())
        );
        return { 
          ...s,
          bajaProvisoriaHoy: isBajaHoy,
          bajaDefinitivaHoy: !s.Activo,
          bajaMotivo: s.BajaMotivo
        };
      });

    res.json(verifiedStaff);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener personal' });
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
      const startDate = desde ? new Date(desde) : today;
      const endDate = hasta ? new Date(hasta) : startDate;
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
  try {
    await prisma.personal.update({ 
      where: { Id: Number(id) }, 
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
  const { personalId, tipoComida, tipoDieta, solicitadoPorUsuarioId } = req.body;
  
  const errorMsg = await checkDeadlines(solicitadoPorUsuarioId, tipoComida);
  if (errorMsg) {
    res.status(400).json({ error: errorMsg });
    return;
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
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    const crossCheck = await prisma.pedidosComida.findFirst({
      where: {
        Personal: { DNI: personal.DNI },
        TipoComida: tipoComida,
        FechaPedido: today,
        PersonalId: { not: personalId }
      }
    });

    if (crossCheck) {
      res.status(403).json({ error: `El agente con DNI ${personal.DNI} ya tiene este pedido (${tipoComida}) asignado en otro servicio.` });
      return;
    }

    const existingOrder = await prisma.pedidosComida.findFirst({
      where: {
        PersonalId: personalId,
        TipoComida: tipoComida,
        FechaPedido: today
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
          where: { PersonalId: personalId, FechaPedido: today, TipoComida: otherMealType }
        });
        if (hasOtherMeal) {
          res.status(403).json({ error: 'El agente (Guardia 12h) solo puede pedir una comida por día.' });
          return;
        }
      }

      // Crear nuevo pedido
      await prisma.pedidosComida.create({
        data: {
          FechaPedido: today,
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

// 4.3.b Guardar multiples pedidos
app.post('/api/orders/bulk', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { orders, tipoComida } = req.body;
  const solicitadoPorUsuarioId = req.user?.userId;

  if (!solicitadoPorUsuarioId) {
    res.status(401).json({ error: 'Usuario no autenticado' });
    return;
  }

  // Si se especifica tipoComida, validamos solo esa. Si no, validamos todo el pedido (Ambos).
  const tc = tipoComida || 'Ambos';
  const errorMsg = await checkDeadlines(solicitadoPorUsuarioId, tc);
  if (errorMsg) {
    res.status(400).json({ error: errorMsg });
    return;
  }
  
  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    // Borramos los pedidos de hoy para el personal especificado y tipoComida (si aplica)
    const personalIds = orders.map((o: any) => o.personalId);
    await prisma.pedidosComida.deleteMany({
      where: {
        FechaPedido: today,
        PersonalId: { in: personalIds },
        SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
        ...(tipoComida ? { TipoComida: tipoComida } : {})
      }
    });

    // Creamos los nuevos pedidos
    const newOrders = [];
    for (const o of orders) {
      const isAlmuerzo = tipoComida ? tipoComida === 'Almuerzo' : true;
      const isCena = tipoComida ? tipoComida === 'Cena' : true;
      
      const mealsRequested = (isAlmuerzo && o.almuerzoDieta ? 1 : 0) + (isCena && o.cenaDieta ? 1 : 0);
      if (mealsRequested === 0) continue;

      const personal = await prisma.personal.findUnique({ where: { Id: o.personalId } });
      if (!personal) continue;
      
      if (!personal.Horario.includes('24h') && mealsRequested > 1) {
        throw new Error(`El agente ${personal.Nombre} ${personal.Apellido} (Guardia 12h) no puede pedir más de 1 comida desde el mismo servicio.`);
      }

      if (isAlmuerzo && o.almuerzoDieta) {
        const almuerzoExistente = await prisma.pedidosComida.findFirst({
          where: {
            FechaPedido: today,
            TipoComida: 'Almuerzo',
            Personal: { DNI: personal.DNI }
          }
        });
        if (almuerzoExistente) {
          throw new Error(`El agente ${personal.Nombre} ${personal.Apellido} ya tiene un Almuerzo solicitado en otro servicio.`);
        }
        
        newOrders.push({
          FechaPedido: today,
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
            FechaPedido: today,
            TipoComida: 'Cena',
            Personal: { DNI: personal.DNI }
          }
        });
        if (cenaExistente) {
          throw new Error(`El agente ${personal.Nombre} ${personal.Apellido} ya tiene una Cena solicitada en otro servicio.`);
        }

        newOrders.push({
          FechaPedido: today,
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

// 5.2 Crear solicitud de emergencia
app.post('/api/emergencies', async (req: Request, res: Response): Promise<void> => {
  const { nombre, apellido, dni, periodoInicio, periodoFin, tipoComida, tipoDieta, justificacion, solicitadoPorUsuarioId, reemplazaId } = req.body;

  const errorMsg = await checkDeadlines(solicitadoPorUsuarioId, tipoComida);
  if (errorMsg) {
    res.status(400).json({ error: errorMsg });
    return;
  }

  try {
    const now = new Date();
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

    await prisma.pedidosComida.create({
      data: {
        FechaPedido: today,
        TipoComida: tipoComida,
        TipoDieta: tipoDieta || 'Normal',
        SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
        Estado: 'Pendiente',
        EmergenciaNombre: nombre,
        EmergenciaApellido: apellido,
        EmergenciaDNI: dni,
        EmergenciaPeriodoInicio: periodoInicio ? new Date(periodoInicio) : today,
        EmergenciaPeriodoFin: periodoFin ? new Date(periodoFin) : today,
        EmergenciaReemplazaId: reemplazaId ? Number(reemplazaId) : null,
        JustificacionSolicitud: justificacion
      }
    });
    await logAudit(req, 'ALTA_EMERGENCIA', `Solicitud de emergencia creada para DNI ${dni}`);
    res.json({ message: 'Solicitud de emergencia creada y pendiente de aprobación.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear solicitud de emergencia' });
  }
});

// 5.3 Obtener solicitudes de emergencia pendientes para el Gerente
app.get('/api/emergencies/pending', async (req: Request, res: Response): Promise<void> => {
  // TODO: Filtrar por el Hospital del Gerente (req.user.hospitalId)
  try {
    const pending = await prisma.pedidosComida.findMany({
      where: { Estado: 'Pendiente' },
      include: { SolicitadoPor: true, PersonalReemplazado: true }
    });
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener solicitudes' });
  }
});

// 5.3.5 Historial de emergencias
app.get('/api/emergencies/history', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId || Number(req.query.userId);
  if (!userId) {
    res.status(400).json({ error: 'Usuario no especificado' });
    return;
  }
  
  try {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const fiveDaysAgoUTC = new Date(Date.UTC(fiveDaysAgo.getFullYear(), fiveDaysAgo.getMonth(), fiveDaysAgo.getDate()));
    
    const history = await prisma.pedidosComida.findMany({
      where: { 
        SolicitadoPorUsuarioId: userId,
        JustificacionSolicitud: { not: null },
        FechaPedido: { gte: fiveDaysAgoUTC }
      },
      orderBy: { Id: 'desc' },
      include: { PersonalReemplazado: true, EvaluadoPor: true }
    });
    
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
});

// 5.4 Aprobar o Rechazar emergencia
app.post('/api/emergencies/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { estado, justificacionResolucion, evaluadoPorUsuarioId } = req.body; // estado: 'Aceptado' o 'Rechazado'

  if (!justificacionResolucion || justificacionResolucion.trim() === '') {
    res.status(400).json({ error: 'La justificación es obligatoria.' });
    return;
  }

  try {
    await prisma.pedidosComida.update({
      where: { Id: Number(id) },
      data: {
        Estado: estado,
        JustificacionResolucion: justificacionResolucion,
        EvaluadoPorUsuarioId: evaluadoPorUsuarioId
      }
    });
    await logAudit(req, 'AUTORIZACION_EMERGENCIA', `Solicitud de emergencia ID ${id} - ${estado}`);
    res.json({ message: `Solicitud ${estado.toLowerCase()} exitosamente.` });
  } catch (error) {
    res.status(500).json({ error: 'Error al resolver la solicitud' });
  }
});

// 6.1 Reportes con filtros
app.get('/api/reports', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { fechaInicio, fechaFin, hospitalId, servicioId, personalId } = req.query;
  const user = req.user;

  try {
    let whereClause: any = {};
    if (fechaInicio && fechaFin) {
      const start = new Date(fechaInicio as string);
      const end = new Date(fechaFin as string);
      whereClause.OR = [
        { FechaPedido: { gte: start, lte: end } },
        { 
          EmergenciaPeriodoInicio: { lte: end },
          EmergenciaPeriodoFin: { gte: start }
        }
      ];
    }

    // Role-based filtering
    if (user?.roleId === 3) {
      // JEFE_SERVICIO: solo ver su servicio
      whereClause.SolicitadoPorUsuarioId = user.userId;
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
        PersonalReemplazado: true,
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

    res.json(filteredReport);
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
        Servicios: true,
        Usuarios: {
          where: { RolId: 2 }, // Gerentes
          select: { Id: true, NombreUsuario: true }
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
  const { username, password, hospitalId } = req.body;
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
        RolId: 2, // GERENTE
        HospitalId: Number(hospitalId),
      }
    });
    res.json({ message: 'Gerente creado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear gerente' });
  }
});

app.get('/api/admin/auditoria', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.roleId !== 1) { // 1 = RRHH Global (Admin)
    res.status(403).json({ error: 'Solo el administrador puede ver los registros de auditoría.' });
    return;
  }
  try {
    // @ts-ignore
    const logs = await prisma.auditoria.findMany({
      orderBy: { Fecha: 'desc' },
      include: {
        Usuario: {
          select: { NombreUsuario: true, Rol: { select: { Nombre: true } } }
        }
      },
      take: 200 // Limitar últimos 200 para rendimiento
    });
    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Error al obtener registros de auditoría' });
  }
});
// 8. Configuracin de Horarios
app.get('/api/hospital/config', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId) {
    res.status(400).json({ error: 'Hospital no especificado' });
    return;
  }
  
  try {
    const hospital = await prisma.hospitales.findUnique({
      where: { Id: hospitalId },
      select: { LimiteAlmuerzo: true, LimiteCena: true }
    });
    res.json(hospital);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuracin' });
  }
});

app.put('/api/hospital/config', authenticateToken, isGerente, async (req: Request, res: Response): Promise<void> => {
  const hospitalId = req.user?.hospitalId;
  const { limiteAlmuerzo, limiteCena } = req.body;
  
  if (!hospitalId) {
    res.status(400).json({ error: 'Hospital no especificado' });
    return;
  }
  
  try {
    const updated = await prisma.hospitales.update({
      where: { Id: hospitalId },
      data: { LimiteAlmuerzo: limiteAlmuerzo, LimiteCena: limiteCena }
    });
    res.json({ message: 'Configuracin actualizada', data: updated });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar configuracin' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
