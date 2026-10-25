-- ===============================================================================
-- SCRIPT DE MIGRACIÓN PARA ENTORNO DE PRODUCCIÓN
-- Módulo: Control de Impresión Anticipada y Única de Vouchers de Comida
-- ===============================================================================

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ImpresionesVoucher]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ImpresionesVoucher] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [HospitalId] INT NOT NULL,
        [ServicioId] INT NOT NULL,
        [FechaPedido] DATE NOT NULL,
        [TipoComida] NVARCHAR(20) NOT NULL,
        [ImpresoPorUsuarioId] INT NOT NULL,
        [FechaImpresion] DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT [PK_ImpresionesVoucher] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_ImpresionesVoucher_Hospitales] FOREIGN KEY ([HospitalId]) REFERENCES [dbo].[Hospitales] ([Id]),
        CONSTRAINT [FK_ImpresionesVoucher_Servicios] FOREIGN KEY ([ServicioId]) REFERENCES [dbo].[Servicios] ([Id]),
        CONSTRAINT [FK_ImpresionesVoucher_Usuarios] FOREIGN KEY ([ImpresoPorUsuarioId]) REFERENCES [dbo].[Usuarios] ([Id])
    );

    CREATE UNIQUE NONCLUSTERED INDEX [UQ_ImpresionesVoucher_Servicio_Fecha_Tipo]
        ON [dbo].[ImpresionesVoucher]([ServicioId] ASC, [FechaPedido] ASC, [TipoComida] ASC);

    CREATE NONCLUSTERED INDEX [IX_ImpresionesVoucher_Hospital_Fecha]
        ON [dbo].[ImpresionesVoucher]([HospitalId] ASC, [FechaPedido] ASC);
        
    PRINT 'Tabla ImpresionesVoucher creada con éxito.';
END
ELSE
BEGIN
    PRINT 'La tabla ImpresionesVoucher ya existe en la base de datos.';
END
GO
