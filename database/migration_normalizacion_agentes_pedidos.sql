-- =====================================================================================
-- SCRIPT DE MIGRACIÓN: NORMALIZACIÓN DE AGENTES, PERSONAL Y PEDIDOS DE COMIDA
-- ENTORNO: PRODUCCIÓN (SQL SERVER)
-- =====================================================================================

BEGIN TRANSACTION;
GO

-- 1. Agregar columnas en PadronHabilitados (Agentes como Única Fuente de Verdad)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PadronHabilitados') AND name = 'RacionesMaximasDia')
BEGIN
    ALTER TABLE PadronHabilitados ADD RacionesMaximasDia INT NOT NULL DEFAULT 1;
END;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PadronHabilitados') AND name = 'OrigenAlta')
BEGIN
    ALTER TABLE PadronHabilitados ADD OrigenAlta NVARCHAR(50) NOT NULL DEFAULT 'PADRON_RRHH';
END;
GO

-- 2. Migrar RacionesMaximasDia: CRITERIO DEL VALOR MÁS ALTO (MAX entre Padrón y Personal)
-- Si el agente figura como Guardia 24h en PadronHabilitados O en alguna fila activa de Personal (corrección de jefe),
-- se le asignan 2 raciones en el Padrón (fuente de verdad definitiva) para no degradar correcciones operativas.
UPDATE pad
SET pad.RacionesMaximasDia = 2,
    pad.EsGuardia24h = 1
FROM PadronHabilitados pad
WHERE pad.EsGuardia24h = 1
   OR EXISTS (
       SELECT 1 
       FROM Personal p 
       WHERE LTRIM(RTRIM(p.DNI)) = pad.DNI 
         AND p.Activo = 1 
         AND (p.EsGuardia24 = 1 OR p.Horario LIKE '%24%' OR p.Horario LIKE '%y cena%' OR p.Horario LIKE '%2 racion%')
   );
GO

-- Alinear las filas activas de Personal con el nuevo valor unificado
UPDATE p
SET p.EsGuardia24 = 1
FROM Personal p
JOIN PadronHabilitados pad ON LTRIM(RTRIM(p.DNI)) = pad.DNI
WHERE pad.RacionesMaximasDia = 2 AND p.EsGuardia24 = 0;
GO

-- 3. Backfill: Insertar en PadronHabilitados las personas que vinieron por Emergencia y nunca estuvieron empadronadas
INSERT INTO PadronHabilitados (DNI, NombreCompleto, EsGuardia24h, RacionesMaximasDia, Activo, FechaCreacion, HospitalId, ServicioId, OrigenAlta)
SELECT 
    LTRIM(RTRIM(pc.EmergenciaDNI)) AS DNI, 
    MAX(ISNULL(NULLIF(LTRIM(RTRIM(pc.EmergenciaNombreCompleto)), ''), 'Agente Emergencia')) AS NombreCompleto, 
    0 AS EsGuardia24h, 
    1 AS RacionesMaximasDia, 
    1 AS Activo, 
    GETDATE() AS FechaCreacion, 
    MAX(u.HospitalId) AS HospitalId, 
    MAX(u.ServicioId) AS ServicioId, 
    'EMERGENCIA_PROVISORIA' AS OrigenAlta
FROM PedidosComida pc
JOIN Usuarios u ON pc.SolicitadoPorUsuarioId = u.Id
WHERE pc.EmergenciaDNI IS NOT NULL 
  AND RTRIM(LTRIM(pc.EmergenciaDNI)) <> ''
  AND NOT EXISTS (SELECT 1 FROM PadronHabilitados pad WHERE pad.DNI = LTRIM(RTRIM(pc.EmergenciaDNI)))
GROUP BY LTRIM(RTRIM(pc.EmergenciaDNI));
GO

-- 4. Vincular Personal con PadronHabilitados (AgenteId)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Personal') AND name = 'AgenteId')
BEGIN
    ALTER TABLE Personal ADD AgenteId INT NULL;
END;
GO

UPDATE p
SET p.AgenteId = pad.Id
FROM Personal p
JOIN PadronHabilitados pad ON LTRIM(RTRIM(p.DNI)) = pad.DNI
WHERE p.AgenteId IS NULL;
GO

-- 5. Agregar columnas AgenteId y ReemplazaAgenteId en PedidosComida
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'AgenteId')
BEGIN
    ALTER TABLE PedidosComida ADD AgenteId INT NULL;
END;
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'ReemplazaAgenteId')
BEGIN
    ALTER TABLE PedidosComida ADD ReemplazaAgenteId INT NULL;
END;
GO

-- 6. Poblar AgenteId en PedidosComida para pedidos regulares (vía Personal)
UPDATE pc
SET pc.AgenteId = pad.Id
FROM PedidosComida pc
JOIN Personal p ON pc.PersonalId = p.Id
JOIN PadronHabilitados pad ON LTRIM(RTRIM(p.DNI)) = pad.DNI
WHERE pc.AgenteId IS NULL;
GO

-- 7. Poblar AgenteId en PedidosComida para pedidos de emergencia (vía EmergenciaDNI)
UPDATE pc
SET pc.AgenteId = pad.Id
FROM PedidosComida pc
JOIN PadronHabilitados pad ON LTRIM(RTRIM(pc.EmergenciaDNI)) = pad.DNI
WHERE pc.AgenteId IS NULL AND pc.EmergenciaDNI IS NOT NULL AND LTRIM(RTRIM(pc.EmergenciaDNI)) <> '';
GO

-- 8. Poblar ReemplazaAgenteId en PedidosComida
UPDATE pc
SET pc.ReemplazaAgenteId = pad.Id
FROM PedidosComida pc
JOIN Personal p ON pc.EmergenciaReemplazaId = p.Id
JOIN PadronHabilitados pad ON LTRIM(RTRIM(p.DNI)) = pad.DNI
WHERE pc.EmergenciaReemplazaId IS NOT NULL AND pc.ReemplazaAgenteId IS NULL;
GO

-- 9. Claves Foráneas e Índices
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Personal_Agente')
BEGIN
    ALTER TABLE Personal ADD CONSTRAINT FK_Personal_Agente FOREIGN KEY (AgenteId) REFERENCES PadronHabilitados(Id);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_Agente')
BEGIN
    ALTER TABLE PedidosComida ADD CONSTRAINT FK_PedidosComida_Agente FOREIGN KEY (AgenteId) REFERENCES PadronHabilitados(Id);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_ReemplazaAgente')
BEGIN
    ALTER TABLE PedidosComida ADD CONSTRAINT FK_PedidosComida_ReemplazaAgente FOREIGN KEY (ReemplazaAgenteId) REFERENCES PadronHabilitados(Id);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PedidosComida_Agente_Fecha')
BEGIN
    CREATE NONCLUSTERED INDEX IX_PedidosComida_Agente_Fecha ON PedidosComida (AgenteId, FechaPedido, Estado);
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Personal_AgenteId')
BEGIN
    CREATE NONCLUSTERED INDEX IX_Personal_AgenteId ON Personal (AgenteId);
END;
GO

COMMIT TRANSACTION;
GO
