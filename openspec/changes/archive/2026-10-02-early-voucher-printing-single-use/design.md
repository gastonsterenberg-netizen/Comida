# Design: Impresión Anticipada de Vouchers con Control de Emisión Única

## Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO TÉCNICO DE EMISIÓN DE VOUCHER                      │
└─────────────────────────────────────────────────────────────────────────────┘

 [Jefe de Servicio / Gerente]
              │
              ▼
 ┌─────────────────────────┐
 │ Click "Vouchers Alm."   │
 └────────────┬────────────┘
              │
              ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ GET /api/vouchers/status?fecha=YYYY-MM-DD&tipoComida=Almuerzo │
 └────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
                  ¿Ya impreso para este servicio?
                       /                 \
                      SÍ                  NO
                     /                     \
                    ▼                       ▼
            ¿Rol es GERENTE?         Confirmar emisión
              /          \            (POST /api/vouchers/print)
            SÍ            NO                       │
           /               \                       ▼
          ▼                 ▼              Registra en BD y
   Permitir Reimpresión   Bloquear         Abre ventana `window.print()`
     (Log Auditoría)     "Contacte a
                          Gerencia"
```

## Database Schema (`schema.prisma`)

```prisma
model ImpresionesVoucher {
  Id                  Int        @id @default(autoincrement())
  HospitalId          Int
  ServicioId          Int
  FechaPedido         DateTime   @db.Date
  TipoComida          String     @db.NVarChar(20)
  ImpresoPorUsuarioId Int
  FechaImpresion      DateTime   @default(now())

  Hospital            Hospitales @relation(fields: [HospitalId], references: [Id], onDelete: NoAction, onUpdate: NoAction)
  Servicio            Servicios  @relation(fields: [ServicioId], references: [Id], onDelete: NoAction, onUpdate: NoAction)
  Usuario             Usuarios   @relation(fields: [ImpresoPorUsuarioId], references: [Id], onDelete: NoAction, onUpdate: NoAction)

  @@unique([ServicioId, FechaPedido, TipoComida])
  @@index([HospitalId, FechaPedido])
}
```

### Script SQL para Producción
```sql
-- Script de migración para producción: Creación de tabla ImpresionesVoucher
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
END
GO
```

## Backend API Specification

### 1. `GET /api/vouchers/status`
- **Query Params**: `fecha` (YYYY-MM-DD), `tipoComida` ('Almuerzo'|'Cena'), `servicioId` (opcional si viene en token).
- **Respuesta**:
  ```json
  {
    "impreso": true,
    "impresoPor": "Juan Perez",
    "fechaImpresion": "2026-10-02T19:30:00.000Z"
  }
  ```

### 2. `POST /api/vouchers/print`
- **Body Params**: `{ "fecha": "YYYY-MM-DD", "tipoComida": "Almuerzo" | "Cena", "servicioId": 12 }`
- **Lógica**:
  - Obtiene el rol del usuario autenticado (`req.user.rol`).
  - Si el rol es `JEFE_SERVICIO`:
    - Verifica existencia en `ImpresionesVoucher`. Si existe, retorna `400 Bad Request`: `{"error": "El voucher para este servicio y turno ya fue impreso anteriormente. Contacte al gerente si necesita reimprimir."}`.
    - Si no existe, realiza `prisma.impresionesVoucher.create(...)` y retorna `{ "ok": true }`.
  - Si el rol es `GERENTE` o `ADMIN`:
    - Opcionalmente inserta/actualiza log sin bloquear, retorna `{ "ok": true, "reimpresion": true }`.

## Frontend Integration (`frontend/src/app/page.tsx`)

1. **Consulta de Estado**:
   - En `JefeServicioView`, al cargar la vista o cambiar la fecha/turno, consultar `GET /api/vouchers/status`.
   - Guardar estado local `vouchersImpresos` para indicar en la UI si el turno ya fue impreso.

2. **Acción de Impresión (`handleImprimirVouchers`)**:
   - Si no ha vencido el horario de cierre y el usuario es Jefe:
     - Mostrar diálogo SweetAlert2 de confirmación con advertencia de emisión única.
     - Si confirma, llamar a `POST /api/vouchers/print`.
     - Si la respuesta es exitosa, proceder a abrir la ventana de impresión HTML (`window.print()`) y refrescar estado.
   - Si el usuario es Gerente:
     - Imprimir directamente llamando al endpoint en modo excepción si aplica.
