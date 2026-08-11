"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const multer_1 = __importDefault(require("multer"));
const csv_parser_1 = __importDefault(require("csv-parser"));
const fs_1 = __importDefault(require("fs"));
const xlsx = __importStar(require("xlsx"));
const auth_1 = require("./middleware/auth");
const audit_1 = require("./utils/audit");
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
function isPasswordSecure(password) {
    if (!password)
        return false;
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/.test(password);
    return password.length >= minLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
}
// --- AUTHENTICATION ENDPOINTS ---
// 2.2 Registro (solo para propósito de semilla/pruebas, en producción lo hace RRHH)
app.post('/api/auth/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password, roleId, hospitalId, servicioId } = req.body;
    if (!isPasswordSecure(password)) {
        res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres, incluir una letra mayúscula, una letra minúscula, un número y un carácter especial.' });
        return;
    }
    try {
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma.usuarios.create({
            data: {
                NombreUsuario: username,
                ContrasenaHash: hashedPassword,
                RolId: roleId,
                HospitalId: hospitalId || null,
                ServicioId: servicioId || null,
            },
        });
        res.json({ message: 'Usuario creado exitosamente', userId: user.Id });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear usuario' });
    }
}));
// 2.2 & 2.3 Login Inicial (2FA removido, login directo)
app.post('/api/auth/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    try {
        const user = yield prisma.usuarios.findUnique({
            where: { NombreUsuario: username },
            include: { Hospital: true, Servicio: true }
        });
        if (!user) {
            yield (0, audit_1.logAudit)(req, 'LOGIN_FALLIDO', `Intento con usuario: ${username}`);
            res.status(401).json({ error: 'Credenciales inválidas' });
            return;
        }
        const isValidPassword = yield bcryptjs_1.default.compare(password, user.ContrasenaHash);
        if (!isValidPassword) {
            yield (0, audit_1.logAudit)(req, 'LOGIN_FALLIDO', `Contraseña incorrecta`, user.Id);
            res.status(401).json({ error: 'Credenciales inválidas' });
            return;
        }
        // Generar token de sesión final directamente
        const sessionToken = jsonwebtoken_1.default.sign({
            userId: user.Id,
            roleId: user.RolId,
            hospitalId: user.HospitalId,
            servicioId: user.ServicioId,
        }, JWT_SECRET, { expiresIn: '12h' });
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
        yield (0, audit_1.logAudit)(req, 'LOGIN_EXITOSO', undefined, user.Id);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error en login' });
    }
}));
app.post('/api/auth/change-password', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { newPassword } = req.body;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId || !newPassword) {
        res.status(400).json({ error: 'Datos incompletos' });
        return;
    }
    if (!isPasswordSecure(newPassword)) {
        res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres, incluir una letra mayúscula, una letra minúscula, un número y un carácter especial.' });
        return;
    }
    try {
        const user = yield prisma.usuarios.findUnique({
            where: { Id: userId },
            include: { Hospital: true, Servicio: true }
        });
        if (!user) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }
        const hashedPassword = yield bcryptjs_1.default.hash(newPassword, 10);
        yield prisma.usuarios.update({
            where: { Id: userId },
            data: {
                ContrasenaHash: hashedPassword,
                DebeCambiarContrasena: false
            }
        });
        const sessionToken = jsonwebtoken_1.default.sign({
            userId: user.Id,
            roleId: user.RolId,
            hospitalId: user.HospitalId,
            servicioId: user.ServicioId,
        }, JWT_SECRET, { expiresIn: '12h' });
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
        yield (0, audit_1.logAudit)(req, 'CAMBIO_CONTRASENA_OBLIGATORIO', undefined, user.Id);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
}));
app.post('/api/auth/logout', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, audit_1.logAudit)(req, 'LOGOUT', 'Cierre de sesión');
    res.json({ message: 'Logout registrado' });
}));
// --- HOSPITAL MANAGEMENT ENDPOINTS (GERENTE) ---
// 3.1 Crear/Actualizar Servicio
app.post('/api/services', auth_1.authenticateToken, auth_1.isGerente, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { nombre, voucherIndividual } = req.body;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!hospitalId || !nombre) {
        res.status(400).json({ error: 'Nombre del servicio y hospital requerido' });
        return;
    }
    try {
        const service = yield prisma.servicios.create({
            data: {
                Nombre: nombre,
                HospitalId: hospitalId,
                VoucherIndividual: !!voucherIndividual
            }
        });
        res.json({ message: 'Servicio creado exitosamente', service });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear servicio' });
    }
}));
// 3.1.b Obtener Servicios
app.get('/api/services', auth_1.authenticateToken, auth_1.isGerente, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!hospitalId) {
        res.status(403).json({ error: 'No tienes un hospital asignado' });
        return;
    }
    try {
        const services = yield prisma.servicios.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
}));
// 3.1.c Alternar tipo de voucher (Consolidado/Individual)
app.put('/api/services/:id/toggle-voucher', auth_1.authenticateToken, auth_1.isGerente, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const id = Number(req.params.id);
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!id || !hospitalId) {
        res.status(400).json({ error: 'ID de servicio y hospital requerido' });
        return;
    }
    try {
        const service = yield prisma.servicios.findFirst({
            where: { Id: id, HospitalId: hospitalId }
        });
        if (!service) {
            res.status(404).json({ error: 'Servicio no encontrado' });
            return;
        }
        const updatedService = yield prisma.servicios.update({
            where: { Id: id },
            data: { VoucherIndividual: !service.VoucherIndividual }
        });
        yield (0, audit_1.logAudit)(req, 'MODIFICACION_SERVICIO', `Servicio ${service.Nombre} cambiado a voucher individual: ${updatedService.VoucherIndividual}`);
        res.json({ message: 'Servicio actualizado exitosamente', service: updatedService });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar el servicio' });
    }
}));
// 3.2 Crear usuario Jefe de Servicio
// GERENTES endpoints
app.get('/api/users/gerentes', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) !== 1) { // Solo RRHH
        res.status(403).json({ error: 'No autorizado' });
        return;
    }
    try {
        const gerentes = yield prisma.usuarios.findMany({
            where: { RolId: 2 },
            select: { Id: true, NombreUsuario: true, Activo: true, Hospital: { select: { Nombre: true } } }
        });
        res.json(gerentes);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener gerentes' });
    }
}));
app.put('/api/users/:id/reset-password', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const targetId = Number(req.params.id);
    try {
        const user = yield prisma.usuarios.findUnique({ where: { Id: targetId } });
        if (!user) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }
        const isRRHH = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) === 1;
        const isGerenteOwner = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.roleId) === 2 && user.RolId === 3 && user.HospitalId === req.user.hospitalId;
        if (!isRRHH && !isGerenteOwner) {
            res.status(403).json({ error: 'No autorizado' });
            return;
        }
        const newHash = yield bcryptjs_1.default.hash('123456', 10);
        yield prisma.usuarios.update({
            where: { Id: targetId },
            data: { ContrasenaHash: newHash, DebeCambiarContrasena: true }
        });
        res.json({ message: 'Contraseña reseteada a "123456"' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al resetear contraseña' });
    }
}));
app.put('/api/users/:id/disable', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const targetId = Number(req.params.id);
    try {
        const user = yield prisma.usuarios.findUnique({ where: { Id: targetId } });
        if (!user) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }
        const isRRHH = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) === 1;
        const isGerenteOwner = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.roleId) === 2 && user.RolId === 3 && user.HospitalId === req.user.hospitalId;
        if (!isRRHH && !isGerenteOwner) {
            res.status(403).json({ error: 'No autorizado' });
            return;
        }
        yield prisma.usuarios.update({
            where: { Id: targetId },
            data: { Activo: !(user.Activo) }
        });
        res.json({ message: 'Estado del usuario actualizado' });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al actualizar estado del usuario' });
    }
}));
app.delete('/api/users/:id', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const targetId = Number(req.params.id);
    try {
        const user = yield prisma.usuarios.findUnique({ where: { Id: targetId } });
        if (!user) {
            res.status(404).json({ error: 'Usuario no encontrado' });
            return;
        }
        const isRRHH = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) === 1;
        const isGerenteOwner = ((_b = req.user) === null || _b === void 0 ? void 0 : _b.roleId) === 2 && user.RolId === 3 && user.HospitalId === req.user.hospitalId;
        if (!isRRHH && !isGerenteOwner) {
            res.status(403).json({ error: 'No autorizado' });
            return;
        }
        yield prisma.usuarios.delete({
            where: { Id: targetId }
        });
        res.json({ message: 'Usuario eliminado correctamente' });
    }
    catch (error) {
        console.error(error);
        if (error.code === 'P2003' || error.code === 'P2014') {
            res.status(400).json({
                error: 'No se puede eliminar este usuario porque tiene historial registrado (pedidos de comida o auditorías). Puedes inhabilitarlo usando el botón ❌ para quitarle el acceso manteniendo la integridad de los datos.'
            });
            return;
        }
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
}));
app.post('/api/users/jefe-servicio', auth_1.authenticateToken, auth_1.isGerente, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username, nombreCompleto, servicioId } = req.body;
    const password = req.body.password || '123456';
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!username || !nombreCompleto || !servicioId || !hospitalId) {
        res.status(400).json({ error: 'Faltan campos requeridos (Nombre completo, usuario y servicio)' });
        return;
    }
    try {
        const sId = Number(servicioId);
        // Validar que el servicio pertenece al hospital del gerente
        const servicio = yield prisma.servicios.findFirst({ where: { Id: sId, HospitalId: hospitalId } });
        if (!servicio) {
            res.status(403).json({ error: 'Servicio no encontrado o no pertenece a su hospital' });
            return;
        }
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma.usuarios.create({
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
    }
    catch (error) {
        console.error(error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'Ese nombre de usuario ya está en uso. Por favor, elige otro (ej. pediatria_padilla).' });
        }
        else {
            res.status(500).json({ error: 'Error al crear usuario' });
        }
    }
}));
// --- STAFF IMPORT ENDPOINT ---
const upload = (0, multer_1.default)({ dest: 'uploads/' });
function parseCSVDate(dateStr) {
    if (!dateStr)
        return new Date();
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
app.post('/api/staff/import_old', auth_1.authenticateToken, auth_1.isJefeServicio, upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (!req.file) {
        res.status(400).json({ error: 'No se subió ningún archivo' });
        return;
    }
    const userServicioId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.servicioId;
    const userHospitalId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.hospitalId;
    if (!userServicioId || !userHospitalId) {
        res.status(403).json({ error: 'El usuario no tiene un servicio asignado' });
        fs_1.default.unlinkSync(req.file.path);
        return;
    }
    const content = fs_1.default.readFileSync(req.file.path, 'utf8');
    const firstLine = content.split('\n')[0];
    const separator = firstLine.includes(';') ? ';' : ',';
    const results = [];
    fs_1.default.createReadStream(req.file.path)
        .pipe((0, csv_parser_1.default)({ separator, mapHeaders: ({ header }) => header.replace(/^\uFEFF/, '').replace(/^ï»¿/, '').toLowerCase().trim() }))
        .on('data', (data) => results.push(data))
        .on('end', () => __awaiter(void 0, void 0, void 0, function* () {
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
                const padron = yield prisma.padronHabilitados.findUnique({
                    where: { DNI: strDni }
                });
                // Si no está en el padrón o no está marcado como activo (con_vianda = NO)
                if (!padron || !padron.Activo) {
                    continue;
                }
                const horario = padron.EsGuardia24h ? "24h" : "12h";
                // Upsert personal asumiendo servicio del Jefe
                yield prisma.personal.upsert({
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
            yield (0, audit_1.logAudit)(req, 'ACTUALIZACION_PLANTEL', `Se importaron ${importedCount} registros de personal`);
            res.json({ message: 'Personal importado exitosamente', count: importedCount });
        }
        catch (error) {
            console.error('CSV Import Error:', error);
            res.status(500).json({ error: 'Error procesando el archivo CSV' });
        }
        finally {
            fs_1.default.unlinkSync(req.file.path); // Limpiar archivo temporal
        }
    }));
}));
// --- ADMIN IMPORT PADRON (XLSX) ---
app.post('/api/admin/padron/import', auth_1.authenticateToken, upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) !== 1) { // 1 = RRHH Global (Admin)
        res.status(403).json({ error: 'Solo el administrador puede importar el padrón.' });
        if (req.file)
            fs_1.default.unlinkSync(req.file.path);
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
        const data = xlsx.utils.sheet_to_json(sheet);
        let importedCount = 0;
        // Opcionalmente borrar el padrón actual:
        yield prisma.padronHabilitados.deleteMany();
        const now = new Date();
        const utcMinus3 = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        // Load hospitales for mapping
        const hospitalesDB = yield prisma.hospitales.findMany();
        const hospMap = new Map();
        hospitalesDB.forEach(h => hospMap.set(h.Nombre.toLowerCase().trim(), h.Id));
        // Identificar y crear servicios faltantes
        const uniqueServiciosToCreate = new Map();
        for (const originalRow of data) {
            const hospitalName = ((_b = originalRow['efector']) === null || _b === void 0 ? void 0 : _b.toString().trim().toLowerCase()) || ((_c = originalRow['hospital']) === null || _c === void 0 ? void 0 : _c.toString().trim().toLowerCase());
            const servicioNameOriginal = (_d = originalRow['servicio']) === null || _d === void 0 ? void 0 : _d.toString().trim();
            const servicioName = servicioNameOriginal === null || servicioNameOriginal === void 0 ? void 0 : servicioNameOriginal.toLowerCase();
            const hospitalId = hospitalName ? hospMap.get(hospitalName) || null : null;
            if (hospitalId && servicioNameOriginal) {
                uniqueServiciosToCreate.set(`${hospitalId}-${servicioName}`, { hospitalId, nombre: servicioNameOriginal });
            }
        }
        const serviciosDB = yield prisma.servicios.findMany();
        const servMap = new Map();
        serviciosDB.forEach(s => servMap.set(`${s.HospitalId}-${s.Nombre.toLowerCase().trim()}`, s.Id));
        for (const [key, val] of uniqueServiciosToCreate.entries()) {
            if (!servMap.has(key)) {
                const newServicio = yield prisma.servicios.create({
                    data: { HospitalId: val.hospitalId, Nombre: val.nombre }
                });
                servMap.set(key, newServicio.Id);
            }
        }
        const insertData = data.map((originalRow) => {
            var _a, _b, _c, _d, _e, _f, _g;
            // Usar nombres exactos de encabezados proporcionados por el usuario
            const dni = (_a = originalRow['documento']) === null || _a === void 0 ? void 0 : _a.toString();
            const nombreCompleto = ((_b = originalRow['agente']) === null || _b === void 0 ? void 0 : _b.toString()) || 'Sin Nombre';
            // Manejar posibles valores de excel como "SI", "NO", true, false, 1, 0
            const conViandaStr = (_c = originalRow['con_vianda']) === null || _c === void 0 ? void 0 : _c.toString().trim().toLowerCase();
            const conVianda = conViandaStr === 'si' || conViandaStr === 'true' || conViandaStr === '1';
            const esGuardia24Str = (_d = originalRow['esguardia24']) === null || _d === void 0 ? void 0 : _d.toString().trim().toLowerCase();
            const esGuardia24h = esGuardia24Str === 'si' || esGuardia24Str === 'true' || esGuardia24Str === '1';
            const hospitalName = ((_e = originalRow['efector']) === null || _e === void 0 ? void 0 : _e.toString().trim().toLowerCase()) || ((_f = originalRow['hospital']) === null || _f === void 0 ? void 0 : _f.toString().trim().toLowerCase());
            const servicioName = (_g = originalRow['servicio']) === null || _g === void 0 ? void 0 : _g.toString().trim().toLowerCase();
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
            yield prisma.padronHabilitados.createMany({
                data: uniqueInsertData
            });
            importedCount = uniqueInsertData.length;
        }
        yield (0, audit_1.logAudit)(req, 'ACTUALIZACION_PADRON', `Se importaron ${importedCount} registros en el padrón`);
        res.json({ message: 'Padrón importado exitosamente', count: importedCount });
    }
    catch (error) {
        console.error('XLSX Import Error:', error);
        res.status(500).json({ error: 'Error procesando el archivo XLSX' });
    }
    finally {
        if (req.file)
            fs_1.default.unlinkSync(req.file.path);
    }
}));
app.get('/api/admin/padron', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) !== 1) { // 1 = RRHH Global (Admin)
        res.status(403).json({ error: 'Solo el administrador puede ver el padrón.' });
        return;
    }
    try {
        const padron = yield prisma.padronHabilitados.findMany({
            orderBy: { NombreCompleto: 'asc' }
        });
        res.json(padron);
    }
    catch (error) {
        console.error('Error fetching padron:', error);
        res.status(500).json({ error: 'Error al obtener el padrón' });
    }
}));
// --- MEAL ORDERS & EMERGENCIES ENDPOINTS ---
const checkDeadlines = (solicitadoPorUsuarioId, tipoComida) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma.usuarios.findUnique({ where: { Id: solicitadoPorUsuarioId }, include: { Hospital: true } });
    if (!user || !user.Hospital)
        return null;
    const config = user.Hospital;
    const now = new Date();
    const currentTotalMins = now.getHours() * 60 + now.getMinutes();
    if (tipoComida === 'Almuerzo' || tipoComida === 'Ambos') {
        const limitAlm = config.LimiteAlmuerzo || '09:00';
        const [limitH, limitM] = limitAlm.split(':').map(Number);
        if (currentTotalMins >= limitH * 60 + limitM)
            return `El horario límite para pedidos de Almuerzo (${limitAlm}) ha expirado.`;
    }
    if (tipoComida === 'Cena' || tipoComida === 'Ambos') {
        const limitCen = config.LimiteCena || '17:00';
        const [limitH, limitM] = limitCen.split(':').map(Number);
        if (currentTotalMins >= limitH * 60 + limitM)
            return `El horario límite para pedidos de Cena (${limitCen}) ha expirado.`;
    }
    return null;
});
const checkAuthDeadlines = (solicitadoPorUsuarioId, tipoComida) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield prisma.usuarios.findUnique({ where: { Id: solicitadoPorUsuarioId }, include: { Hospital: true } });
    if (!user || !user.Hospital)
        return null;
    const config = user.Hospital;
    const now = new Date();
    const currentTotalMins = now.getHours() * 60 + now.getMinutes();
    if (tipoComida === 'Almuerzo' || tipoComida === 'Ambos') {
        const limitAuthAlm = config.LimiteAutorizacionAlmuerzo || '11:00';
        const [limitH, limitM] = limitAuthAlm.split(':').map(Number);
        if (currentTotalMins >= limitH * 60 + limitM)
            return `El horario límite para autorizar emergencias de Almuerzo (${limitAuthAlm}) ha expirado.`;
    }
    if (tipoComida === 'Cena' || tipoComida === 'Ambos') {
        const limitAuthCen = config.LimiteAutorizacionCena || '18:00';
        const [limitH, limitM] = limitAuthCen.split(':').map(Number);
        if (currentTotalMins >= limitH * 60 + limitM)
            return `El horario límite para autorizar emergencias de Cena (${limitAuthCen}) ha expirado.`;
    }
    return null;
});
// 4.1 Obtener personal activo del servicio
// --- NUEVOS ENDPOINTS DE PLANTEL ---
app.get('/api/staff/padron', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!hospitalId) {
        res.status(403).json({ error: 'El usuario no pertenece a ningun hospital' });
        return;
    }
    try {
        let padron = yield prisma.padronHabilitados.findMany({
            where: { HospitalId: hospitalId },
            include: { Servicio: true },
            orderBy: { NombreCompleto: 'asc' }
        });
        if (padron.length === 0) {
            const staffPersonal = yield prisma.personal.findMany({
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
                Hospital: null,
                Servicio: p.Servicio
            }));
        }
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const activeStaff = yield prisma.personal.findMany({
            where: { HospitalId: hospitalId, Activo: true, PeriodoFin: { gte: today } }
        });
        const padronWithStatus = padron.map(p => {
            const assignments = activeStaff.filter(s => s.DNI === p.DNI);
            const has24h = assignments.some(a => a.Horario.includes('24h'));
            const count12h = assignments.filter(a => a.Horario.includes('12h')).length;
            return Object.assign(Object.assign({}, p), { has24h, count12h });
        });
        res.json(padronWithStatus);
    }
    catch (error) {
        console.error('Error fetching staff padron:', error);
        res.status(500).json({ error: 'Error al obtener el padron de agentes' });
    }
}));
app.post('/api/staff/plantel', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { plantel } = req.body;
    const servicioId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.servicioId;
    const hospitalId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.hospitalId;
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
        yield prisma.personal.updateMany({
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
            yield prisma.padronHabilitados.updateMany({
                where: { DNI: p.DNI },
                data: {
                    EsGuardia24h: Boolean(is24h),
                    Activo: true,
                    HospitalId: hospitalId,
                    ServicioId: servicioId
                }
            });
            yield prisma.personal.upsert({
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
        yield (0, audit_1.logAudit)(req, 'GUARDAR_PLANTEL', `Se reconfiguró/guardó el plantel del servicio con ${plantel.length} agentes`);
        res.json({ message: 'Plantel guardado exitosamente', count: plantel.length });
    }
    catch (error) {
        console.error('Error saving plantel:', error);
        res.status(500).json({ error: 'Error al guardar el plantel' });
    }
}));
// -----------------------------------
app.get('/api/staff/active', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const sId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.servicioId) || Number(req.query.servicioId);
    if (!sId || isNaN(sId)) {
        res.status(400).json({ error: 'Servicio no especificado o usuario no asignado' });
        return;
    }
    const servicioId = Number(sId);
    try {
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const today = new Date(`${todayStr}T00:00:00.000Z`);
        const staff = yield prisma.personal.findMany({
            where: {
                ServicioId: servicioId,
                Activo: true
            },
            include: {
                PedidosComida: {
                    where: { FechaPedido: today }
                }
            },
            orderBy: { NombreCompleto: 'asc' }
        });
        const verifiedStaff = staff.map(s => {
            // @ts-ignore
            const isBajaHoy = s.BajaProvisoriaFecha && (new Date(s.BajaProvisoriaFecha).getTime() <= today.getTime() &&
                (!s.BajaProvisoriaHasta || new Date(s.BajaProvisoriaHasta).getTime() >= today.getTime()));
            return Object.assign(Object.assign({}, s), { bajaProvisoriaHoy: Boolean(isBajaHoy), bajaDefinitivaHoy: !s.Activo, bajaMotivo: s.BajaMotivo || null });
        });
        res.json(verifiedStaff);
    }
    catch (error) {
        console.error('Error fetching active staff:', error);
        try {
            const basicStaff = yield prisma.personal.findMany({
                where: { ServicioId: Number(servicioId), Activo: true },
                orderBy: { NombreCompleto: 'asc' }
            });
            res.json(basicStaff.map(s => (Object.assign(Object.assign({}, s), { PedidosComida: [] }))));
        }
        catch (innerError) {
            res.status(500).json({ error: 'Error al obtener personal activo' });
        }
    }
}));
// 4.1.5 Dar de baja a personal (Provisoria o Definitiva)
app.post('/api/staff/:id/baja', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
            yield prisma.personal.update({ where: { Id: Number(id) }, data: { BajaProvisoriaFecha: startDate, BajaProvisoriaHasta: endDate, BajaMotivo: bajaMotivo } });
            // Borrar pedidos que caigan en ese rango de inhabilitación
            yield prisma.pedidosComida.deleteMany({
                where: {
                    PersonalId: Number(id),
                    FechaPedido: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            });
            yield (0, audit_1.logAudit)(req, 'BAJA_PROVISIONAL', `Baja provisoria aplicada al agente ID: ${id}`);
        }
        else if (tipo === 'DEFINITIVA') {
            // @ts-ignore
            yield prisma.personal.update({ where: { Id: Number(id) }, data: { Activo: false, PeriodoFin: today, BajaMotivo: req.body.motivo || null } });
            yield (0, audit_1.logAudit)(req, 'BAJA_DEFINITIVA', `Baja definitiva aplicada al agente ID: ${id}`);
        }
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error al dar de baja:', error);
        res.status(500).json({ error: 'Error al dar de baja al personal' });
    }
}));
// 4.1.6 Revertir baja (Provisoria o Definitiva)
app.post('/api/staff/:id/revertir-baja', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const personalId = Number(id);
    try {
        const agente = yield prisma.personal.findUnique({ where: { Id: personalId } });
        if (!agente) {
            res.status(404).json({ error: 'Agente no encontrado' });
            return;
        }
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        // Verificar si el agente titular posee un reemplazo activo (Pendiente o Aprobado) para hoy o fechas futuras
        const reemplazoActivo = yield prisma.pedidosComida.findFirst({
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
        yield prisma.personal.update({
            where: { Id: personalId },
            data: {
                Activo: true,
                BajaProvisoriaFecha: null,
                BajaProvisoriaHasta: null,
                BajaMotivo: null,
                PeriodoFin: new Date(Date.UTC(9999, 11, 31))
            }
        });
        yield (0, audit_1.logAudit)(req, 'REVERTIR_BAJA', `Baja revertida al agente ID: ${id}`);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error al revertir baja:', error);
        res.status(500).json({ error: 'Error al revertir la baja al personal' });
    }
}));
// 4.3 Registrar o eliminar pedido de comida (y 4.4 validación de 10AM)
app.post('/api/orders/toggle', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { personalId, tipoComida, tipoDieta, solicitadoPorUsuarioId } = req.body;
    const errorMsg = yield checkDeadlines(solicitadoPorUsuarioId, tipoComida);
    if (errorMsg) {
        res.status(400).json({ error: errorMsg });
        return;
    }
    try {
        const personal = yield prisma.personal.findUnique({ where: { Id: personalId } });
        if (!personal) {
            res.status(404).json({ error: 'Personal no encontrado.' });
            return;
        }
        const padron = yield prisma.padronHabilitados.findUnique({ where: { DNI: personal.DNI } });
        if (!padron || !padron.Activo) {
            res.status(403).json({ error: 'El agente no se encuentra en el padrón de habilitados para recibir comida.' });
            return;
        }
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const crossCheck = yield prisma.pedidosComida.findFirst({
            where: {
                Personal: { DNI: personal.DNI },
                TipoComida: tipoComida,
                FechaPedido: today,
                PersonalId: { not: personalId }
            },
            include: {
                SolicitadoPor: { include: { Servicio: true } },
                Personal: { include: { Servicio: true } }
            }
        });
        if (crossCheck) {
            const sNombre = ((_b = (_a = crossCheck.SolicitadoPor) === null || _a === void 0 ? void 0 : _a.Servicio) === null || _b === void 0 ? void 0 : _b.Nombre) || ((_d = (_c = crossCheck.Personal) === null || _c === void 0 ? void 0 : _c.Servicio) === null || _d === void 0 ? void 0 : _d.Nombre) || 'otro servicio';
            res.status(403).json({ error: `El agente con DNI ${personal.DNI} ya tiene este pedido (${tipoComida}) asignado en el servicio "${sNombre}".` });
            return;
        }
        const existingOrder = yield prisma.pedidosComida.findFirst({
            where: {
                PersonalId: personalId,
                TipoComida: tipoComida,
                FechaPedido: today
            }
        });
        if (existingOrder) {
            if (existingOrder.TipoDieta === tipoDieta) {
                // Si es la misma dieta, se cancela
                yield prisma.pedidosComida.delete({ where: { Id: existingOrder.Id } });
                res.json({ message: 'Pedido cancelado', action: 'deleted' });
            }
            else {
                // Si es otra dieta, se actualiza
                yield prisma.pedidosComida.update({
                    where: { Id: existingOrder.Id },
                    data: { TipoDieta: tipoDieta }
                });
                res.json({ message: 'Dieta actualizada', action: 'updated' });
            }
            // Validar límite si no es 24h
            if (!padron.EsGuardia24h) {
                const otherMealType = tipoComida === 'Almuerzo' ? 'Cena' : 'Almuerzo';
                const hasOtherMeal = yield prisma.pedidosComida.findFirst({
                    where: { PersonalId: personalId, FechaPedido: today, TipoComida: otherMealType }
                });
                if (hasOtherMeal) {
                    res.status(403).json({ error: 'El agente (Guardia 12h) solo puede pedir una comida por día.' });
                    return;
                }
            }
            // Crear nuevo pedido
            yield prisma.pedidosComida.create({
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
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al procesar el pedido' });
    }
}));
// 4.3.b Guardar multiples pedidos
app.post('/api/orders/bulk', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const { orders, tipoComida } = req.body;
    const solicitadoPorUsuarioId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!solicitadoPorUsuarioId) {
        res.status(401).json({ error: 'Usuario no autenticado' });
        return;
    }
    // Si se especifica tipoComida, validamos solo esa. Si no, validamos todo el pedido (Ambos).
    const tc = tipoComida || 'Ambos';
    const errorMsg = yield checkDeadlines(solicitadoPorUsuarioId, tc);
    if (errorMsg) {
        res.status(400).json({ error: errorMsg });
        return;
    }
    try {
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        // Borramos los pedidos de hoy para el personal especificado y tipoComida (si aplica)
        const personalIds = orders.map((o) => o.personalId);
        yield prisma.pedidosComida.deleteMany({
            where: Object.assign({ FechaPedido: today, PersonalId: { in: personalIds } }, (tipoComida ? { TipoComida: tipoComida } : {}))
        });
        // Creamos los nuevos pedidos
        const newOrders = [];
        for (const o of orders) {
            const isAlmuerzo = tipoComida ? tipoComida === 'Almuerzo' : true;
            const isCena = tipoComida ? tipoComida === 'Cena' : true;
            const mealsRequested = (isAlmuerzo && o.almuerzoDieta ? 1 : 0) + (isCena && o.cenaDieta ? 1 : 0);
            if (mealsRequested === 0)
                continue;
            const personal = yield prisma.personal.findUnique({ where: { Id: o.personalId } });
            if (!personal)
                continue;
            if (!personal.Horario.includes('24h')) {
                if (mealsRequested > 1) {
                    throw new Error(`El agente ${personal.NombreCompleto} (Guardia 12h) solo puede solicitar 1 comida por día.`);
                }
                if (isAlmuerzo && o.almuerzoDieta) {
                    const cenaExistente = yield prisma.pedidosComida.findFirst({
                        where: { FechaPedido: today, TipoComida: 'Cena', Personal: { DNI: personal.DNI } },
                        include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
                    });
                    if (cenaExistente) {
                        const sNombre = ((_c = (_b = cenaExistente.SolicitadoPor) === null || _b === void 0 ? void 0 : _b.Servicio) === null || _c === void 0 ? void 0 : _c.Nombre) || ((_e = (_d = cenaExistente.Personal) === null || _d === void 0 ? void 0 : _d.Servicio) === null || _e === void 0 ? void 0 : _e.Nombre) || 'otro servicio';
                        throw new Error(`El agente ${personal.NombreCompleto} (Guardia 12h) ya tiene registrada una Cena para el día de hoy en el servicio "${sNombre}".`);
                    }
                }
                if (isCena && o.cenaDieta) {
                    const almuerzoExistente = yield prisma.pedidosComida.findFirst({
                        where: { FechaPedido: today, TipoComida: 'Almuerzo', Personal: { DNI: personal.DNI } },
                        include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
                    });
                    if (almuerzoExistente) {
                        const sNombre = ((_g = (_f = almuerzoExistente.SolicitadoPor) === null || _f === void 0 ? void 0 : _f.Servicio) === null || _g === void 0 ? void 0 : _g.Nombre) || ((_j = (_h = almuerzoExistente.Personal) === null || _h === void 0 ? void 0 : _h.Servicio) === null || _j === void 0 ? void 0 : _j.Nombre) || 'otro servicio';
                        throw new Error(`El agente ${personal.NombreCompleto} (Guardia 12h) ya tiene registrado un Almuerzo para el día de hoy en el servicio "${sNombre}".`);
                    }
                }
            }
            if (isAlmuerzo && o.almuerzoDieta) {
                const almuerzoExistente = yield prisma.pedidosComida.findFirst({
                    where: {
                        FechaPedido: today,
                        TipoComida: 'Almuerzo',
                        Personal: { DNI: personal.DNI }
                    },
                    include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
                });
                if (almuerzoExistente) {
                    const sNombre = ((_l = (_k = almuerzoExistente.SolicitadoPor) === null || _k === void 0 ? void 0 : _k.Servicio) === null || _l === void 0 ? void 0 : _l.Nombre) || ((_o = (_m = almuerzoExistente.Personal) === null || _m === void 0 ? void 0 : _m.Servicio) === null || _o === void 0 ? void 0 : _o.Nombre) || 'otro servicio';
                    throw new Error(`El agente ${personal.NombreCompleto} ya tiene un Almuerzo solicitado en el servicio "${sNombre}".`);
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
                const cenaExistente = yield prisma.pedidosComida.findFirst({
                    where: {
                        FechaPedido: today,
                        TipoComida: 'Cena',
                        Personal: { DNI: personal.DNI }
                    },
                    include: { SolicitadoPor: { include: { Servicio: true } }, Personal: { include: { Servicio: true } } }
                });
                if (cenaExistente) {
                    const sNombre = ((_q = (_p = cenaExistente.SolicitadoPor) === null || _p === void 0 ? void 0 : _p.Servicio) === null || _q === void 0 ? void 0 : _q.Nombre) || ((_s = (_r = cenaExistente.Personal) === null || _r === void 0 ? void 0 : _r.Servicio) === null || _s === void 0 ? void 0 : _s.Nombre) || 'otro servicio';
                    throw new Error(`El agente ${personal.NombreCompleto} ya tiene una Cena solicitada en el servicio "${sNombre}".`);
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
            yield prisma.pedidosComida.createMany({ data: newOrders });
        }
        res.json({ message: 'Pedidos guardados exitosamente' });
    }
    catch (error) {
        console.error('Bulk save error:', error);
        res.status(500).json({ error: 'Error al guardar pedidos: ' + (error.message || error.toString()) });
    }
}));
// 5.2 Crear solicitud de emergencia
app.post('/api/emergencies', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const nombreCompleto = req.body.nombreCompleto || req.body.nombre || (req.body.apellido ? `${req.body.apellido} ${req.body.nombre}` : '');
    const { dni, periodoInicio, periodoFin, tipoComida, tipoDieta, tipoDietaCena, justificacion, solicitadoPorUsuarioId, reemplazaId, esExcepcional, tipoSolicitud } = req.body;
    const isExcepcional = Boolean(esExcepcional || tipoSolicitud === 'reemplazo_excepcional');
    // Validate authorization deadlines solo si NO es reemplazo excepcional
    let comidasToCheck = tipoComida === 'Ambos' ? ['Almuerzo', 'Cena'] : [tipoComida || 'Almuerzo'];
    if (!isExcepcional) {
        for (const tc of comidasToCheck) {
            const errorMsg = yield checkAuthDeadlines(solicitadoPorUsuarioId, tc);
            if (errorMsg) {
                res.status(400).json({ error: `${errorMsg} Para emergencias de última hora utilice la opción ⚡ Reemplazo Excepcional.` });
                return;
            }
        }
    }
    try {
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const start = today;
        const end = today;
        // Si es reemplazo excepcional con titular, obtener la comida/dieta del titular asignado si no se especificaron
        let finalTipoDieta = tipoDieta || 'Normal';
        if (isExcepcional && reemplazaId) {
            const pedidoTitular = yield prisma.pedidosComida.findFirst({
                where: { PersonalId: Number(reemplazaId), FechaPedido: start }
            });
            if (pedidoTitular) {
                comidasToCheck = [pedidoTitular.TipoComida];
                finalTipoDieta = pedidoTitular.TipoDieta;
            }
        }
        // Validar si ya existe un reemplazo activo para el agente titular en las fechas/comidas solicitadas
        if (reemplazaId) {
            const titular = yield prisma.personal.findUnique({ where: { Id: Number(reemplazaId) } });
            let currentCheck = new Date(start);
            while (currentCheck <= end) {
                for (const tc of comidasToCheck) {
                    const existente = yield prisma.pedidosComida.findFirst({
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
                    const existenteDni = yield prisma.pedidosComida.findFirst({
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
                    const existentePlanilla = yield prisma.pedidosComida.findFirst({
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
                        const agenteNombre = ((_a = existentePlanilla.Personal) === null || _a === void 0 ? void 0 : _a.NombreCompleto) || `con DNI ${dni}`;
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
                    SolicitadoPorUsuarioId: solicitadoPorUsuarioId,
                    Estado: isExcepcional ? 'Aprobado' : 'Pendiente',
                    EmergenciaNombreCompleto: nombreCompleto || '',
                    EmergenciaDNI: dni || '',
                    EmergenciaPeriodoInicio: start,
                    EmergenciaPeriodoFin: end,
                    EmergenciaReemplazaId: reemplazaId ? Number(reemplazaId) : null,
                    JustificacionSolicitud: justificacion || (isExcepcional ? 'Reemplazo excepcional de última hora' : null),
                    EsExcepcional: isExcepcional
                });
            }
            current.setDate(current.getDate() + 1);
        }
        yield prisma.pedidosComida.createMany({ data: newOrders });
        yield (0, audit_1.logAudit)(req, isExcepcional ? 'REEMPLAZO_EXCEPCIONAL' : 'ALTA_EMERGENCIA', `Solicitud de emergencia (${isExcepcional ? 'Excepcional' : 'Normal'}) creada para DNI ${dni} del ${start.toISOString().split('T')[0]} al ${end.toISOString().split('T')[0]}`);
        res.json({ message: isExcepcional ? 'Reemplazo excepcional registrado exitosamente.' : 'Solicitudes de emergencia creadas y pendientes de aprobación.' });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear solicitud de emergencia' });
    }
}));
// 5.3 Obtener solicitudes de emergencia pendientes para el Gerente
app.get('/api/emergencies/pending', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!hospitalId) {
        res.status(403).json({ error: 'El usuario no tiene hospital asignado' });
        return;
    }
    try {
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const pending = yield prisma.pedidosComida.findMany({
            where: {
                Estado: 'Pendiente',
                FechaPedido: today,
                SolicitadoPor: { HospitalId: hospitalId }
            },
            include: {
                SolicitadoPor: { include: { Servicio: true, Hospital: true } },
                PersonalReemplazado: { include: { Servicio: true, Hospital: true } },
                Personal: { include: { Servicio: true, Hospital: true } }
            }
        });
        const dnis = pending
            .filter(p => (!p.EmergenciaNombreCompleto || p.EmergenciaNombreCompleto.trim() === '') && p.EmergenciaDNI)
            .map(p => p.EmergenciaDNI);
        if (dnis.length > 0) {
            const padronList = yield prisma.padronHabilitados.findMany({
                where: { DNI: { in: dnis } }
            });
            const padronMap = new Map(padronList.map(p => [p.DNI, p.NombreCompleto]));
            const personalList = yield prisma.personal.findMany({
                where: { DNI: { in: dnis } }
            });
            const personalMap = new Map(personalList.map(p => [p.DNI, p.NombreCompleto]));
            const enrichedPending = pending.map(p => {
                if ((!p.EmergenciaNombreCompleto || p.EmergenciaNombreCompleto.trim() === '') && p.EmergenciaDNI) {
                    const foundName = padronMap.get(p.EmergenciaDNI) || personalMap.get(p.EmergenciaDNI) || '';
                    return Object.assign(Object.assign({}, p), { EmergenciaNombreCompleto: foundName });
                }
                return p;
            });
            res.json(enrichedPending);
            return;
        }
        res.json(pending);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
}));
// 5.3.4 Obtener solicitudes de emergencia aprobadas del día para el Gerente
app.get('/api/emergencies/approved', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!hospitalId) {
        res.status(403).json({ error: 'El usuario no tiene hospital asignado' });
        return;
    }
    try {
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const approved = yield prisma.pedidosComida.findMany({
            where: {
                Estado: 'Aprobado',
                FechaPedido: today,
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
        res.json(approved);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener emergencias aprobadas' });
    }
}));
// 5.3.5 Obtener solicitudes de emergencia rechazadas del día para el Gerente
app.get('/api/emergencies/rejected', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!hospitalId) {
        res.status(403).json({ error: 'El usuario no tiene hospital asignado' });
        return;
    }
    try {
        const now = new Date();
        const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const rejected = yield prisma.pedidosComida.findMany({
            where: {
                Estado: 'Rechazado',
                FechaPedido: today,
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
        res.json(rejected);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener emergencias rechazadas' });
    }
}));
// 5.3.6 Historial de emergencias
app.get('/api/emergencies/history', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || Number(req.query.userId);
    if (!userId) {
        res.status(400).json({ error: 'Usuario no especificado' });
        return;
    }
    try {
        const fiveDaysAgo = new Date();
        fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
        const fiveDaysAgoUTC = new Date(Date.UTC(fiveDaysAgo.getFullYear(), fiveDaysAgo.getMonth(), fiveDaysAgo.getDate()));
        const history = yield prisma.pedidosComida.findMany({
            where: {
                SolicitadoPorUsuarioId: userId,
                OR: [
                    { JustificacionSolicitud: { not: null } },
                    { EmergenciaReemplazaId: { not: null } }
                ],
                FechaPedido: { gte: fiveDaysAgoUTC }
            },
            orderBy: { Id: 'desc' },
            include: { PersonalReemplazado: true, EvaluadoPor: true }
        });
        res.json(history);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener historial' });
    }
}));
// 5.4 Aprobar, Rechazar o Revertir emergencia
app.post('/api/emergencies/:id/resolve', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { id } = req.params;
    const { estado, justificacionResolucion, evaluadoPorUsuarioId } = req.body; // estado: 'Aprobado', 'Rechazado' o 'Pendiente'
    if (estado === 'Rechazado' && (!justificacionResolucion || justificacionResolucion.trim() === '')) {
        res.status(400).json({ error: 'La justificación es obligatoria al rechazar una solicitud.' });
        return;
    }
    try {
        const pedido = yield prisma.pedidosComida.findUnique({
            where: { Id: Number(id) },
            include: { SolicitadoPor: { include: { Hospital: true } } }
        });
        if (!pedido) {
            res.status(404).json({ error: 'Solicitud de emergencia no encontrada' });
            return;
        }
        const hospital = (_a = pedido.SolicitadoPor) === null || _a === void 0 ? void 0 : _a.Hospital;
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
        yield prisma.pedidosComida.update({
            where: { Id: Number(id) },
            data: {
                Estado: estado,
                JustificacionResolucion: isPending ? null : (justificacionResolucion || (estado === 'Aprobado' ? 'Aprobado sin observaciones' : null)),
                EvaluadoPorUsuarioId: isPending ? null : (evaluadoPorUsuarioId || ((_b = req.user) === null || _b === void 0 ? void 0 : _b.userId))
            }
        });
        yield (0, audit_1.logAudit)(req, isPending ? 'REVERTIR_EMERGENCIA' : 'AUTORIZACION_EMERGENCIA', `Solicitud de emergencia ID ${id} - ${estado}`);
        res.json({ message: isPending ? 'Solicitud devuelta a estado pendiente exitosamente.' : `Solicitud ${estado.toLowerCase()} exitosamente.` });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al resolver la solicitud' });
    }
}));
// 5.5 Eliminar solicitud de emergencia pendiente
app.delete('/api/emergencies/:id', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const pedido = yield prisma.pedidosComida.findUnique({
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
        yield prisma.pedidosComida.delete({
            where: { Id: Number(id) }
        });
        yield (0, audit_1.logAudit)(req, 'ELIMINAR_EMERGENCIA', `Solicitud de emergencia ID ${id} eliminada`);
        res.json({ message: 'Solicitud de emergencia eliminada exitosamente.' });
    }
    catch (error) {
        console.error('Error deleting emergency:', error);
        res.status(500).json({ error: 'Error al eliminar la solicitud de emergencia.' });
    }
}));
// 6.1 Reportes con filtros
app.get('/api/reports', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { fechaInicio, fechaFin, hospitalId, servicioId, personalId } = req.query;
    const user = req.user;
    try {
        let whereClause = {};
        if (fechaInicio && fechaFin) {
            const startStr = fechaInicio;
            const endStr = fechaFin;
            const start = new Date(`${startStr}T00:00:00.000Z`);
            const end = new Date(`${endStr}T23:59:59.999Z`);
            whereClause.FechaPedido = { gte: start, lte: end };
        }
        // Role-based filtering
        if ((user === null || user === void 0 ? void 0 : user.roleId) === 3) {
            // JEFE_SERVICIO: ver todos los pedidos pertenecientes a su servicio
            if (user.servicioId) {
                whereClause.OR = [
                    { SolicitadoPor: { ServicioId: user.servicioId } },
                    { Personal: { ServicioId: user.servicioId } }
                ];
            }
            else {
                whereClause.SolicitadoPorUsuarioId = user.userId;
            }
        }
        else if ((user === null || user === void 0 ? void 0 : user.roleId) === 2) {
            // GERENTE: solo ver su hospital
            whereClause.SolicitadoPor = {
                HospitalId: user.hospitalId
            };
        }
        if (personalId) {
            whereClause.PersonalId = Number(personalId);
        }
        const report = yield prisma.pedidosComida.findMany({
            where: whereClause,
            include: {
                Personal: { include: { Servicio: true, Hospital: true } },
                PersonalReemplazado: { include: { Servicio: true, Hospital: true } },
                SolicitadoPor: { include: { Servicio: true, Hospital: true } }
            }
        });
        // Filtrado manual simple
        let filteredReport = report;
        if ((user === null || user === void 0 ? void 0 : user.roleId) !== 2 && hospitalId) {
            filteredReport = filteredReport.filter(r => { var _a, _b; return ((_a = r.Personal) === null || _a === void 0 ? void 0 : _a.HospitalId) === Number(hospitalId) || ((_b = r.SolicitadoPor) === null || _b === void 0 ? void 0 : _b.HospitalId) === Number(hospitalId); });
        }
        if ((user === null || user === void 0 ? void 0 : user.roleId) !== 3 && servicioId) {
            filteredReport = filteredReport.filter(r => { var _a, _b; return ((_a = r.Personal) === null || _a === void 0 ? void 0 : _a.ServicioId) === Number(servicioId) || ((_b = r.SolicitadoPor) === null || _b === void 0 ? void 0 : _b.ServicioId) === Number(servicioId); });
        }
        // Enriquecer registros que carezcan de Servicio consultando Padrón / Personal por DNI
        const dnisToLookup = [...new Set(filteredReport
                .filter(r => { var _a, _b, _c; return !((_a = r.Personal) === null || _a === void 0 ? void 0 : _a.Servicio) && !((_b = r.PersonalReemplazado) === null || _b === void 0 ? void 0 : _b.Servicio) && !((_c = r.SolicitadoPor) === null || _c === void 0 ? void 0 : _c.Servicio) && r.EmergenciaDNI; })
                .map(r => r.EmergenciaDNI))];
        let padronMap = new Map();
        if (dnisToLookup.length > 0) {
            const padronEntries = yield prisma.padronHabilitados.findMany({
                where: { DNI: { in: dnisToLookup } },
                include: { Servicio: true }
            });
            padronEntries.forEach(p => {
                if (p.Servicio)
                    padronMap.set(p.DNI, p.Servicio);
            });
            const remainingDnis = dnisToLookup.filter(d => !padronMap.has(d));
            if (remainingDnis.length > 0) {
                const personalEntries = yield prisma.personal.findMany({
                    where: { DNI: { in: remainingDnis } },
                    include: { Servicio: true }
                });
                personalEntries.forEach(p => {
                    if (p.Servicio)
                        padronMap.set(p.DNI, p.Servicio);
                });
            }
        }
        const finalReport = filteredReport.map(r => {
            var _a, _b, _c;
            let servicio = ((_a = r.Personal) === null || _a === void 0 ? void 0 : _a.Servicio) ||
                ((_b = r.PersonalReemplazado) === null || _b === void 0 ? void 0 : _b.Servicio) ||
                ((_c = r.SolicitadoPor) === null || _c === void 0 ? void 0 : _c.Servicio) ||
                (r.EmergenciaDNI ? padronMap.get(r.EmergenciaDNI) : null) ||
                null;
            return Object.assign(Object.assign({}, r), { Servicio: servicio });
        });
        res.json(finalReport);
    }
    catch (error) {
        res.status(500).json({ error: 'Error al generar el reporte' });
    }
}));
// --- RRHH / ADMIN ENDPOINTS ---
app.post('/api/hospitals', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) !== 1) {
        res.status(403).json({ error: 'No autorizado. Solo RRHH/Admin.' });
        return;
    }
    const { nombre, codigo } = req.body;
    try {
        const hospital = yield prisma.hospitales.create({
            data: { Nombre: nombre, Codigo: codigo || nombre.substring(0, 5).toUpperCase() }
        });
        res.json({ message: 'Hospital creado', hospital });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al crear hospital' });
    }
}));
app.get('/api/hospitals', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const hospitales = yield prisma.hospitales.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener hospitales' });
    }
}));
app.post('/api/users/gerente', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) !== 1) {
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
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma.usuarios.create({
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
    }
    catch (error) {
        console.error(error);
        if (error.code === 'P2002') {
            res.status(400).json({ error: 'Ese nombre de usuario ya está en uso. Por favor, elige otro.' });
        }
        else {
            res.status(500).json({ error: 'Error al crear gerente' });
        }
    }
}));
app.get('/api/admin/auditoria', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const roleId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId;
    if (roleId !== 1 && roleId !== 2) { // 1 = Admin, 2 = Gerente
        res.status(403).json({ error: 'No autorizado para ver registros de auditoría.' });
        return;
    }
    try {
        let whereClause = {};
        if (roleId === 2) {
            // Gerente: solo acciones de Jefes de Servicio (roleId 3) de su propio efector
            const hospitalId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.hospitalId;
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
        const logs = yield prisma.auditoria.findMany({
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
    }
    catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Error al obtener registros de auditoría' });
    }
}));
// 8. Configuración de Horarios
app.get('/api/hospital/config', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    if (!hospitalId) {
        res.status(400).json({ error: 'Hospital no especificado' });
        return;
    }
    try {
        const hospital = yield prisma.hospitales.findUnique({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Error al obtener configuración' });
    }
}));
app.put('/api/hospital/config', auth_1.authenticateToken, auth_1.isGerente, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const hospitalId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.hospitalId;
    const { limiteAlmuerzo, limiteCena, limiteAutorizacionAlmuerzo, limiteAutorizacionCena, dietasHabilitadas } = req.body;
    if (!hospitalId) {
        res.status(400).json({ error: 'Hospital no especificado' });
        return;
    }
    const toMins = (hStr) => {
        if (!hStr)
            return null;
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
        const updated = yield prisma.hospitales.update({
            where: { Id: hospitalId },
            data: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, (limiteAlmuerzo ? { LimiteAlmuerzo: limiteAlmuerzo } : {})), (limiteCena ? { LimiteCena: limiteCena } : {})), (limiteAutorizacionAlmuerzo ? { LimiteAutorizacionAlmuerzo: limiteAutorizacionAlmuerzo } : {})), (limiteAutorizacionCena ? { LimiteAutorizacionCena: limiteAutorizacionCena } : {})), (dietasHabilitadas !== undefined ? { DietasHabilitadas: dietasHabilitadas } : {}))
        });
        res.json({ message: 'Configuración actualizada', data: updated });
    }
    catch (error) {
        res.status(500).json({ error: 'Error al actualizar configuración' });
    }
}));
app.post('/api/personal/bulk', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (((_a = req.user) === null || _a === void 0 ? void 0 : _a.roleId) !== 1) {
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
        const getRowVal = (r, ...possibleKeys) => {
            for (const pk of possibleKeys) {
                if (r[pk] !== undefined && r[pk] !== null)
                    return r[pk];
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
        for (const row of data) {
            const docVal = getRowVal(row, 'documento', 'dni', 'num_doc', 'numdoc');
            const agenteVal = getRowVal(row, 'agente', 'nombre', 'nombrecompleto', 'agente_nombre');
            if (!docVal || !agenteVal)
                continue;
            const efectorStr = String(getRowVal(row, 'efector', 'hospital', 'establecimiento') || '').trim();
            const servicioStr = String(getRowVal(row, 'servicio', 'area', 'sector') || '').trim();
            let hospital = yield prisma.hospitales.findFirst({ where: { Nombre: efectorStr } });
            if (!hospital) {
                const todosHospitales = yield prisma.hospitales.findMany();
                hospital = todosHospitales.find(h => h.Nombre.trim().toLowerCase() === efectorStr.toLowerCase()) || null;
            }
            if (!hospital) {
                const uniqueCode = efectorStr.substring(0, 3).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
                hospital = yield prisma.hospitales.create({
                    data: { Nombre: efectorStr, Codigo: uniqueCode }
                });
            }
            let servicio = yield prisma.servicios.findFirst({ where: { Nombre: servicioStr, HospitalId: hospital.Id } });
            if (!servicio) {
                const todosServicios = yield prisma.servicios.findMany({ where: { HospitalId: hospital.Id } });
                servicio = todosServicios.find(s => s.Nombre.trim().toLowerCase() === servicioStr.toLowerCase()) || null;
            }
            if (!servicio) {
                servicio = yield prisma.servicios.create({
                    data: { Nombre: servicioStr, HospitalId: hospital.Id }
                });
            }
            const nombreCompleto = String(agenteVal).trim();
            const isTruthy = (v) => {
                if (!v)
                    return false;
                const str = String(v).trim().toLowerCase();
                return str === 's' || str === 'si' || str === 'sí' || str === 'true' || str === '1' || v === true || v === 1;
            };
            const isGuardia24 = isTruthy(getRowVal(row, 'esguardia24', 'esguardia24h', 'guardia24', 'guardia24h', 'g24'));
            const isGuardia12 = isTruthy(getRowVal(row, 'esguardia12', 'esguardia12h', 'guardia12', 'guardia12h', 'g12'));
            const conVianda = isTruthy(getRowVal(row, 'con_vianda', 'convianda', 'vianda'));
            const dniStr = String(docVal).trim();
            yield prisma.personal.upsert({
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
            yield prisma.padronHabilitados.upsert({
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
        yield (0, audit_1.logAudit)(req, 'IMPORTACION_EXCEL', `Se procesaron e importaron ${imported} registros desde archivo Excel`);
        res.json({ message: 'Importacion completada', count: imported });
    }
    catch (error) {
        console.error('Error importing personal:', error);
        res.status(500).json({ error: 'Error al importar datos' });
    }
}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
