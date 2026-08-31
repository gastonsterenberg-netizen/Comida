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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNutricion = exports.isJefeServicio = exports.isGerente = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const authenticateToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) {
        res.status(401).json({ error: 'Token de autenticación no provisto. Por favor, inicie sesión.' });
        return;
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, decodedUser) => __awaiter(void 0, void 0, void 0, function* () {
        if (err || !decodedUser) {
            res.status(403).json({ error: 'Sesión expirada o token inválido. Por favor, vuelva a iniciar sesión.' });
            return;
        }
        try {
            const dbUser = yield prisma.usuarios.findUnique({
                where: { Id: decodedUser.userId },
                select: { Activo: true }
            });
            if (!dbUser || dbUser.Activo === false) {
                res.status(403).json({ error: 'Usuario inhabilitado. Sesión rechazada.' });
                return;
            }
            req.user = decodedUser;
            next();
        }
        catch (e) {
            req.user = decodedUser;
            next();
        }
    }));
});
exports.authenticateToken = authenticateToken;
const isGerente = (req, res, next) => {
    // roleId 1: ADMIN/RRHH, roleId 2: GERENTE
    if (req.user && (req.user.roleId === 2 || req.user.roleId === 1)) {
        next();
    }
    else {
        res.status(403).json({ error: 'Acceso denegado: Requiere rol de GERENTE' });
    }
};
exports.isGerente = isGerente;
const isJefeServicio = (req, res, next) => {
    // Assuming roleId 3 is JEFE_SERVICIO
    if (req.user && req.user.roleId === 3) {
        next();
    }
    else {
        res.status(403).json({ error: 'Acceso denegado: Requiere rol de JEFE_SERVICIO' });
    }
};
exports.isJefeServicio = isJefeServicio;
const isNutricion = (req, res, next) => {
    // roleId 5: NUTRICION, roleId 2: GERENTE, roleId 1: ADMIN/RRHH
    if (req.user && (req.user.roleId === 5 || req.user.roleId === 2 || req.user.roleId === 1)) {
        next();
    }
    else {
        res.status(403).json({ error: 'Acceso denegado: Requiere rol de NUTRICIÓN' });
    }
};
exports.isNutricion = isNutricion;
