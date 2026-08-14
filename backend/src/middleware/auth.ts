import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Extending express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: number;
        roleId: number;
        hospitalId?: number | null;
        servicioId?: number | null;
      };
    }
  }
}

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) {
    res.sendStatus(401);
    return;
  }
  
  jwt.verify(token, JWT_SECRET, async (err, decodedUser: any) => {
    if (err || !decodedUser) {
      res.sendStatus(403);
      return;
    }
    
    try {
      const dbUser = await prisma.usuarios.findUnique({
        where: { Id: decodedUser.userId },
        select: { Activo: true }
      });

      if (!dbUser || dbUser.Activo === false) {
        res.status(403).json({ error: 'Usuario inhabilitado. Sesión rechazada.' });
        return;
      }

      req.user = decodedUser;
      next();
    } catch (e) {
      req.user = decodedUser;
      next();
    }
  });
};

export const isGerente = (req: Request, res: Response, next: NextFunction): void => {
  // roleId 1: ADMIN/RRHH, roleId 2: GERENTE
  if (req.user && (req.user.roleId === 2 || req.user.roleId === 1)) {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado: Requiere rol de GERENTE' });
  }
};

export const isJefeServicio = (req: Request, res: Response, next: NextFunction): void => {
  // Assuming roleId 3 is JEFE_SERVICIO
  if (req.user && req.user.roleId === 3) {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado: Requiere rol de JEFE_SERVICIO' });
  }
};
