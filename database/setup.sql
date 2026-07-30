-- ============================================================
--  SCRIPT DE SETUP - Sistema de Pedidos de Comida
--  Ejecutar en SQL Server Management Studio o sqlcmd
--  Crea la base de datos, tablas y datos de prueba
-- ============================================================

-- 1. Crear la base de datos
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ComidaDB')
BEGIN
    CREATE DATABASE ComidaDB;
END
GO

USE ComidaDB;
GO

-- 2. Crear tablas (solo si no existen)

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Roles' AND xtype='U')
CREATE TABLE Roles (
    Id   INT PRIMARY KEY,
    Nombre NVARCHAR(50) NOT NULL
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Hospitales' AND xtype='U')
CREATE TABLE Hospitales (
    Id     INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(100) NOT NULL,
    Codigo NVARCHAR(20)  UNIQUE NOT NULL
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Servicios' AND xtype='U')
CREATE TABLE Servicios (
    Id         INT IDENTITY(1,1) PRIMARY KEY,
    HospitalId INT NOT NULL FOREIGN KEY REFERENCES Hospitales(Id),
    Nombre     NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_Servicio_Hospital UNIQUE (HospitalId, Nombre)
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Personal' AND xtype='U')
CREATE TABLE Personal (
    Id             INT IDENTITY(1,1) PRIMARY KEY,
    DNI            NVARCHAR(20)  UNIQUE NOT NULL,
    Nombre         NVARCHAR(100) NOT NULL,
    Apellido       NVARCHAR(100) NOT NULL,
    HospitalId     INT NOT NULL FOREIGN KEY REFERENCES Hospitales(Id),
    ServicioId     INT NOT NULL FOREIGN KEY REFERENCES Servicios(Id),
    Horario        NVARCHAR(50)  NOT NULL,
    PeriodoInicio  DATE NOT NULL,
    PeriodoFin     DATE NOT NULL,
    Activo         BIT DEFAULT 1
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Usuarios' AND xtype='U')
CREATE TABLE Usuarios (
    Id                   INT IDENTITY(1,1) PRIMARY KEY,
    NombreUsuario        NVARCHAR(50)  UNIQUE NOT NULL,
    NombreCompleto       NVARCHAR(200) NULL,
    ContrasenaHash       NVARCHAR(255) NOT NULL,
    RolId                INT NOT NULL FOREIGN KEY REFERENCES Roles(Id),
    HospitalId           INT NULL FOREIGN KEY REFERENCES Hospitales(Id),
    ServicioId           INT NULL FOREIGN KEY REFERENCES Servicios(Id),
    TwoFactorSecret      NVARCHAR(128) NULL,
    TwoFactorHabilitado  BIT DEFAULT 0,
    DebeCambiarContrasena BIT DEFAULT 0
);
GO

IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='PedidosComida' AND xtype='U')
CREATE TABLE PedidosComida (
    Id                      INT IDENTITY(1,1) PRIMARY KEY,
    FechaPedido             DATE NOT NULL,
    TipoComida              NVARCHAR(20) NOT NULL CHECK (TipoComida IN ('Almuerzo', 'Cena')),
    TipoDieta               NVARCHAR(30) NOT NULL DEFAULT 'Normal'
                                CHECK (TipoDieta IN ('Normal','Gastrica','Diabetica','Hepatico','Vegetariano','Celiaca')),
    PersonalId              INT NULL FOREIGN KEY REFERENCES Personal(Id),
    SolicitadoPorUsuarioId  INT NOT NULL FOREIGN KEY REFERENCES Usuarios(Id),
    Estado                  NVARCHAR(20) NOT NULL DEFAULT 'Aprobado'
                                CHECK (Estado IN ('Aprobado','Pendiente','Aceptado','Rechazado')),
    EmergenciaNombre        NVARCHAR(100) NULL,
    EmergenciaApellido      NVARCHAR(100) NULL,
    EmergenciaDNI           NVARCHAR(20)  NULL,
    EmergenciaPeriodoInicio DATE NULL,
    EmergenciaPeriodoFin    DATE NULL,
    JustificacionSolicitud  NVARCHAR(500) NULL,
    JustificacionResolucion NVARCHAR(500) NULL,
    EvaluadoPorUsuarioId    INT NULL FOREIGN KEY REFERENCES Usuarios(Id)
);
GO

-- 3. Datos de prueba

-- Roles
IF NOT EXISTS (SELECT 1 FROM Roles)
BEGIN
    INSERT INTO Roles (Id, Nombre) VALUES (1, 'RRHH_Global');
    INSERT INTO Roles (Id, Nombre) VALUES (2, 'Gerente_Hospital');
    INSERT INTO Roles (Id, Nombre) VALUES (3, 'Jefe_Servicio');
END
GO

-- Hospitales
IF NOT EXISTS (SELECT 1 FROM Hospitales)
BEGIN
    INSERT INTO Hospitales (Nombre, Codigo) VALUES ('Hospital Central', 'H-CEN');
    INSERT INTO Hospitales (Nombre, Codigo) VALUES ('Hospital Norte',   'H-NOR');
END
GO

-- Servicios
IF NOT EXISTS (SELECT 1 FROM Servicios)
BEGIN
    INSERT INTO Servicios (HospitalId, Nombre) VALUES (1, 'Guardia Medica');
    INSERT INTO Servicios (HospitalId, Nombre) VALUES (1, 'Terapia Intensiva');
    INSERT INTO Servicios (HospitalId, Nombre) VALUES (2, 'Pediatria');
    INSERT INTO Servicios (HospitalId, Nombre) VALUES (2, 'Clinica Medica');
END
GO

-- Personal de prueba
IF NOT EXISTS (SELECT 1 FROM Personal)
BEGIN
    INSERT INTO Personal (DNI, Nombre, Apellido, HospitalId, ServicioId, Horario, PeriodoInicio, PeriodoFin)
    VALUES
        ('20111111', 'Maria',   'Lopez',    1, 1, 'Guardia 24h',         '2025-01-01', '2025-12-31'),
        ('20222222', 'Carlos',  'Gomez',    1, 1, 'Guardia 12h',         '2025-01-01', '2025-12-31'),
        ('20333333', 'Ana',     'Martinez', 1, 2, 'Extension Horaria',   '2025-01-01', '2025-12-31'),
        ('20444444', 'Pedro',   'Sanchez',  2, 3, 'Guardia 24h',         '2025-01-01', '2025-12-31'),
        ('20555555', 'Laura',   'Fernandez',2, 3, 'Guardia 12h',         '2025-01-01', '2025-12-31'),
        ('20666666', 'Diego',   'Torres',   2, 4, 'Extension Horaria',   '2025-01-01', '2025-12-31');
END
GO

-- Usuarios de prueba
-- Contrasenas (en texto plano para referencia):
--   admin_rrhh    -> admin123
--   gerente_cen   -> gerente123
--   jefe_guardia  -> jefe123
IF NOT EXISTS (SELECT 1 FROM Usuarios)
BEGIN
    -- RRHH Global (acceso a todos los hospitales)
    INSERT INTO Usuarios (NombreUsuario, ContrasenaHash, RolId, HospitalId, ServicioId)
    VALUES ('admin_rrhh', '$2b$10$1hnbroYCMzqmS3HBLpFd..WbPiqiQtZ3c3jAJpYqhDtLUfGyqm6qC', 1, NULL, NULL);

    -- Gerente Hospital Central
    INSERT INTO Usuarios (NombreUsuario, ContrasenaHash, RolId, HospitalId, ServicioId)
    VALUES ('gerente_cen', '$2b$10$cW3p.CwQjtjgkl1AQOaywuZ03QD7aIhRBAmoYI3C7IbiSOdlbKaoO', 2, 1, NULL);

    -- Jefe Guardia Medica (Hospital Central)
    INSERT INTO Usuarios (NombreUsuario, ContrasenaHash, RolId, HospitalId, ServicioId)
    VALUES ('jefe_guardia', '$2b$10$8nnRyEgMv4QkN/Qssdv/duvDIoLfuXH.S/N7kU/2u7pYiLbSIZZzq', 3, 1, 1);
END
GO

-- ============================================================
--  RESUMEN DE USUARIOS DE PRUEBA
-- ============================================================
--
--  Usuario        | Contraseña   | Rol              | Hospital
--  ---------------|--------------|------------------|----------------
--  admin_rrhh     | admin123     | RRHH_Global      | (todos)
--  gerente_cen    | gerente123   | Gerente_Hospital  | Hospital Central
--  jefe_guardia   | jefe123      | Jefe_Servicio    | Guardia Medica
--
--  NOTA: El sistema usa 2FA (TOTP). Al hacer login por primera
--  vez, el sistema generara un QR para configurar el autenticador.
-- ============================================================

PRINT 'Setup completado correctamente.';
GO
