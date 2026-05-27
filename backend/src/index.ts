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
import { authenticateToken, isGerente, isJefeServicio } from './middleware/auth';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// --- AUTHENTICATION ENDPOINTS ---

// 2.2 Registro (solo para propósito de semilla/pruebas, en producción lo hace RRHH)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { username, password, roleId, hospitalId, servicioId } = req.body;
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

// 2.2 & 2.3 Login Inicial y Generación de TOTP
app.post('/api/auth/login', async (req: Request, res: Response): Promise<void> => {
  const { username, password } = req.body;
  try {
    const user = await prisma.usuarios.findUnique({ where: { NombreUsuario: username } });
    if (!user) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.ContrasenaHash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    // Si 2FA no está habilitado, generamos el secreto (Primer Login)
    if (!user.TwoFactorHabilitado) {
      const secret = authenticator.generateSecret();
      await prisma.usuarios.update({
        where: { Id: user.Id },
        data: { TwoFactorSecret: secret },
      });

      const otpauthUrl = authenticator.keyuri(username, 'ComidaControl', secret);
      const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

      // Retornar un token temporal para validar el 2FA
      const tempToken = jwt.sign({ userId: user.Id, temp: true }, JWT_SECRET, { expiresIn: '15m' });

      res.json({
        message: 'Configuración 2FA requerida',
        require2FA: true,
        setup: true,
        qrCode: qrCodeDataUrl,
        tempToken,
      });
      return;
    }

    // Si 2FA ya está habilitado
    const tempToken = jwt.sign({ userId: user.Id, temp: true }, JWT_SECRET, { expiresIn: '15m' });
    res.json({
      message: 'Código 2FA requerido',
      require2FA: true,
      setup: false,
      tempToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en login' });
  }
});

// 2.4 Validar 2FA
app.post('/api/auth/2fa/verify', async (req: Request, res: Response): Promise<void> => {
  const { tempToken, token } = req.body;
  try {
    const decoded = jwt.verify(tempToken, JWT_SECRET) as { userId: number; temp: boolean };
    if (!decoded.temp) {
      res.status(400).json({ error: 'Token inválido' });
      return;
    }

    const user = await prisma.usuarios.findUnique({ where: { Id: decoded.userId } });
    if (!user || !user.TwoFactorSecret) {
      res.status(400).json({ error: 'Usuario no encontrado o 2FA no configurado' });
      return;
    }

    const isValidTOTP = authenticator.verify({ token, secret: user.TwoFactorSecret });
    if (!isValidTOTP) {
      res.status(401).json({ error: 'Código 2FA inválido' });
      return;
    }

    // Marcar 2FA como habilitado si era el primer login
    if (!user.TwoFactorHabilitado) {
      await prisma.usuarios.update({
        where: { Id: user.Id },
        data: { TwoFactorHabilitado: true },
      });
    }

    // Generar token de sesión final
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
  } catch (error) {
    console.error(error);
    res.status(401).json({ error: 'Token temporal inválido o expirado' });
  }
});

// 2.5 Restablecer 2FA (Requiere token de Admin/RRHH)
app.post('/api/auth/2fa/reset', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { username } = req.body;
  // TODO: Agregar middleware para validar que req.user.roleId === 1 (RRHH)
  try {
    const user = await prisma.usuarios.findUnique({ where: { NombreUsuario: username } });
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    await prisma.usuarios.update({
      where: { Id: user.Id },
      data: { TwoFactorHabilitado: false, TwoFactorSecret: null },
    });

    res.json({ message: '2FA restablecido exitosamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al restablecer 2FA' });
  }
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

  try {
    // Validar que el servicio pertenece al hospital del gerente
    const servicio = await prisma.servicios.findFirst({ where: { Id: servicioId, HospitalId: hospitalId } });
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
        ServicioId: servicioId
      }
    });
    res.json({ message: 'Jefe de Servicio creado exitosamente', userId: user.Id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// --- STAFF IMPORT ENDPOINT ---
const upload = multer({ dest: 'uploads/' });

// 3.1, 3.2, 3.3, 3.4 Importación de Plantel (CSV)
app.post('/api/staff/import', authenticateToken, isJefeServicio, upload.single('file'), async (req: Request, res: Response): Promise<void> => {
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

  const results: any[] = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        for (const row of results) {
          const { DNI, Nombre, Apellido, Horario, PeriodoInicio, PeriodoFin } = row;
          
          if (!DNI || !Nombre || !Apellido || !Horario || !PeriodoInicio || !PeriodoFin) {
             continue; // Saltar filas inválidas
          }

          // Upsert personal asumiendo servicio del Jefe
          await prisma.personal.upsert({
            where: { DNI },
            update: {
               Nombre,
               Apellido,
               HospitalId: userHospitalId,
               ServicioId: userServicioId,
               Horario,
               PeriodoInicio: new Date(PeriodoInicio),
               PeriodoFin: new Date(PeriodoFin),
               Activo: true
            },
            create: {
               DNI,
               Nombre,
               Apellido,
               HospitalId: userHospitalId,
               ServicioId: userServicioId,
               Horario,
               PeriodoInicio: new Date(PeriodoInicio),
               PeriodoFin: new Date(PeriodoFin),
               Activo: true
            }
          });
        }
        res.json({ message: 'Personal importado exitosamente', count: results.length });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error procesando el archivo CSV' });
      } finally {
        fs.unlinkSync(req.file!.path); // Limpiar archivo temporal
      }
    });
});

// --- MEAL ORDERS & EMERGENCIES ENDPOINTS ---

// Función auxiliar para validar la hora límite (10:00 AM)
const isPastDeadline = () => {
  const now = new Date();
  // TODO: Ajustar por zona horaria de Buenos Aires si es necesario
  return now.getHours() >= 10;
};

// 4.1 Obtener personal activo del servicio
app.get('/api/staff/active', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const servicioId = req.user?.servicioId || Number(req.query.servicioId); // Usar token si está
  
  if (!servicioId) {
    res.status(400).json({ error: 'Servicio no especificado o usuario no asignado' });
    return;
  }

  try {
    const today = new Date();
    const staff = await prisma.personal.findMany({
      where: {
        ServicioId: servicioId,
        Activo: true,
        PeriodoInicio: { lte: today },
        PeriodoFin: { gte: today }
      }
    });
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener personal' });
  }
});

// 4.3 Registrar o eliminar pedido de comida (y 4.4 validación de 10AM)
app.post('/api/orders/toggle', async (req: Request, res: Response): Promise<void> => {
  const { personalId, tipoComida, tipoDieta, solicitadoPorUsuarioId } = req.body;
  
  if (isPastDeadline()) {
    res.status(400).json({ error: 'El horario límite para pedidos (10:00 AM) ha expirado.' });
    return;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingOrder = await prisma.pedidosComida.findFirst({
      where: {
        PersonalId: personalId,
        TipoComida: tipoComida,
        FechaPedido: today
      }
    });

    if (existingOrder) {
      // Si ya existe y se presiona, se asume que se quiere cancelar/eliminar
      await prisma.pedidosComida.delete({ where: { Id: existingOrder.Id } });
      res.json({ message: 'Pedido cancelado', action: 'deleted' });
    } else {
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

// 5.2 Crear solicitud de emergencia
app.post('/api/emergencies', async (req: Request, res: Response): Promise<void> => {
  const { nombre, apellido, dni, periodoInicio, periodoFin, tipoComida, tipoDieta, justificacion, solicitadoPorUsuarioId } = req.body;

  if (isPastDeadline()) {
    res.status(400).json({ error: 'El horario límite (10:00 AM) ha expirado.' });
    return;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
        EmergenciaPeriodoInicio: new Date(periodoInicio),
        EmergenciaPeriodoFin: new Date(periodoFin),
        JustificacionSolicitud: justificacion
      }
    });
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
      include: { SolicitadoPor: true }
    });
    res.json(pending);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener solicitudes' });
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
    res.json({ message: `Solicitud ${estado.toLowerCase()} exitosamente.` });
  } catch (error) {
    res.status(500).json({ error: 'Error al resolver la solicitud' });
  }
});

// 6.1 Reportes con filtros
app.get('/api/reports', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  const { fechaInicio, fechaFin, hospitalId, servicioId } = req.query;
  const user = req.user;

  try {
    let whereClause: any = {};
    if (fechaInicio && fechaFin) {
      whereClause.FechaPedido = {
        gte: new Date(fechaInicio as string),
        lte: new Date(fechaFin as string)
      };
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

    const report = await prisma.pedidosComida.findMany({
      where: whereClause,
      include: {
        Personal: { include: { Servicio: true, Hospital: true } },
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
