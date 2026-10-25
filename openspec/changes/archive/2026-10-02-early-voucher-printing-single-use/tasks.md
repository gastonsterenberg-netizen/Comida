# Tasks: Impresión Anticipada de Vouchers con Control de Emisión Única

## 1. Base de Datos y Modelo Prisma
- [x] 1.1 Modificar `backend/prisma/schema.prisma` agregando el modelo `ImpresionesVoucher` con la restricción `@@unique([ServicioId, FechaPedido, TipoComida])`.
- [x] 1.2 Ejecutar `npx prisma generate` en el backend para actualizar el cliente Prisma.
- [x] 1.3 Generar y formatear el script SQL DDL para aplicar en la base de datos de producción según las reglas del proyecto.

## 2. Backend (Endpoints de Impresión)
- [x] 2.1 Implementar el endpoint `GET /api/vouchers/status` en `backend/src/index.ts` para retornar si un servicio ya imprimió el voucher de un turno y fecha dados.
- [x] 2.2 Implementar el endpoint `POST /api/vouchers/print` en `backend/src/index.ts` que:
  - Valide si el rol es `JEFE_SERVICIO` y rechace con error 400 si la impresión ya existe en `ImpresionesVoucher`.
  - Registre la impresión en `ImpresionesVoucher` para `JEFE_SERVICIO`.
  - Permita la impresión sin restricciones si el rol es `GERENTE` o `ADMINISTRADOR`.

## 3. Frontend (Interfaz y Lógica de Cliente)
- [x] 3.1 Agregar estado `vouchersImpresos` en `JefeServicioView` de `frontend/src/app/page.tsx` para consultar el estado de emisión del turno.
- [x] 3.2 Actualizar la función `handleImprimirVouchers` en `frontend/src/app/page.tsx`:
  - Permitir al Jefe de Servicio presionar el botón antes de la hora límite de cierre.
  - Desplegar alerta SweetAlert2 advirtiendo que la emisión es única antes de procesar.
  - Invocar `POST /api/vouchers/print` previo a la apertura de la ventana de impresión.
- [x] 3.3 Mostrar distintivo visual o deshabilitar botón para el Jefe de Servicio una vez impreso el voucher, indicando el usuario y hora de emisión.
- [x] 3.4 Asegurar que en la vista de Gerente la función de impresión de vouchers no aplique restricción de horario ni de emisión única.

## 4. Verificación y Pruebas
- [x] 4.1 Reconstruir contenedores Docker (`docker compose build`) y verificar que frontend y backend compilen exitosamente.
- [x] 4.2 Probar la impresión anticipada con un usuario Jefe de Servicio.
- [x] 4.3 Verificar que el segundo intento de impresión por el mismo Jefe de Servicio sea bloqueado.
- [x] 4.4 Verificar que un usuario Gerente pueda reimprimir el voucher sin impedimentos.
