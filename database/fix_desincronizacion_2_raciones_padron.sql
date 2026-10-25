-- =========================================================================
-- SCRIPT DE REMEDIACIÓN Y RESINCRONIZACIÓN DE RACIONES (PRODUCCIÓN)
-- Base de datos: ComidaDB
-- Motivo: Sincronizar agentes con '2 Raciones' en Personal hacia PadronHabilitados
--         y habilitar flag EsGuardia24 en Personal.
-- =========================================================================

USE ComidaDB;
GO

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET NOCOUNT ON;
GO

BEGIN TRANSACTION;

BEGIN TRY
    PRINT '-------------------------------------------------------------';
    PRINT '1. ACTUALIZANDO TABLA [Personal] (EsGuardia24 = 1)';
    PRINT '-------------------------------------------------------------';

    UPDATE Personal
    SET EsGuardia24 = 1,
        EsGuardia12 = 0
    WHERE (
        LOWER(Horario) LIKE '%2%racion%' 
        OR LOWER(Horario) LIKE '%24%' 
        OR LOWER(Horario) LIKE '%y cena%'
    )
    AND ConVianda = 1
    AND EsGuardia24 = 0;

    PRINT CONCAT('Personal actualizado: ', @@ROWCOUNT, ' filas.');

    PRINT '-------------------------------------------------------------';
    PRINT '2. ACTUALIZANDO TABLA [PadronHabilitados] (RacionesMaximasDia = 2)';
    PRINT '-------------------------------------------------------------';

    UPDATE pad
    SET pad.EsGuardia24h = 1,
        pad.RacionesMaximasDia = 2,
        pad.Activo = 1
    FROM PadronHabilitados pad
    JOIN Personal p ON pad.DNI = p.DNI
    WHERE p.Activo = 1
      AND p.ConVianda = 1
      AND (
          p.EsGuardia24 = 1 
          OR LOWER(p.Horario) LIKE '%2%racion%' 
          OR LOWER(p.Horario) LIKE '%24%' 
          OR LOWER(p.Horario) LIKE '%y cena%'
      )
      AND (pad.RacionesMaximasDia < 2 OR pad.EsGuardia24h = 0);

    PRINT CONCAT('PadronHabilitados actualizado: ', @@ROWCOUNT, ' agentes.');

    PRINT '-------------------------------------------------------------';
    PRINT '3. CASO ESPECÍFICO: GABRIELA LEAL (DNI: 23042249)';
    PRINT '-------------------------------------------------------------';

    -- Si existiese la emergencia de Cena pendiente creada forzosamente para 2026-10-25,
    -- vincularla con su registro de Personal y dejarla Aprobada.
    UPDATE PedidosComida
    SET PersonalId = 43693,
        AgenteId = 71520,
        Estado = 'Aprobado',
        JustificacionResolucion = 'Aprobado automáticamente tras resincronización de cupo 2 Raciones DTS'
    WHERE Id = 115681 
      AND EmergenciaDNI = '23042249'
      AND Estado = 'Pendiente';

    PRINT CONCAT('Pedido de emergencia 115681 aprobado: ', @@ROWCOUNT, ' pedido.');

    COMMIT TRANSACTION;
    PRINT '-------------------------------------------------------------';
    PRINT 'TRANSACCIÓN CONFIRMADA EXITOSAMENTE (COMMIT).';
    PRINT '-------------------------------------------------------------';

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT 'ERROR OCURRIDO:';
    PRINT ERROR_MESSAGE();
    THROW;
END CATCH;
GO

-- =========================================================================
-- VERIFICACIÓN FINAL POST-EJECUCIÓN
-- =========================================================================
PRINT '--- Verificando estado del agente 23042249 ---';
SELECT DNI, NombreCompleto, Horario, EsGuardia24, ConVianda, HospitalId, ServicioId 
FROM Personal 
WHERE DNI = '23042249';

SELECT DNI, NombreCompleto, EsGuardia24h, RacionesMaximasDia, HospitalId, ServicioId 
FROM PadronHabilitados 
WHERE DNI = '23042249';

PRINT '--- Verificando si quedan desincronizaciones en toda la base de datos ---';
SELECT p.DNI, p.NombreCompleto, p.Horario, p.EsGuardia24, pad.EsGuardia24h, pad.RacionesMaximasDia, h.Nombre as Hospital, s.Nombre as Servicio
FROM Personal p
LEFT JOIN PadronHabilitados pad ON p.DNI = pad.DNI
JOIN Hospitales h ON p.HospitalId = h.Id
JOIN Servicios s ON p.ServicioId = s.Id
WHERE (LOWER(p.Horario) LIKE '%2%racion%' OR LOWER(p.Horario) LIKE '%24%' OR LOWER(p.Horario) LIKE '%y cena%')
  AND (p.EsGuardia24 = 0 OR pad.EsGuardia24h = 0 OR pad.RacionesMaximasDia < 2);
GO
