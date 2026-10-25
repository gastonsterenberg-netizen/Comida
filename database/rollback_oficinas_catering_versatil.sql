-- ==============================================================================
-- SCRIPT DE ROLLBACK: FASE 5 - MÓDULO OFICINAS PÚBLICAS Y CATERING VERSÁTIL
-- ==============================================================================
-- BASE DE DATOS: ComidaDB (SQL Server)
-- PROPÓSITO: Deshacer con seguridad todos los cambios de base de datos introducidos
--            por migration_oficinas_catering_versatil.sql sin afectar datos hospitalarios.
-- ==============================================================================

USE [ComidaDB];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT '==============================================================================';
PRINT 'INICIANDO ROLLBACK DE MIGRACIÓN FASE 5 (OFICINAS PÚBLICAS)';
PRINT '==============================================================================';

-- 1. Eliminar referencias y columnas en PedidosComida
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_MenuOficinaOpciones')
BEGIN
    ALTER TABLE PedidosComida DROP CONSTRAINT FK_PedidosComida_MenuOficinaOpciones;
    PRINT '-> [OK] Constraint FK_PedidosComida_MenuOficinaOpciones eliminado.';
END;

IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_MenuOficinaGuarniciones')
BEGIN
    ALTER TABLE PedidosComida DROP CONSTRAINT FK_PedidosComida_MenuOficinaGuarniciones;
    PRINT '-> [OK] Constraint FK_PedidosComida_MenuOficinaGuarniciones eliminado.';
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'PlatoOpcionId')
BEGIN
    ALTER TABLE PedidosComida DROP COLUMN PlatoOpcionId;
    PRINT '-> [OK] Columna PlatoOpcionId eliminada de PedidosComida.';
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'GuarnicionId')
BEGIN
    ALTER TABLE PedidosComida DROP COLUMN GuarnicionId;
    PRINT '-> [OK] Columna GuarnicionId eliminada de PedidosComida.';
END;

-- Eliminar DF_PedidosComida_CanalPedido si existe
DECLARE @df_canal NVARCHAR(128);
SELECT @df_canal = d.name
FROM sys.default_constraints d
JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
WHERE d.parent_object_id = OBJECT_ID('PedidosComida') AND c.name = 'CanalPedido';

IF @df_canal IS NOT NULL
BEGIN
    EXEC('ALTER TABLE PedidosComida DROP CONSTRAINT ' + @df_canal);
    PRINT '-> [OK] Default constraint ' + @df_canal + ' de CanalPedido eliminado.';
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'CanalPedido')
BEGIN
    ALTER TABLE PedidosComida DROP COLUMN CanalPedido;
    PRINT '-> [OK] Columna CanalPedido eliminada de PedidosComida.';
END;

-- 2. Eliminar tabla ConsolidadosProveedor
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'ConsolidadosProveedor')
BEGIN
    DROP TABLE ConsolidadosProveedor;
    PRINT '-> [OK] Tabla ConsolidadosProveedor eliminada.';
END;

-- 3. Eliminar tabla MenuOficinaGuarniciones
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'MenuOficinaGuarniciones')
BEGIN
    DROP TABLE MenuOficinaGuarniciones;
    PRINT '-> [OK] Tabla MenuOficinaGuarniciones eliminada.';
END;

-- 4. Eliminar tabla MenuOficinaOpciones
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'MenuOficinaOpciones')
BEGIN
    DROP TABLE MenuOficinaOpciones;
    PRINT '-> [OK] Tabla MenuOficinaOpciones eliminada.';
END;

-- 5. Eliminar columna PinAcceso de PadronHabilitados
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('PadronHabilitados') AND name = 'PinAcceso')
BEGIN
    ALTER TABLE PadronHabilitados DROP COLUMN PinAcceso;
    PRINT '-> [OK] Columna PinAcceso eliminada de PadronHabilitados.';
END;

-- 6. Eliminar columnas y constraints agregados a Hospitales
DECLARE @df_tipo NVARCHAR(128);
SELECT @df_tipo = d.name
FROM sys.default_constraints d
JOIN sys.columns c ON d.parent_column_id = c.column_id AND d.parent_object_id = c.object_id
WHERE d.parent_object_id = OBJECT_ID('Hospitales') AND c.name = 'TipoEntidad';

IF @df_tipo IS NOT NULL
BEGIN
    EXEC('ALTER TABLE Hospitales DROP CONSTRAINT ' + @df_tipo);
    PRINT '-> [OK] Default constraint ' + @df_tipo + ' de TipoEntidad eliminado.';
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Hospitales') AND name = 'TipoEntidad')
BEGIN
    ALTER TABLE Hospitales DROP COLUMN TipoEntidad;
    PRINT '-> [OK] Columna TipoEntidad eliminada de Hospitales.';
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Hospitales') AND name = 'ProveedorNombre')
BEGIN
    ALTER TABLE Hospitales DROP COLUMN ProveedorNombre;
    PRINT '-> [OK] Columna ProveedorNombre eliminada de Hospitales.';
END;

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Hospitales') AND name = 'ProveedorTelefono')
BEGIN
    ALTER TABLE Hospitales DROP COLUMN ProveedorTelefono;
    PRINT '-> [OK] Columna ProveedorTelefono eliminada de Hospitales.';
END;

-- 7. Restaurar nombre del Rol 4 si existe
IF EXISTS (SELECT 1 FROM Roles WHERE Id = 4)
BEGIN
    UPDATE Roles SET Nombre = 'RRHH' WHERE Id = 4;
    PRINT '-> [OK] Rol 4 restaurado a "RRHH".';
END;

COMMIT TRANSACTION;
PRINT '==============================================================================';
PRINT 'ROLLBACK DE FASE 5 COMPLETADO EXITOSAMENTE.';
PRINT '==============================================================================';
GO
