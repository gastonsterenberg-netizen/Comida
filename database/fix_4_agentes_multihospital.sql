-- ==============================================================================
-- SCRIPT DE RESTAURACIÓN PARA LOS 4 AGENTES MULTI-HOSPITAL
-- ==============================================================================
-- BASE DE DATOS: ComidaDB (SQL Server)
-- FECHA: Octubre 2026
--
-- PROPÓSITO:
-- Restaurar el estado en PadronHabilitados y Personal para los 4 agentes que
-- pertenecían a Hospital Padilla y Hospital Eva Perón y cuyo registro en el
-- padrón global fue sobreescrito al importar el Hospital del Carmen.
--
-- AGENTES AFECTADOS:
-- 1. DNI 37455478 - JARAMILLO AGOSTINA (Padilla -> Salud Mental, 1 Ración / Guardia 12h)
-- 2. DNI 38162922 - RODRÍGUEZ, SERGIO EZEQUIEL (Eva Perón -> Guardia Adultos, 1 Ración / Guardia 12h)
-- 3. DNI 40237524 - USANDIVARAS BERNARDITA (Padilla -> Salud Mental, 1 Ración / Guardia 12h)
-- 4. DNI 40983464 - PUJADAS KARSCHTI ESTEFANIA (Padilla -> Salud Mental, 2 Raciones / Guardia 24h)
-- ==============================================================================

USE [ComidaDB];
GO

SET XACT_ABORT ON;
BEGIN TRANSACTION;

PRINT '==============================================================================';
PRINT 'RESTAURANDO ESTADO DE LOS 4 AGENTES MULTI-HOSPITAL';
PRINT '==============================================================================';

-- 1. Restaurar PadronHabilitados
-- Agostina Jaramillo (Padilla, Salud Mental, 1 ración)
UPDATE PadronHabilitados
SET 
    HospitalId = 1046,
    ServicioId = 5127,
    Activo = 1,
    EsGuardia24h = 0,
    RacionesMaximasDia = 1
WHERE DNI = '37455478';

-- Sergio Ezequiel Rodríguez (Eva Perón, Guardia Adultos, 1 ración)
UPDATE PadronHabilitados
SET 
    HospitalId = 1049,
    ServicioId = 5416,
    Activo = 1,
    EsGuardia24h = 0,
    RacionesMaximasDia = 1
WHERE DNI = '38162922';

-- Bernardita Usandivaras (Padilla, Salud Mental, 1 ración)
UPDATE PadronHabilitados
SET 
    HospitalId = 1046,
    ServicioId = 5127,
    Activo = 1,
    EsGuardia24h = 0,
    RacionesMaximasDia = 1
WHERE DNI = '40237524';

-- Estefanía Pujadas Karschtí (Padilla, Salud Mental, 2 raciones / Guardia 24h)
UPDATE PadronHabilitados
SET 
    HospitalId = 1046,
    ServicioId = 5127,
    Activo = 1,
    EsGuardia24h = 1,
    RacionesMaximasDia = 2
WHERE DNI = '40983464';

PRINT '-> PadronHabilitados actualizado para los 4 agentes.';

-- 2. Asegurar consistencia en Personal para sus hospitales de origen
UPDATE p
SET 
    p.ConVianda = 1,
    p.Activo = 1,
    p.AgenteId = pad.Id
FROM Personal p
INNER JOIN PadronHabilitados pad ON pad.DNI = p.DNI
WHERE p.DNI IN ('37455478', '38162922', '40237524', '40983464')
  AND p.HospitalId IN (1046, 1049);

PRINT '-> Filas de Personal en Padilla y Eva Perón sincronizadas.';

-- 3. Verificación
SELECT 
    pad.Id AS AgenteId,
    pad.DNI,
    pad.NombreCompleto,
    pad.Activo AS PadronActivo,
    pad.EsGuardia24h,
    pad.RacionesMaximasDia,
    h.Nombre AS HospitalPadron,
    s.Nombre AS ServicioPadron
FROM PadronHabilitados pad
LEFT JOIN Hospitales h ON h.Id = pad.HospitalId
LEFT JOIN Servicios s ON s.Id = pad.ServicioId
WHERE pad.DNI IN ('37455478', '38162922', '40237524', '40983464');

SELECT 
    p.Id AS PersonalId,
    p.DNI,
    p.NombreCompleto,
    h.Nombre AS HospitalPersonal,
    s.Nombre AS ServicioPersonal,
    p.ConVianda,
    p.EsGuardia12,
    p.EsGuardia24,
    p.AgenteId
FROM Personal p
LEFT JOIN Hospitales h ON h.Id = p.HospitalId
LEFT JOIN Servicios s ON s.Id = p.ServicioId
WHERE p.DNI IN ('37455478', '38162922', '40237524', '40983464');

COMMIT TRANSACTION;
PRINT '==============================================================================';
PRINT 'RESTAURACIÓN FINALIZADA CON ÉXITO.';
PRINT '==============================================================================';
GO
