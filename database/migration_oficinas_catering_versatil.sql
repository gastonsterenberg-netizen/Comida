-- ==============================================================================
-- SCRIPT DE MIGRACIÓN: FASE 5 - MÓDULO OFICINAS PÚBLICAS Y CATERING VERSÁTIL
-- ==============================================================================
-- BASE DE DATOS: ComidaDB (SQL Server)
-- FECHA: Octubre 2026
--
-- REGLA DE ORO DE DEPLIEGUE:
-- NO EJECUTAR ESTE SCRIPT ESTA NOCHE.
-- Este script corresponde a la Fase 5 y debe ejecutarse ÚNICAMENTE después de que
-- la Fase 1 a 4 (normalización de hospitales) haya funcionado sin novedades
-- en el entorno de producción durante la jornada del lunes.
--
-- MODELO DE NEGOCIO SOPORTADO (CATERING VERSÁTIL):
-- 1. Platos del Día / Menú Completo (Cerrados / 1 sola cosa):
--    Ej: Pastel de papa, Cazuela de lentejas. (No requieren acompañamiento).
-- 2. Menú para Armar (Plato Principal + Acompañamiento a elección):
--    Ej: Milanesa o Pechuga + Puré, Papas fritas o Ensalada.
-- 3. Máxima versatilidad: Cada oficina tiene su proveedor con su propio menú
--    y estructura diaria (1, 2 o N opciones según el proveedor de cada sede).
-- ==============================================================================

USE [ComidaDB];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT '==============================================================================';
PRINT 'INICIANDO MIGRACIÓN FASE 5: OFICINAS PÚBLICAS Y CATERING VERSÁTIL';
PRINT '==============================================================================';

-- ------------------------------------------------------------------------------
-- 1. REUTILIZAR ROL "Encargado_Oficina" (RolId = 4)
--    Reutiliza el Rol 4 que originalmente figuraba como "RRHH" y está en desuso
-- ------------------------------------------------------------------------------
IF EXISTS (SELECT 1 FROM Roles WHERE Id = 4)
BEGIN
    UPDATE Roles SET Nombre = 'Encargado_Oficina' WHERE Id = 4;
    PRINT '-> [OK] Rol Id=4 actualizado a "Encargado_Oficina" (reutilizando RRHH).';
END
ELSE
BEGIN
    INSERT INTO Roles (Id, Nombre) VALUES (4, 'Encargado_Oficina');
    PRINT '-> [OK] Rol Id=4 (Encargado_Oficina) insertado en tabla Roles.';
END;
GO

-- ------------------------------------------------------------------------------
-- 2. MODIFICAR TABLA Hospitales (Diferenciación Hospitales vs Oficinas y Datos Proveedor)
--    Reutiliza LimiteAlmuerzo para la hora de cierre del pedido de viandas (ej. "10:30")
-- ------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Hospitales') AND name = 'TipoEntidad')
BEGIN
    ALTER TABLE Hospitales ADD TipoEntidad NVARCHAR(20) NOT NULL CONSTRAINT DF_Hospitales_TipoEntidad DEFAULT 'HOSPITAL';
    PRINT '-> [OK] Columna TipoEntidad agregada a Hospitales (Default: HOSPITAL).';
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Hospitales') AND name = 'ProveedorNombre')
BEGIN
    ALTER TABLE Hospitales ADD ProveedorNombre NVARCHAR(100) NULL;
    PRINT '-> [OK] Columna ProveedorNombre agregada a Hospitales.';
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Hospitales') AND name = 'ProveedorTelefono')
BEGIN
    ALTER TABLE Hospitales ADD ProveedorTelefono NVARCHAR(50) NULL;
    PRINT '-> [OK] Columna ProveedorTelefono agregada a Hospitales (WhatsApp proveedor).';
END;
GO

-- ------------------------------------------------------------------------------
-- 3. MODIFICAR TABLA PadronHabilitados (PIN para autoservicio en Oficinas)
--    Reutiliza ServicioId para Piso / Sector de la oficina (sin campos redundantes)
-- ------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PadronHabilitados') AND name = 'PinAcceso')
BEGIN
    ALTER TABLE PadronHabilitados ADD PinAcceso NVARCHAR(10) NULL;
    PRINT '-> [OK] Columna PinAcceso agregada a PadronHabilitados (PIN 4 dígitos para portal oficina).';
END;
GO

-- ------------------------------------------------------------------------------
-- 4. CREAR TABLA MenuOficinaOpciones (Platos del Día y Platos Principales)
-- ------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'MenuOficinaOpciones')
BEGIN
    CREATE TABLE MenuOficinaOpciones (
        Id INT IDENTITY(1,1) NOT NULL,
        HospitalId INT NOT NULL,
        Fecha DATE NOT NULL,
        TipoPlato NVARCHAR(20) NOT NULL CONSTRAINT DF_MenuOficinaOpciones_TipoPlato DEFAULT 'PLATO_DEL_DIA', -- 'PLATO_DEL_DIA' | 'PRINCIPAL'
        NumeroOpcion INT NOT NULL CONSTRAINT DF_MenuOficinaOpciones_NumeroOpcion DEFAULT 1,
        NombrePlato NVARCHAR(150) NOT NULL,
        PermiteGuarnicion BIT NOT NULL CONSTRAINT DF_MenuOficinaOpciones_PermiteGuarnicion DEFAULT 0, -- 0: plato completo cerrado, 1: menú para armar
        Descripcion NVARCHAR(300) NULL,
        CreadoPorUsuarioId INT NULL,
        FechaCreacion DATETIME NOT NULL CONSTRAINT DF_MenuOficinaOpciones_FechaCreacion DEFAULT GETDATE(),
        
        CONSTRAINT PK_MenuOficinaOpciones PRIMARY KEY CLUSTERED (Id ASC),
        CONSTRAINT FK_MenuOficinaOpciones_Hospitales FOREIGN KEY (HospitalId) REFERENCES Hospitales(Id),
        CONSTRAINT FK_MenuOficinaOpciones_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES Usuarios(Id)
    );

    CREATE NONCLUSTERED INDEX IX_MenuOficinaOpciones_Hospital_Fecha 
    ON MenuOficinaOpciones (HospitalId, Fecha);

    PRINT '-> [OK] Tabla MenuOficinaOpciones creada exitosamente.';
END
ELSE
BEGIN
    PRINT '-> [INFO] Tabla MenuOficinaOpciones ya existe.';
END;
GO

-- ------------------------------------------------------------------------------
-- 5. CREAR TABLA MenuOficinaGuarniciones (Acompañamientos diarios del Menú para Armar)
-- ------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'MenuOficinaGuarniciones')
BEGIN
    CREATE TABLE MenuOficinaGuarniciones (
        Id INT IDENTITY(1,1) NOT NULL,
        HospitalId INT NOT NULL,
        Fecha DATE NOT NULL,
        NombreGuarnicion NVARCHAR(100) NOT NULL, -- Ej: Puré de papas, Papas fritas, Ensalada mixta, Arroz
        CreadoPorUsuarioId INT NULL,
        FechaCreacion DATETIME NOT NULL CONSTRAINT DF_MenuOficinaGuarniciones_FechaCreacion DEFAULT GETDATE(),

        CONSTRAINT PK_MenuOficinaGuarniciones PRIMARY KEY CLUSTERED (Id ASC),
        CONSTRAINT FK_MenuOficinaGuarniciones_Hospitales FOREIGN KEY (HospitalId) REFERENCES Hospitales(Id),
        CONSTRAINT FK_MenuOficinaGuarniciones_Usuarios FOREIGN KEY (CreadoPorUsuarioId) REFERENCES Usuarios(Id)
    );

    CREATE NONCLUSTERED INDEX IX_MenuOficinaGuarniciones_Hospital_Fecha 
    ON MenuOficinaGuarniciones (HospitalId, Fecha);

    PRINT '-> [OK] Tabla MenuOficinaGuarniciones creada exitosamente.';
END
ELSE
BEGIN
    PRINT '-> [INFO] Tabla MenuOficinaGuarniciones ya existe.';
END;
GO

-- ------------------------------------------------------------------------------
-- 6. MODIFICAR TABLA PedidosComida (Vincular Plato, Guarnición y Canal de Pedido)
-- ------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'PlatoOpcionId')
BEGIN
    ALTER TABLE PedidosComida ADD PlatoOpcionId INT NULL 
        CONSTRAINT FK_PedidosComida_MenuOficinaOpciones FOREIGN KEY REFERENCES MenuOficinaOpciones(Id);
    PRINT '-> [OK] Columna PlatoOpcionId (FK) agregada a PedidosComida.';
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'GuarnicionId')
BEGIN
    ALTER TABLE PedidosComida ADD GuarnicionId INT NULL 
        CONSTRAINT FK_PedidosComida_MenuOficinaGuarniciones FOREIGN KEY REFERENCES MenuOficinaGuarniciones(Id);
    PRINT '-> [OK] Columna GuarnicionId (FK) agregada a PedidosComida.';
END;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'CanalPedido')
BEGIN
    ALTER TABLE PedidosComida ADD CanalPedido NVARCHAR(30) NULL 
        CONSTRAINT DF_PedidosComida_CanalPedido DEFAULT 'HOSPITAL'; -- 'PORTAL_EMPLEADO' | 'PANEL_ENCARGADO' | 'HOSPITAL'
    PRINT '-> [OK] Columna CanalPedido agregada a PedidosComida.';
END;
GO

-- ------------------------------------------------------------------------------
-- 7. CREAR TABLA ConsolidadosProveedor (Remitos diarios para WhatsApp y Auditoría)
-- ------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ConsolidadosProveedor')
BEGIN
    CREATE TABLE ConsolidadosProveedor (
        Id INT IDENTITY(1,1) NOT NULL,
        HospitalId INT NOT NULL,
        Fecha DATE NOT NULL,
        TotalViandas INT NOT NULL CONSTRAINT DF_ConsolidadosProveedor_TotalViandas DEFAULT 0,
        ResumenPlatosJson NVARCHAR(MAX) NULL, -- Resumen desglosado: platos del día + principales c/ guarnición
        FechaGenerado DATETIME NOT NULL CONSTRAINT DF_ConsolidadosProveedor_FechaGenerado DEFAULT GETDATE(),
        GeneradoPorUsuarioId INT NOT NULL,
        Estado NVARCHAR(30) NOT NULL CONSTRAINT DF_ConsolidadosProveedor_Estado DEFAULT 'Generado', -- 'Generado' | 'Enviado' | 'Entregado'

        CONSTRAINT PK_ConsolidadosProveedor PRIMARY KEY CLUSTERED (Id ASC),
        CONSTRAINT FK_ConsolidadosProveedor_Hospitales FOREIGN KEY (HospitalId) REFERENCES Hospitales(Id),
        CONSTRAINT FK_ConsolidadosProveedor_Usuarios FOREIGN KEY (GeneradoPorUsuarioId) REFERENCES Usuarios(Id)
    );

    CREATE NONCLUSTERED INDEX IX_ConsolidadosProveedor_Hospital_Fecha 
    ON ConsolidadosProveedor (HospitalId, Fecha);

    PRINT '-> [OK] Tabla ConsolidadosProveedor creada exitosamente.';
END
ELSE
BEGIN
    PRINT '-> [INFO] Tabla ConsolidadosProveedor ya existe.';
END;
GO

COMMIT TRANSACTION;
PRINT '==============================================================================';
PRINT 'MIGRACIÓN FASE 5 FINALIZADA CON ÉXITO EN ComidaDB';
PRINT '==============================================================================';
GO
