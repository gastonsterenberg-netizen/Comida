-- =========================================================================================
-- SCRIPT DE REPARACIÓN PARA PRODUCCIÓN (SQL SERVER)
-- Propósito: Restaurar en SolicitudesPlantel los agentes faltantes que fueron omitidos
--            por la sobrescritura anterior al enviar múltiples agentes de a uno.
-- =========================================================================================

BEGIN TRANSACTION;

BEGIN TRY
    -- 1. Crear tabla temporal para consolidar agentes pendientes por solicitud
    CREATE TABLE #AgentesPendientes (
        SolicitudId INT,
        DNI NVARCHAR(20),
        NombreCompleto NVARCHAR(200)
    );

    -- 2. Insertar agentes con pedidos de comida recientes que no están activos en Personal
    --    ni tampoco incluidos aún en el JSON de SolicitudesPlantel
    INSERT INTO #AgentesPendientes (SolicitudId, DNI, NombreCompleto)
    SELECT DISTINCT 
        s.Id AS SolicitudId,
        COALESCE(p.EmergenciaDNI, per.DNI) AS DNI,
        COALESCE(NULLIF(p.EmergenciaNombreCompleto, ''), per.NombreCompleto, 'AGENTE NUEVO') AS NombreCompleto
    FROM SolicitudesPlantel s
    INNER JOIN PedidosComida p ON p.SolicitadoPorUsuarioId = s.SolicitadoPorId 
                              AND p.FechaPedido >= CAST(GETDATE() AS DATE)
                              AND p.Estado IN ('Pendiente', 'Aprobado')
    LEFT JOIN Personal per ON per.Id = p.PersonalId
    WHERE s.Estado = 'Pendiente'
      AND COALESCE(p.EmergenciaDNI, per.DNI) IS NOT NULL
      -- Asegurar que el agente NO esté activo ya en el servicio
      AND NOT EXISTS (
          SELECT 1 FROM Personal px 
          WHERE px.HospitalId = s.HospitalId 
            AND px.ServicioId = s.ServicioId 
            AND px.DNI = COALESCE(p.EmergenciaDNI, per.DNI)
            AND px.Activo = 1
      )
      -- Asegurar que el DNI NO esté presente ya dentro del JSON de la solicitud
      AND s.DatosJson NOT LIKE '%' + COALESCE(p.EmergenciaDNI, per.DNI) + '%';

    -- 3. Cursor para reconstruir y actualizar el DatosJson de cada solicitud pendiente incompleta
    DECLARE @SolId INT;
    DECLARE @DNI NVARCHAR(20);
    DECLARE @Nombre NVARCHAR(200);
    DECLARE @JsonActual NVARCHAR(MAX);

    DECLARE cur CURSOR FOR
    SELECT DISTINCT SolicitudId FROM #AgentesPendientes;

    OPEN cur;
    FETCH NEXT FROM cur INTO @SolId;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @JsonActual = DatosJson FROM SolicitudesPlantel WHERE Id = @SolId;
        
        -- Si el JSON termina en ']', quitar corchete final para concatenar
        IF CHARINDEX(']', @JsonActual) > 0
        BEGIN
            SET @JsonActual = SUBSTRING(@JsonActual, 1, LEN(@JsonActual) - 1);
        END

        DECLARE curAgentes CURSOR FOR
        SELECT DNI, NombreCompleto FROM #AgentesPendientes WHERE SolicitudId = @SolId;

        OPEN curAgentes;
        FETCH NEXT FROM curAgentes INTO @DNI, @Nombre;

        WHILE @@FETCH_STATUS = 0
        BEGIN
            -- Formatear coma si ya había elementos en el arreglo JSON
            IF LEN(@JsonActual) > 2 AND RIGHT(@JsonActual, 1) <> '['
            BEGIN
                SET @JsonActual = @JsonActual + ',';
            END

            -- Agregar el objeto JSON del agente faltante
            SET @JsonActual = @JsonActual + '{"DNI":"' + @DNI + '","NombreCompleto":"' + REPLACE(@Nombre, '"', '\"') + '","Horario":"Almuerzo o Cena","ConVianda":true,"isNuevo":true,"racionAnterior":0,"racionNueva":1}';

            FETCH NEXT FROM curAgentes INTO @DNI, @Nombre;
        END

        CLOSE curAgentes;
        DEALLOCATE curAgentes;

        -- Cerrar el arreglo JSON
        SET @JsonActual = @JsonActual + ']';

        -- Actualizar la solicitud en la base de datos
        UPDATE SolicitudesPlantel
        SET DatosJson = @JsonActual
        WHERE Id = @SolId;

        PRINT 'Solicitud ID ' + CAST(@SolId AS NVARCHAR) + ' reparada exitosamente con sus agentes faltantes.';

        FETCH NEXT FROM cur INTO @SolId;
    END

    CLOSE cur;
    DEALLOCATE cur;

    DROP TABLE #AgentesPendientes;

    COMMIT TRANSACTION;
    PRINT '=======================================================';
    PRINT 'Proceso de reparación de solicitudes completado con éxito.';
    PRINT '=======================================================';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    PRINT 'Error en la ejecución de la reparación: ' + ERROR_MESSAGE();
END CATCH;
