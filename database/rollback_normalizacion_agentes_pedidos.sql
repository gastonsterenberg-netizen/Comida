-- =====================================================================================
-- SCRIPT DE ROLLBACK: REVERTIR NORMALIZACIÓN DE AGENTES Y PEDIDOS DE COMIDA
-- ENTORNO: DESARROLLO / PRODUCCIÓN (SQL SERVER)
-- =====================================================================================

BEGIN TRANSACTION;
GO

-- 1. Eliminar índices creados
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PedidosComida_Agente_Fecha')
    DROP INDEX IX_PedidosComida_Agente_Fecha ON PedidosComida;
GO

IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Personal_AgenteId')
    DROP INDEX IX_Personal_AgenteId ON Personal;
GO

-- 2. Eliminar Claves Foráneas
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_ReemplazaAgente')
    ALTER TABLE PedidosComida DROP CONSTRAINT FK_PedidosComida_ReemplazaAgente;
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_Agente')
    ALTER TABLE PedidosComida DROP CONSTRAINT FK_PedidosComida_Agente;
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Personal_Agente')
    ALTER TABLE Personal DROP CONSTRAINT FK_Personal_Agente;
GO

-- 3. Eliminar columnas agregadas en PedidosComida y Personal
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'ReemplazaAgenteId')
    ALTER TABLE PedidosComida DROP COLUMN ReemplazaAgenteId;
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'AgenteId')
    ALTER TABLE PedidosComida DROP COLUMN AgenteId;
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Personal') AND name = 'AgenteId')
    ALTER TABLE Personal DROP COLUMN AgenteId;
GO

-- 4. Eliminar registros de emergencias creados en PadronHabilitados
DELETE FROM PadronHabilitados WHERE OrigenAlta = 'EMERGENCIA_PROVISORIA';
GO

-- 5. Eliminar columnas agregadas en PadronHabilitados
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PadronHabilitados') AND name = 'OrigenAlta')
    ALTER TABLE PadronHabilitados DROP COLUMN OrigenAlta;
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PadronHabilitados') AND name = 'RacionesMaximasDia')
    ALTER TABLE PadronHabilitados DROP COLUMN RacionesMaximasDia;
GO

COMMIT TRANSACTION;
GO
