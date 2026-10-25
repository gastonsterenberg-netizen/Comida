-- =============================================================================
-- Migración: Agregar columna RetiradoPorAgenteId en PedidosComida
-- Entorno: Producción (SQL Server)
-- Fecha: 2026-10-22
-- Descripción: Permite registrar de forma normalizada qué agente del hospital
--              retiró un lote de viandas bajo la modalidad de Voucher Consolidado.
-- =============================================================================

USE ComidaDB;
GO

-- 1. Agregar columna RetiradoPorAgenteId en PedidosComida si no existe
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'RetiradoPorAgenteId')
BEGIN
    ALTER TABLE PedidosComida ADD RetiradoPorAgenteId INT NULL;
    PRINT 'Columna RetiradoPorAgenteId agregada exitosamente en PedidosComida.';
END
ELSE
BEGIN
    PRINT 'La columna RetiradoPorAgenteId ya existe en PedidosComida.';
END;
GO

-- 2. Crear Clave Foránea apuntando a PadronHabilitados(Id)
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_RetiradoPorAgente')
BEGIN
    ALTER TABLE PedidosComida 
    ADD CONSTRAINT FK_PedidosComida_RetiradoPorAgente 
    FOREIGN KEY (RetiradoPorAgenteId) REFERENCES PadronHabilitados(Id);
    PRINT 'Clave foránea FK_PedidosComida_RetiradoPorAgente creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La clave foránea FK_PedidosComida_RetiradoPorAgente ya existe.';
END;
GO

-- 3. Crear Índice no agrupado filtrado para optimizar búsquedas y reportes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PedidosComida_RetiradoPorAgente' AND object_id = OBJECT_ID('PedidosComida'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_PedidosComida_RetiradoPorAgente 
    ON PedidosComida(RetiradoPorAgenteId) 
    WHERE RetiradoPorAgenteId IS NOT NULL;
    PRINT 'Índice IX_PedidosComida_RetiradoPorAgente creado exitosamente.';
END
ELSE
BEGIN
    PRINT 'El índice IX_PedidosComida_RetiradoPorAgente ya existe.';
END;
GO
