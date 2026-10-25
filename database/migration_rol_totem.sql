-- =============================================================================
-- Migración: Alta de Rol 6 (Totem) para Terminales de Autoservicio
-- Entorno: Producción (SQL Server)
-- Fecha: 2026-10-24
-- Descripción: Agrega el rol 'Totem' (Id: 6) para permitir el funcionamiento
--              independiente de terminales de validación e impresión de raciones.
-- =============================================================================

USE ComidaDB;
GO

IF NOT EXISTS (SELECT 1 FROM Roles WHERE Id = 6)
BEGIN
    IF COLUMNPROPERTY(OBJECT_ID('Roles'), 'Id', 'IsIdentity') = 1
    BEGIN
        SET IDENTITY_INSERT Roles ON;
        INSERT INTO Roles (Id, Nombre) VALUES (6, 'Totem');
        SET IDENTITY_INSERT Roles OFF;
    END
    ELSE
    BEGIN
        INSERT INTO Roles (Id, Nombre) VALUES (6, 'Totem');
    END
    PRINT 'Rol Totem (Id: 6) creado exitosamente en tabla Roles.';
END
ELSE
BEGIN
    UPDATE Roles SET Nombre = 'Totem' WHERE Id = 6;
    PRINT 'El Rol Id: 6 ya existía en tabla Roles. Nombre verificado/actualizado.';
END;
GO
