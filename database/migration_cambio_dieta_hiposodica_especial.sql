-- =====================================================================================
-- SCRIPT DE MIGRACIÓN: HABILITACIÓN DE 'Hiposódica' Y 'Especial' (CONSERVANDO HISTORIAL)
-- ENTORNO: PRODUCCIÓN (SQL SERVER)
-- NOTA: Este script NO altera los registros históricos pasados de PedidosComida.
--       El historial previo se conserva 100% fiel a lo solicitado en su momento ('Gástrica').
-- =====================================================================================

BEGIN TRANSACTION;

-- 1. Eliminar cualquier CHECK CONSTRAINT que restrinja los valores permitidos de TipoDieta en PedidosComida
DECLARE @ConstraintName NVARCHAR(200);

SELECT @ConstraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.columns c ON cc.parent_object_id = c.object_id AND cc.parent_column_id = c.column_id
JOIN sys.tables t ON cc.parent_object_id = t.object_id
WHERE t.name = 'PedidosComida' AND c.name = 'TipoDieta';

IF @ConstraintName IS NOT NULL
BEGIN
    DECLARE @DropSql NVARCHAR(500) = N'ALTER TABLE PedidosComida DROP CONSTRAINT ' + QUOTENAME(@ConstraintName);
    EXEC sp_executesql @DropSql;
    PRINT 'Check constraint ' + @ConstraintName + ' eliminado de PedidosComida(TipoDieta).';
END
ELSE
BEGIN
    PRINT 'No se encontró check constraint restrictivo en PedidosComida(TipoDieta).';
END;

-- 2. Actualizar la configuración de dietas habilitadas en los Hospitales para futuros pedidos
-- Los hospitales que tenían 'Gastrica' habilitada pasan a tener 'Hiposódica'
UPDATE Hospitales
SET DietasHabilitadas = REPLACE(REPLACE(DietasHabilitadas, 'Gástrica', 'Hiposódica'), 'Gastrica', 'Hiposódica')
WHERE DietasHabilitadas LIKE '%Gastrica%' OR DietasHabilitadas LIKE '%Gástrica%';

PRINT 'Hospitales actualizados con Hiposódica para nuevos pedidos: ' + CAST(@@ROWCOUNT AS NVARCHAR(20));

COMMIT TRANSACTION;
GO
