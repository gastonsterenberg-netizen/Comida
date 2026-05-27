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

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token == null) {
    res.sendStatus(401);
    return;
  }
  
  jwt.verify(token, JWT_SECRET, (err, user: any) => {
    if (err) {
      res.sendStatus(403);
      return;
    }
    
    req.user = user;
    next();
  });
};

export const isGerente = (req: Request, res: Response, next: NextFunction): void => {
  // Assuming roleId 2 is GERENTE
  if (req.user && req.user.roleId === 2) {
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
