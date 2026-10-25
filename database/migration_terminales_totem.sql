-- ===============================================================================
-- SCRIPT DE MIGRACIÓN PARA ENTORNO DE PRODUCCIÓN
-- Módulo: Control, Registro, Auditoría y Revocación de Terminales Tótem Autoservicio
-- Fecha: 2026-10-25
-- Descripción:
--   Crea la tabla TerminalesTotem para auditar y controlar todas las terminales
--   físicas vinculadas por hospital. Permite registrar IP, hash de token,
--   última actividad y revocación instantánea ante extravío, intrusión o
--   desmantelamiento de terminal.
-- ===============================================================================

USE ComidaDB;
GO

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TerminalesTotem]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[TerminalesTotem] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [HospitalId] INT NOT NULL,
        [Nombre] NVARCHAR(100) NOT NULL,
        [IpAddress] NVARCHAR(50) NULL,
        [TokenHash] NVARCHAR(128) NOT NULL,
        [Activo] BIT NOT NULL DEFAULT 1,
        [FechaVinculacion] DATETIME NOT NULL DEFAULT GETDATE(),
        [UltimaActividad] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_TerminalesTotem] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_TerminalesTotem_Hospitales] FOREIGN KEY ([HospitalId]) REFERENCES [dbo].[Hospitales] ([Id])
    );

    CREATE NONCLUSTERED INDEX [IX_TerminalesTotem_Hospital_Activo]
        ON [dbo].[TerminalesTotem]([HospitalId] ASC, [Activo] ASC);

    PRINT 'Tabla TerminalesTotem creada con éxito en ComidaDB.';
END
ELSE
BEGIN
    PRINT 'La tabla TerminalesTotem ya existe en la base de datos.';
END
GO
