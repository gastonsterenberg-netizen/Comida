-- =====================================================================================
-- DIAGNÓSTICO DE DESINCRONIZACIONES EN BASE DE DATOS DE PRODUCCIÓN (ComidaDB)
-- NOTA: Este script es de SOLO LECTURA (SELECT). No modifica ningún dato ni tabla.
-- Compatible con la estructura actual (previa a la migración).
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. RESUMEN GENERAL DE PADRÓN VS PERSONAL
-- -------------------------------------------------------------------------------------
SELECT 
    (SELECT COUNT(*) FROM PadronHabilitados) AS Total_PadronHabilitados,
    (SELECT COUNT(*) FROM PadronHabilitados WHERE Activo = 1) AS Padron_Activos,
    (SELECT COUNT(*) FROM PadronHabilitados WHERE EsGuardia24h = 1) AS Padron_Guardia24h,
    (SELECT COUNT(*) FROM Personal) AS Total_Personal_Filas,
    (SELECT COUNT(DISTINCT DNI) FROM Personal) AS Personal_DNIs_Unicos,
    (SELECT COUNT(*) FROM Personal WHERE Activo = 1 AND ConVianda = 1) AS Personal_Activos_ConVianda,
    (SELECT COUNT(*) FROM Personal WHERE EsGuardia24 = 1) AS Personal_Guardia24h;

-- -------------------------------------------------------------------------------------
-- 2. DESINCRONIZACIÓN DE RACIONES: PERSONAL (24h) VS PADRÓN (12h / 1 Ración)
-- Casos donde Personal dice Guardia 24h pero en el Padrón figuran con 1 ración (EsGuardia24h = 0)
-- -------------------------------------------------------------------------------------
SELECT 
    p.DNI,
    p.NombreCompleto AS Nombre_Personal,
    h.Nombre AS Hospital,
    s.Nombre AS Servicio,
    p.Horario,
    p.EsGuardia24 AS Personal_EsGuardia24,
    pad.EsGuardia24h AS Padron_EsGuardia24h,
    pad.Activo AS Padron_Activo
FROM Personal p
JOIN PadronHabilitados pad ON LTRIM(RTRIM(p.DNI)) = LTRIM(RTRIM(pad.DNI))
JOIN Hospitales h ON p.HospitalId = h.Id
JOIN Servicios s ON p.ServicioId = s.Id
WHERE p.Activo = 1
  AND (p.EsGuardia24 = 1 OR p.Horario LIKE '%24%' OR p.Horario LIKE '%y cena%')
  AND pad.EsGuardia24h = 0
ORDER BY h.Nombre, s.Nombre, p.NombreCompleto;

-- -------------------------------------------------------------------------------------
-- 3. DESINCRONIZACIÓN DE RACIONES INVERSA: PADRÓN (24h) VS PERSONAL (12h / Normal)
-- Casos donde en el Padrón son Guardia 24h pero en Personal figuran con 12h o Almuerzo o Cena
-- -------------------------------------------------------------------------------------
SELECT 
    p.DNI,
    p.NombreCompleto AS Nombre_Personal,
    h.Nombre AS Hospital,
    s.Nombre AS Servicio,
    p.Horario,
    p.EsGuardia24 AS Personal_EsGuardia24,
    pad.EsGuardia24h AS Padron_EsGuardia24h
FROM Personal p
JOIN PadronHabilitados pad ON LTRIM(RTRIM(p.DNI)) = LTRIM(RTRIM(pad.DNI))
JOIN Hospitales h ON p.HospitalId = h.Id
JOIN Servicios s ON p.ServicioId = s.Id
WHERE p.Activo = 1
  AND (p.EsGuardia24 = 0 AND p.Horario NOT LIKE '%24%' AND p.Horario NOT LIKE '%y cena%')
  AND pad.EsGuardia24h = 1
ORDER BY h.Nombre, s.Nombre, p.NombreCompleto;

-- -------------------------------------------------------------------------------------
-- 4. DESINCRONIZACIÓN DE ESTADO: PERSONAL ACTIVO CON VIANDA VS PADRÓN INACTIVO
-- Casos donde el Jefe lo tiene activo pidiendo comida pero en el padrón RRHH está inactivo
-- -------------------------------------------------------------------------------------
SELECT 
    p.DNI,
    p.NombreCompleto,
    h.Nombre AS Hospital,
    s.Nombre AS Servicio,
    p.Horario,
    p.ConVianda AS Personal_ConVianda,
    pad.Activo AS Padron_Activo
FROM Personal p
JOIN PadronHabilitados pad ON LTRIM(RTRIM(p.DNI)) = LTRIM(RTRIM(pad.DNI))
JOIN Hospitales h ON p.HospitalId = h.Id
JOIN Servicios s ON p.ServicioId = s.Id
WHERE p.Activo = 1 
  AND p.ConVianda = 1
  AND pad.Activo = 0
ORDER BY h.Nombre, s.Nombre, p.NombreCompleto;

-- -------------------------------------------------------------------------------------
-- 5. PERSONAL HUÉRFANO (Existe en Personal pero NO existe en PadronHabilitados)
-- -------------------------------------------------------------------------------------
SELECT 
    p.DNI,
    p.NombreCompleto,
    h.Nombre AS Hospital,
    s.Nombre AS Servicio,
    p.Horario,
    p.Activo,
    p.ConVianda
FROM Personal p
JOIN Hospitales h ON p.HospitalId = h.Id
JOIN Servicios s ON p.ServicioId = s.Id
WHERE NOT EXISTS (
    SELECT 1 FROM PadronHabilitados pad WHERE LTRIM(RTRIM(pad.DNI)) = LTRIM(RTRIM(p.DNI))
)
ORDER BY h.Nombre, s.Nombre, p.NombreCompleto;

-- -------------------------------------------------------------------------------------
-- 6. COMENSALES HISTÓRICOS DE EMERGENCIA QUE NUNCA ESTUVIERON EN EL PADRÓN
-- -------------------------------------------------------------------------------------
SELECT 
    LTRIM(RTRIM(pc.EmergenciaDNI)) AS DNI,
    MAX(pc.EmergenciaNombreCompleto) AS NombreEmergencia,
    COUNT(*) AS CantidadPedidosHistoricos,
    MIN(pc.FechaPedido) AS PrimerPedido,
    MAX(pc.FechaPedido) AS UltimoPedido
FROM PedidosComida pc
WHERE pc.EmergenciaDNI IS NOT NULL 
  AND LTRIM(RTRIM(pc.EmergenciaDNI)) <> ''
  AND NOT EXISTS (
      SELECT 1 FROM PadronHabilitados pad WHERE LTRIM(RTRIM(pad.DNI)) = LTRIM(RTRIM(pc.EmergenciaDNI))
  )
GROUP BY LTRIM(RTRIM(pc.EmergenciaDNI))
ORDER BY CantidadPedidosHistoricos DESC;

-- -------------------------------------------------------------------------------------
-- 7. CASOS HISTÓRICOS DE AGENTES CON 1 RACIÓN QUE RECIBIERON 2 COMIDAS EL MISMO DÍA
-- (Muestra de cómo convivían pedidos habituales con reemplazos/emergencias para el mismo DNI)
-- -------------------------------------------------------------------------------------
WITH PedidosUnificados AS (
    SELECT 
        pc.Id,
        pc.FechaPedido,
        pc.TipoComida,
        pc.Estado,
        COALESCE(LTRIM(RTRIM(p.DNI)), LTRIM(RTRIM(pc.EmergenciaDNI))) AS DNI,
        COALESCE(p.NombreCompleto, pc.EmergenciaNombreCompleto) AS NombreComensal,
        CASE WHEN pc.EmergenciaDNI IS NOT NULL THEN 'Emergencia / Reemplazo' ELSE 'Planilla Servicio' END AS OrigenPedido
    FROM PedidosComida pc
    LEFT JOIN Personal p ON pc.PersonalId = p.Id
    WHERE pc.Estado = 'Aprobado'
)
SELECT 
    pu.DNI,
    pu.NombreComensal,
    pu.FechaPedido,
    COUNT(pu.Id) AS TotalComidasDia,
    STRING_AGG(pu.TipoComida + ' (' + pu.OrigenPedido + ')', ', ') AS DetalleComidas
FROM PedidosUnificados pu
JOIN PadronHabilitados pad ON pu.DNI = pad.DNI
WHERE pad.EsGuardia24h = 0
GROUP BY pu.DNI, pu.NombreComensal, pu.FechaPedido
HAVING COUNT(pu.Id) > 1
ORDER BY pu.FechaPedido DESC, pu.NombreComensal;
