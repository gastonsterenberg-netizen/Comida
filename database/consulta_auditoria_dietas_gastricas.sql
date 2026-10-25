-- =====================================================================================
-- CONSULTA DE AUDITORÍA: VERIFICAR SI SE UTILIZÓ LA DIETA 'GÁSTRICA' EN ALGÚN HOSPITAL
-- ENTORNO: PRODUCCIÓN / TESTING (SQL SERVER)
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. PANORAMA GENERAL: Conteo de todos los pedidos históricos por Tipo de Dieta
-- -------------------------------------------------------------------------------------
SELECT 
    TipoDieta, 
    COUNT(*) AS CantidadTotalPedidos
FROM PedidosComida
GROUP BY TipoDieta
ORDER BY CantidadTotalPedidos DESC;

-- -------------------------------------------------------------------------------------
-- 2. RESUMEN ESPECÍFICO: Pedidos con 'Gástrica' agrupados por Hospital y Estado
-- -------------------------------------------------------------------------------------
SELECT 
    COALESCE(hPersonal.Nombre, hSolicitante.Nombre, 'Sin Hospital') AS Hospital,
    p.TipoDieta,
    p.Estado,
    COUNT(*) AS CantidadPedidos
FROM PedidosComida p
LEFT JOIN Personal per ON p.PersonalId = per.Id
LEFT JOIN Hospitales hPersonal ON per.HospitalId = hPersonal.Id
LEFT JOIN Usuarios u ON p.SolicitadoPorUsuarioId = u.Id
LEFT JOIN Hospitales hSolicitante ON u.HospitalId = hSolicitante.Id
WHERE p.TipoDieta IN ('Gastrica', 'Gástrica')
GROUP BY 
    COALESCE(hPersonal.Nombre, hSolicitante.Nombre, 'Sin Hospital'),
    p.TipoDieta,
    p.Estado
ORDER BY Hospital, CantidadPedidos DESC;

-- -------------------------------------------------------------------------------------
-- 3. DETALLE FILA POR FILA: Listado de cada pedido registrado con 'Gástrica'
-- -------------------------------------------------------------------------------------
SELECT 
    p.Id AS PedidoId,
    CONVERT(VARCHAR(10), p.FechaPedido, 103) AS FechaPedido,
    p.TipoComida AS Turno,
    p.TipoDieta,
    p.Estado,
    COALESCE(hPersonal.Nombre, hSolicitante.Nombre, 'Desconocido') AS Hospital,
    COALESCE(s.Nombre, 'Sin Servicio') AS Servicio,
    COALESCE(per.NombreCompleto, p.EmergenciaNombreCompleto, 'Sin Nombre') AS Agente,
    COALESCE(per.DNI, p.EmergenciaDNI, '-') AS DNI,
    u.NombreCompleto AS SolicitadoPor,
    CASE 
        WHEN p.FechaEntregado IS NOT NULL THEN 'SI (' + CONVERT(VARCHAR(16), p.FechaEntregado, 120) + ')'
        ELSE 'NO'
    END AS FueEntregado
FROM PedidosComida p
LEFT JOIN Personal per ON p.PersonalId = per.Id
LEFT JOIN Servicios s ON per.ServicioId = s.Id
LEFT JOIN Hospitales hPersonal ON per.HospitalId = hPersonal.Id
LEFT JOIN Usuarios u ON p.SolicitadoPorUsuarioId = u.Id
LEFT JOIN Hospitales hSolicitante ON u.HospitalId = hSolicitante.Id
WHERE p.TipoDieta IN ('Gastrica', 'Gástrica')
ORDER BY p.FechaPedido DESC, p.Id DESC;
