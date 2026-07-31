"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isJefeServicio = exports.isGerente = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) {
        res.sendStatus(401);
        return;
    }
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            res.sendStatus(403);
            return;
        }
        req.user = user;
        next();
    });
};
exports.authenticateToken = authenticateToken;
const isGerente = (req, res, next) => {
    // Assuming roleId 2 is GERENTE
    if (req.user && req.user.roleId === 2) {
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
