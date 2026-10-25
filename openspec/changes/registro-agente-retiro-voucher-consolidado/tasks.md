# Tasks: Registro Normalizado de Agente que Retira Voucher Consolidado

## 1. Database & Schema Adjustments

- [x] 1.1 Crear el archivo de migración SQL para producción en [`database/migration_retirado_por_voucher_consolidado.sql`](file:///e:/misdoc/desarrollo/Comida/database/migration_retirado_por_voucher_consolidado.sql).
- [x] 1.2 Actualizar el esquema Prisma en [`backend/prisma/schema.prisma`](file:///e:/misdoc/desarrollo/Comida/backend/prisma/schema.prisma) agregando la columna y relación `RetiradoPorAgenteId` en `PedidosComida` y su inversa en `PadronHabilitados`.
- [x] 1.3 Aplicar la columna en la base de datos SQL Server y regenerar Prisma Client (`npx prisma generate`).

## 2. Backend Implementation

- [x] 2.1 Actualizar `GET /api/deliveries/scan-check` en [`backend/src/index.ts`](file:///e:/misdoc/desarrollo/Comida/backend/src/index.ts) para incluir el `Id` de `PadronHabilitados` en el objeto `agenteScanned`.
- [x] 2.2 Agregar endpoint o método rápido de búsqueda/validación de agente por DNI (`GET /api/deliveries/check-pickup-agent?dni=...`) validando que pertenezca al hospital y esté activo en el padrón.
- [x] 2.3 Modificar `POST /api/deliveries/confirm-delivery` para recibir `retiradoPorAgenteId`, validar su existencia activa en `PadronHabilitados`, persistir el campo en `PedidosComida`, exigir `retiradoPorAgenteId` si se confirman pedidos de servicios consolidados y registrar el nombre/DNI del agente en el log de auditoría.
- [x] 2.4 Actualizar `GET /api/deliveries/summary` para incluir `RetiradoPorAgente` en el mapeo de entregas recientes.

## 3. Frontend UI/UX Implementation

- [x] 3.1 Actualizar el modal de entrega consolidada en [`frontend/src/app/page.tsx`](file:///e:/misdoc/desarrollo/Comida/frontend/src/app/page.tsx):
  - Si `agenteScanned` existe (escaneo directo de DNI), mostrar la confirmación directa del agente que retira con su `AgenteId`.
  - Si `agenteScanned` es nulo (escaneo de QR de voucher), renderizar un campo de entrada interactivo con foco automático para escanear/ingresar el DNI de quien retira.
  - Validar contra el padrón del hospital: si no existe, mostrar advertencia en rojo y deshabilitar el botón *"Registrar Entrega de Seleccionados"*.
  - Si el DNI existe, mostrar badge verde con Nombre Completo y habilitar la confirmación.
- [x] 3.2 Actualizar la función `handleConfirmDeliveryConsolidado` para enviar `retiradoPorAgenteId` al endpoint y asegurar que los botones de entrega en vista previa abran el modal consolidado.
- [x] 3.3 Actualizar la tabla de *Historial de Entregas Recientes* en la pestaña de Nutrición para reflejar quién retiró el pedido consolidado con columna dedicada *"Retirado Por"*.
- [x] 3.4 Actualizar las funciones de exportación `exportReporteEntregasExcel` y `exportReporteEntregasPDF` agregando la columna `"Retirado Por"`.

## 4. Verification & Testing

- [x] 4.1 Probar compilación limpia de Backend (`npm run build`) y Frontend (`npm run build`).
- [x] 4.2 Reconstruir y reiniciar contenedores de Docker (`docker compose up -d --build`).
