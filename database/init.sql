-- Tabla de Hospitales (Efectores)
CREATE TABLE Hospitales (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(100) NOT NULL,
    Codigo NVARCHAR(20) UNIQUE NOT NULL
);

-- Tabla de Servicios por Hospital
CREATE TABLE Servicios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    HospitalId INT NOT NULL FOREIGN KEY REFERENCES Hospitales(Id),
    Nombre NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_Servicio_Hospital UNIQUE (HospitalId, Nombre)
);

-- Tabla de Personal Autorizado (Importado mensualmente)
CREATE TABLE Personal (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    DNI NVARCHAR(20) UNIQUE NOT NULL,
    Nombre NVARCHAR(100) NOT NULL,
    Apellido NVARCHAR(100) NOT NULL,
    HospitalId INT NOT NULL FOREIGN KEY REFERENCES Hospitales(Id),
    ServicioId INT NOT NULL FOREIGN KEY REFERENCES Servicios(Id),
    Horario NVARCHAR(50) NOT NULL, -- Guardia 12h, 24h, Extensión Horaria
    PeriodoInicio DATE NOT NULL,
    PeriodoFin DATE NOT NULL,
    Activo BIT DEFAULT 1
);

-- Tabla de Roles de Usuario
CREATE TABLE Roles (
    Id INT PRIMARY KEY, -- 1: RRHH_Global, 2: Gerente_Hospital, 3: Jefe_Servicio
    Nombre NVARCHAR(50) NOT NULL
);

-- Tabla de Usuarios del Sistema (Logueo)
CREATE TABLE Usuarios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    NombreUsuario NVARCHAR(50) UNIQUE NOT NULL,
    ContrasenaHash NVARCHAR(255) NOT NULL,
    RolId INT NOT NULL FOREIGN KEY REFERENCES Roles(Id),
    HospitalId INT NULL FOREIGN KEY REFERENCES Hospitales(Id), -- NULL para RRHH Global
    ServicioId INT NULL FOREIGN KEY REFERENCES Servicios(Id),   -- NULL para Gerentes y RRHH
    TwoFactorSecret NVARCHAR(128) NULL,
    TwoFactorHabilitado BIT DEFAULT 0
);

-- Tabla de Pedidos de Menú
CREATE TABLE PedidosComida (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    FechaPedido DATE NOT NULL,
    TipoComida NVARCHAR(20) NOT NULL CHECK (TipoComida IN ('Almuerzo', 'Cena')),
    TipoDieta NVARCHAR(30) NOT NULL DEFAULT 'Normal' CHECK (TipoDieta IN ('Normal', 'Gastrica', 'Diabetica', 'Hepatico', 'Vegetariano', 'Celiaca')),
    PersonalId INT NULL FOREIGN KEY REFERENCES Personal(Id), -- NULL para pedidos de emergencia fuera de lista
    SolicitadoPorUsuarioId INT NOT NULL FOREIGN KEY REFERENCES Usuarios(Id),
    Estado NVARCHAR(20) NOT NULL DEFAULT 'Aprobado' CHECK (Estado IN ('Aprobado', 'Pendiente', 'Aceptado', 'Rechazado')),
    -- Campos exclusivos para solicitudes de Emergencia
    EmergenciaNombre NVARCHAR(100) NULL,
    EmergenciaApellido NVARCHAR(100) NULL,
    EmergenciaDNI NVARCHAR(20) NULL,
    EmergenciaPeriodoInicio DATE NULL,
    EmergenciaPeriodoFin DATE NULL,
    JustificacionSolicitud NVARCHAR(500) NULL,
    JustificacionResolucion NVARCHAR(500) NULL,
    EvaluadoPorUsuarioId INT NULL FOREIGN KEY REFERENCES Usuarios(Id)
);

-- Insertar Datos Semilla
-- Roles
INSERT INTO Roles (Id, Nombre) VALUES (1, 'RRHH_Global');
INSERT INTO Roles (Id, Nombre) VALUES (2, 'Gerente_Hospital');
INSERT INTO Roles (Id, Nombre) VALUES (3, 'Jefe_Servicio');

-- Hospitales de Prueba
INSERT INTO Hospitales (Nombre, Codigo) VALUES ('Hospital Central', 'H-CEN');
INSERT INTO Hospitales (Nombre, Codigo) VALUES ('Hospital Norte', 'H-NOR');

-- Servicios de Prueba
INSERT INTO Servicios (HospitalId, Nombre) VALUES (1, 'Guardia Medica');
INSERT INTO Servicios (HospitalId, Nombre) VALUES (1, 'Terapia Intensiva');
INSERT INTO Servicios (HospitalId, Nombre) VALUES (2, 'Pediatria');
