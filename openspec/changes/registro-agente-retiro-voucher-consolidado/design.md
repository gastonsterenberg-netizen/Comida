# Design Document: Registro Normalizado de Agente que Retira Voucher Consolidado

## Context

En el sistema actual, cuando un servicio hospitalario opera con vouchers consolidados (`VoucherIndividual === false`), se genera un ticket impreso con un código QR general de servicio (`SERVICE_ORDER:{servicioId}:{tipoComida}:{servicio}`).
En el comedor, cuando el personal de Nutrición escanea este QR, la API responde con `agenteScanned: null` y se abre un modal con el listado de las viandas del servicio.
Al presionar "Confirmar Entrega Consolidada", únicamente se envían los `pedidoIds`. La base de datos actualiza `FechaEntregado` y `EntregadoPorUsuarioId` (el usuario del personal de Nutrición que atiende el lector), pero no registra qué agente o comisionado del hospital se presentó físicamente a retirar las viandas.

## Goals / Non-Goals

**Goals:**
- Registrar fehacientemente quién retira los pedidos en la modalidad de voucher consolidado.
- Mantener la base de datos 100% normalizada guardando la referencia `RetiradoPorAgenteId` hacia `PadronHabilitados(Id)`, evitando redundancia de strings de DNI o nombres.
- Garantizar **cero fricción** cuando se escanea el DNI de un agente del servicio: el sistema identifica de inmediato al agente y preasigna su `AgenteId` sin pedir datos extra.
- Exigir identificación obligatoria por DNI cuando se escanea el voucher QR impreso en papel.
- Permitir que quien retire sea **cualquier agente o comisionado activo del hospital** (no necesariamente del mismo servicio que las viandas).
- **Impedir la entrega** si el DNI escaneado/ingresado no figura en el padrón de agentes habilitados del hospital.
- Incorporar la columna `"Retirado Por (DNI y Nombre)"` en las planillas exportables en Excel y PDF.

**Non-Goals:**
- No exigir un segundo escaneo si el operador ya inició la transacción escaneando directamente el DNI del agente comisionado.
- No alterar el flujo de entrega de raciones individuales (cuando `VoucherIndividual === true`, el agente escanea su propio voucher/DNI personal).

## Architectural Decisions & Data Flow

```
                              ¿QUÉ SE ESCANEA EN NUTRICIÓN?
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
             [ DNI de Agente ]                             [ QR de Voucher ]
       (Pertenece a Servicio Consolidado)              (SERVICE_ORDER:... del papel)
                     │                                             │
                     ▼                                             ▼
          El sistema ya conoce                           El sistema solo conoce
           quién es la persona                              el servicio y turno
                     │                                             │
                     ▼                                             ▼
       ┌───────────────────────────┐                 ┌───────────────────────────┐
       │ Modal Consolidado         │                 │ Modal Consolidado         │
       │                           │                 │                           │
       │ ✅ Retira: Juan Pérez     │                 │ ⚠️ PIDE IDENTIFICACIÓN:   │
       │    (PadronId: 450)        │                 │ [ Input: Escanee DNI de ] │
       │    [Ya precargado]        │                 │ [ quien retira las viandas]│
       │                           │                 │                           │
       │ [✓] Ración 1: Carlos G.   │                 │ [✓] Ración 1: Carlos G.   │
       │ [✓] Ración 2: María L.    │                 │ [✓] Ración 2: María L.    │
       │                           │                 │                           │
       │ [ Confirmar Entrega ]     │                 │ [ Confirmar Entrega ]     │
       │  (Botón habilitado)       │                 │  (Bloqueado hasta leer DNI│
       └─────────────┬─────────────┘                 └─────────────┬─────────────┘
                     │                                             │
                     └──────────────────────┬──────────────────────┘
                                            │
                                            ▼
                           API: POST /api/deliveries/confirm-delivery
                           Body: {
                             pedidoIds: [101, 102],
                             retiradoPorAgenteId: 450
                           }
                                            │
                                            ▼
                           Base de Datos (Tabla PedidosComida):
                           • FechaEntregado: GETDATE()
                           • EntregadoPorUsuarioId: 45 (Operador Nutrición)
                           • RetiradoPorAgenteId: 450 (FK PadronHabilitados)
```

### 1. Modelo de Datos (`schema.prisma` y SQL Server)
En la tabla `PedidosComida`:
- Agregar columna `RetiradoPorAgenteId INT NULL`.
- Agregar relación en Prisma:
  ```prisma
  RetiradoPorAgente PadronHabilitados? @relation("PedidosRetiradosPorAgentes", fields: [RetiradoPorAgenteId], references: [Id], onDelete: NoAction, onUpdate: NoAction)
  ```
- En `PadronHabilitados`:
  ```prisma
  PedidosRetirados PedidosComida[] @relation("PedidosRetiradosPorAgentes")
  ```

### 2. Backend API

- **`GET /api/deliveries/scan-check`**:
  - Al escanear un DNI de un agente cuyo servicio es consolidado, retornar en `agenteScanned` su `Id` en `PadronHabilitados`, además de su `DNI`, `NombreCompleto` y `ServicioNombre`.
- **`GET /api/staff/padron/buscar-agente?dni=...` (o validación en endpoint)**:
  - Permitir al modal consultar rápidamente un DNI escaneado en el hospital para validar su existencia y recuperar su `Id` y `NombreCompleto`.
- **`POST /api/deliveries/confirm-delivery`**:
  - Parámetros en body: `{ pedidoIds: number[], retiradoPorAgenteId?: number }`.
  - Si el pedido es consolidado (`mode: 'servicio'`), validar que `retiradoPorAgenteId` sea obligatorio y pertenezca a un agente activo del hospital.
  - Actualizar `PedidosComida`:
    ```ts
    await prisma.pedidosComida.updateMany({
      where: { Id: { in: ids } },
      data: {
        FechaEntregado: new Date(),
        EntregadoPorUsuarioId: Number(userId),
        RetiradoPorAgenteId: Number(retiradoPorAgenteId)
      }
    });
    ```
  - Registrar en auditoría:
    `ENTREGA_RACIONES_CONSOLIDADAS`: *"Entregadas X raciones de [Servicio]. Retiró: [NombreCompleto] (DNI: [DNI])"*.
- **`GET /api/deliveries/summary`**:
  - Incluir `RetiradoPorAgente: { select: { Id: true, DNI: true, NombreCompleto: true } }` en la consulta para exponer el dato al frontend.

### 3. Frontend UI/UX (`frontend/src/app/page.tsx`)

- **Modal Consolidado**:
  - Detecta si `agenteScanned` vino en el payload inicial.
  - Si no vino (escaneo de QR de voucher):
    - Muestra un contenedor destacado con un input con autofoco: *"Escanee o ingrese el DNI del agente que retira:"*.
    - Al ingresar/escanear el DNI (mismo lector de código de barras o teclado), valida contra el padrón del hospital.
    - Si existe: muestra tarjeta de éxito en verde con el nombre del agente y su servicio, asignando su `AgenteId` al estado del modal.
    - Si no existe: muestra alerta roja *"El DNI no pertenece a ningún agente del hospital. No se permite la entrega."* y mantiene deshabilitado el botón de confirmación.
- **Historial de Entregas Recientes (Nutrición)**:
  - Enriquecer la columna de identificación para mostrar a quién se le despachó el pedido en retiros consolidados.
- **Exportaciones Excel y PDF**:
  - Agregar la columna `"Retirado Por (DNI y Nombre)"`. Si fue retiro individual, se muestra el mismo agente destinatario; si fue consolidado, se muestra el agente comisionado que retiró.

---

## Script SQL de Migración para Producción

```sql
-- =============================================================================
-- Migración: Agregar columna RetiradoPorAgenteId en PedidosComida
-- Entorno: Producción (SQL Server)
-- =============================================================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('PedidosComida') AND name = 'RetiradoPorAgenteId')
BEGIN
    ALTER TABLE PedidosComida ADD RetiradoPorAgenteId INT NULL;
    PRINT 'Columna RetiradoPorAgenteId agregada exitosamente en PedidosComida.';
END;
GO

IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_PedidosComida_RetiradoPorAgente')
BEGIN
    ALTER TABLE PedidosComida 
    ADD CONSTRAINT FK_PedidosComida_RetiradoPorAgente 
    FOREIGN KEY (RetiradoPorAgenteId) REFERENCES PadronHabilitados(Id);
    PRINT 'Clave foránea FK_PedidosComida_RetiradoPorAgente creada exitosamente.';
END;
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PedidosComida_RetiradoPorAgente' AND object_id = OBJECT_ID('PedidosComida'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_PedidosComida_RetiradoPorAgente 
    ON PedidosComida(RetiradoPorAgenteId) 
    WHERE RetiradoPorAgenteId IS NOT NULL;
    PRINT 'Índice IX_PedidosComida_RetiradoPorAgente creado exitosamente.';
END;
GO
```
