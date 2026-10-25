-- ==============================================================================
-- SCRIPT DE CORRECCIÓN SELECTIVA: HOSPITAL NUESTRA SEÑORA DEL CARMEN
-- ==============================================================================
-- BASE DE DATOS: ComidaDB (SQL Server)
-- FECHA: Octubre 2026
-- 
-- COMPORTAMIENTO INTELIGENTE Y SELECTIVO:
-- 1. NO TOCA a los agentes que ya tengan una solicitud de modificación de plantel
--    (en la tabla SolicitudesPlantel, sea Pendiente o Aprobada).
-- 2. NO TOCA a los agentes que ya fueron modificados manualmente (ConVianda=1,
--    EsGuardia12=1, EsGuardia24=1, o con Horario distinto a '08:00 a 16:00').
-- 3. CORRIGE ÚNICAMENTE a los agentes que quedaron atrapados en el estado defectuoso
--    del Excel original (ConVianda=0, Es12=0, Es24=0 y Horario='08:00 a 16:00')
--    sin ninguna solicitud iniciada.
-- ==============================================================================

USE [ComidaDB];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT '==============================================================================';
PRINT 'INICIANDO CORRECCIÓN SELECTIVA PARA HOSPITAL DEL CARMEN';
PRINT '==============================================================================';

DECLARE @HospitalId INT;

SELECT @HospitalId = Id 
FROM Hospitales 
WHERE Nombre LIKE '%CARMEN%';

IF @HospitalId IS NULL
BEGIN
    THROW 50000, 'ERROR: No se encontró el hospital NUESTRA SEÑORA DEL CARMEN.', 1;
END;

PRINT '-> Hospital identificado: ID = ' + CAST(@HospitalId AS VARCHAR(10));

-- ------------------------------------------------------------------------------
-- DIAGNÓSTICO PREVIO: Conteo por grupos
-- ------------------------------------------------------------------------------
DECLARE @TotalCarmen INT;
DECLARE @ConSolicitud INT;
DECLARE @YaModificados INT;
DECLARE @PendientesCorreccion INT;

SELECT @TotalCarmen = COUNT(*) FROM Personal WHERE HospitalId = @HospitalId;

-- Agentes que tienen Solicitud de Plantel registrada
SELECT @ConSolicitud = COUNT(DISTINCT p.DNI)
FROM Personal p
WHERE p.HospitalId = @HospitalId
  AND EXISTS (
      SELECT 1 
      FROM SolicitudesPlantel sp 
      WHERE sp.HospitalId = @HospitalId 
        AND sp.DatosJson LIKE '%' + p.DNI + '%'
  );

-- Agentes que ya fueron modificados previamente (por fuera de las solicitudes)
SELECT @YaModificados = COUNT(DISTINCT p.DNI)
FROM Personal p
WHERE p.HospitalId = @HospitalId
  AND (p.ConVianda = 1 OR p.EsGuardia12 = 1 OR p.EsGuardia24 = 1 OR p.Horario <> '08:00 a 16:00')
  AND NOT EXISTS (
      SELECT 1 
      FROM SolicitudesPlantel sp 
      WHERE sp.HospitalId = @HospitalId 
        AND sp.DatosJson LIKE '%' + p.DNI + '%'
  );

-- Agentes que siguen en el estado roto del Excel y NO tienen solicitud
SELECT @PendientesCorreccion = COUNT(*)
FROM Personal p
WHERE p.HospitalId = @HospitalId
  AND p.ConVianda = 0 
  AND p.EsGuardia12 = 0 
  AND p.EsGuardia24 = 0 
  AND p.Horario = '08:00 a 16:00'
  AND NOT EXISTS (
      SELECT 1 
      FROM SolicitudesPlantel sp 
      WHERE sp.HospitalId = @HospitalId 
        AND sp.DatosJson LIKE '%' + p.DNI + '%'
  );

PRINT '-> Total registros en Personal Carmen: ' + CAST(@TotalCarmen AS VARCHAR(10));
PRINT '-> Agentes con Solicitud de Plantel (SE RESPETAN, NO SE TOCAN): ' + CAST(@ConSolicitud AS VARCHAR(10));
PRINT '-> Agentes ya modificados con ración (SE RESPETAN, NO SE TOCAN): ' + CAST(@YaModificados AS VARCHAR(10));
PRINT '-> Agentes rotos del Excel a corregir automáticamente: ' + CAST(@PendientesCorreccion AS VARCHAR(10));

-- ------------------------------------------------------------------------------
-- 1. ACTUALIZAR Personal: SOLO los rotos del Excel sin solicitudes
-- ------------------------------------------------------------------------------
UPDATE p
SET 
    p.ConVianda = 1,
    p.EsGuardia12 = 1,
    p.EsGuardia24 = 0,
    p.Horario = 'Almuerzo o Cena',
    p.Activo = 1,
    p.AgenteId = pad.Id
FROM Personal p
INNER JOIN PadronHabilitados pad ON pad.DNI = p.DNI
WHERE p.HospitalId = @HospitalId
  -- Condición: Estado defectuoso del Excel
  AND p.ConVianda = 0
  AND p.EsGuardia12 = 0
  AND p.EsGuardia24 = 0
  AND p.Horario = '08:00 a 16:00'
  -- Exclusión: NO tocar a quienes tienen Solicitud de Plantel
  AND NOT EXISTS (
      SELECT 1 
      FROM SolicitudesPlantel sp 
      WHERE sp.HospitalId = @HospitalId 
        AND sp.DatosJson LIKE '%' + p.DNI + '%'
  );

DECLARE @FilasPersonalCorregidas INT = @@ROWCOUNT;
PRINT '-> [OK] Filas actualizadas en Personal: ' + CAST(@FilasPersonalCorregidas AS VARCHAR(10));

-- Asegurar AgenteId en todas las filas de Carmen (incluidos los ya modificados)
UPDATE p
SET p.AgenteId = pad.Id
FROM Personal p
INNER JOIN PadronHabilitados pad ON pad.DNI = p.DNI
WHERE p.HospitalId = @HospitalId AND p.AgenteId IS NULL;

-- ------------------------------------------------------------------------------
-- 2. ACTUALIZAR PadronHabilitados
-- ------------------------------------------------------------------------------
-- A. Activar a los agentes que acabamos de corregir
UPDATE pad
SET 
    pad.Activo = 1,
    pad.EsGuardia24h = 0,
    pad.RacionesMaximasDia = 1
FROM PadronHabilitados pad
INNER JOIN Personal p ON p.DNI = pad.DNI AND p.HospitalId = @HospitalId
WHERE p.ConVianda = 1
  AND pad.Activo = 0
  -- No tocar si está en una solicitud pendiente (el flujo de aprobación de la app lo sincronizará)
  AND NOT EXISTS (
      SELECT 1 
      FROM SolicitudesPlantel sp 
      WHERE sp.HospitalId = @HospitalId 
        AND sp.Estado = 'Pendiente'
        AND sp.DatosJson LIKE '%' + pad.DNI + '%'
  );

DECLARE @FilasPadronCorregidas INT = @@ROWCOUNT;
PRINT '-> [OK] Filas activadas en PadronHabilitados: ' + CAST(@FilasPadronCorregidas AS VARCHAR(10));

-- ------------------------------------------------------------------------------
-- 3. REPORTE DE VERIFICACIÓN POST-EJECUCIÓN
-- ------------------------------------------------------------------------------
PRINT '==============================================================================';
PRINT 'ESTADO FINAL EN HOSPITAL DEL CARMEN TRAS CORRECCIÓN SELECTIVA:';
PRINT '==============================================================================';

SELECT 
    'Personal Carmen' AS Entidad,
    COUNT(*) AS TotalPersonal,
    SUM(CASE WHEN ConVianda = 1 THEN 1 ELSE 0 END) AS ConVianda_1,
    SUM(CASE WHEN ConVianda = 0 THEN 1 ELSE 0 END) AS ConVianda_0_SinRacion,
    SUM(CASE WHEN EsGuardia12 = 1 THEN 1 ELSE 0 END) AS Guardia12h,
    SUM(CASE WHEN EsGuardia24 = 1 THEN 1 ELSE 0 END) AS Guardia24h
FROM Personal 
WHERE HospitalId = @HospitalId;

SELECT 
    'Padron Carmen' AS Entidad,
    COUNT(DISTINCT pad.DNI) AS TotalPadron,
    SUM(CASE WHEN pad.Activo = 1 THEN 1 ELSE 0 END) AS PadronActivo_1,
    SUM(CASE WHEN pad.Activo = 0 THEN 1 ELSE 0 END) AS PadronActivo_0
FROM PadronHabilitados pad
INNER JOIN Personal p ON p.DNI = pad.DNI AND p.HospitalId = @HospitalId;

COMMIT TRANSACTION;
PRINT '==============================================================================';
PRINT 'CORRECCIÓN SELECTIVA COMPLETADA EXITOSAMENTE EN ComidaDB.';
PRINT '==============================================================================';
GO
