"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAudit = logAudit;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function logAudit(req, accion, detalles, usuarioId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            const finalUsuarioId = usuarioId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || null;
            let rawIp = Array.isArray(ipAddress) ? ipAddress[0] : ipAddress;
            if (rawIp === '::1' || rawIp === '::ffff:127.0.0.1') {
                rawIp = '127.0.0.1';
            }
            // @ts-ignore
            yield prisma.auditoria.create({
                data: {
                    Accion: accion,
                    Detalles: detalles || null,
                    UsuarioId: finalUsuarioId,
                    IpAddress: rawIp,
                },
            });
        }
        catch (error) {
            console.error('Error al registrar auditoría:', error);
            // No lanzar el error para no interrumpir el flujo principal de la aplicación
        }
    });
}
