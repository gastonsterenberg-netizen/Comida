# Change Proposal: Registro Normalizado de Agente que Retira Voucher Consolidado

## Why

Actualmente, cuando un servicio hospitalario tiene configurada la modalidad de **Voucher Consolidado** (`VoucherIndividual === false`), se emite un único ticket de pedido para todo el departamento con un código QR general (`SERVICE_ORDER:{servicioId}:{tipoComida}:{servicio}`).
Al momento de la entrega en la Estación de Nutrición, el sistema únicamente registra la fecha/hora (`FechaEntregado`) y el usuario de Nutrición que operó la estación (`EntregadoPorUsuarioId`).

Esto genera una importante falta de trazabilidad en el comedor:
- No queda registro de **quién retiró físicamente** el lote de viandas en representación del servicio.
- En el modal de entrega consolidada aparece el texto genérico: `Agente que retira: Agente (DNI: SERVICE_ORDER:...)`.
- Ante reclamos o faltantes ("en el servicio nadie recibió la comida"), Nutrición no tiene forma de auditar a qué persona física se le entregó el consolidado.

Se requiere registrar formalmente al agente que retira el voucher consolidado asociándolo a la tabla normalizada `PadronHabilitados` mediante la columna `RetiradoPorAgenteId`, asegurando máxima consistencia en la base de datos sin duplicar datos personales en texto plano.

## What Changes

- **Modelo de Base de Datos**: Agregar la columna `RetiradoPorAgenteId INT NULL` en la tabla `PedidosComida`, con clave foránea referenciando a `PadronHabilitados(Id)` y su correspondiente índice no agrupado.
- **Flujo Directo por DNI (Cero fricción)**: Si en la estación de entrega se escanea el DNI de un agente perteneciente a un servicio consolidado, el sistema identifica automáticamente al agente en el Padrón y preasigna su `AgenteId` como quien retira, habilitando la confirmación de entrega de forma instantánea sin pasos adicionales.
- **Flujo por Escaneo de Voucher QR de Servicio**: Si se escanea el QR impreso en el papel (`SERVICE_ORDER:...`), al no contener datos de personas, el modal de entrega consolidada solicitará de forma obligatoria el escaneo o ingreso del DNI de la persona que retira.
- **Validación Estricta contra Padrón**: Puede ser cualquier agente o comisionado activo del hospital (no restringido al mismo servicio). Si el DNI escaneado no existe en `PadronHabilitados` para ese hospital, el sistema **no permitirá la entrega** y bloqueará el botón de confirmación con un mensaje claro de advertencia.
- **Confirmación Atómica y Auditoría**: El endpoint `POST /api/deliveries/confirm-delivery` recibirá el `retiradoPorAgenteId` y actualizará las raciones seleccionadas, dejando asentada en el log de auditoría la entrega con el nombre, DNI y servicio del agente que retiró.
- **Visualización en Pantalla y Reportes Exportables**:
  - En la pestaña de Nutrición (*Historial de Entregas Recientes*), visualizar quién retiró las raciones.
  - En las planillas exportables en Excel y PDF, incorporar la columna específica: `"Retirado Por (DNI y Nombre)"`.

## Capabilities

### New Capabilities
- `consolidated-voucher-pickup-tracking`: Capacidad para validar e imputar la identidad del agente del hospital que retira raciones bajo la modalidad de voucher consolidado.

### Modified Capabilities
- `meal-delivery-management`: Extender el endpoint `POST /api/deliveries/confirm-delivery` y la consulta de resumen `GET /api/deliveries/summary` para soportar la relación `RetiradoPorAgente`.
- `delivery-reporting`: Actualizar los reportes e interfaces de exportación de entregas (Excel y PDF) incorporando la columna de agente que retiró.

## Impact

- **Base de Datos**: Esquema Prisma (`backend/prisma/schema.prisma`) y migración SQL en producción para la tabla `PedidosComida`.
- **Backend API**: Endpoints `/api/deliveries/scan-check`, `/api/deliveries/confirm-delivery` y `/api/deliveries/summary`.
- **Frontend Next.js**: Componente modal de entrega consolidada y tabla de historial/reportes en [`frontend/src/app/page.tsx`](file:///e:/misdoc/desarrollo/Comida/frontend/src/app/page.tsx).
