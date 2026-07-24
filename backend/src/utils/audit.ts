import { PrismaClient } from '@prisma/client';
import { Request } from 'express';

const prisma = new PrismaClient();

export async function logAudit(
  req: Request,
  accion: string,
  detalles?: string,
  usuarioId?: number
) {
  try {
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    
    // Si no se pasó usuarioId y hay usuario autenticado en req.user, usarlo
    const finalUsuarioId = usuarioId || (req as any).user?.userId || null;

    // @ts-ignore
    await prisma.auditoria.create({
      data: {
        Accion: accion,
        Detalles: detalles || null,
        UsuarioId: finalUsuarioId,
        IpAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress,
      },
    });
  } catch (error) {
    console.error('Error al registrar auditoría:', error);
    // No lanzar el error para no interrumpir el flujo principal de la aplicación
  }
}
