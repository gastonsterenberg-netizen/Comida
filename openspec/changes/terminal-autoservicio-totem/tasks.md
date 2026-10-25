# Tasks: Terminal de Autoservicio (Tótem) para Validación de Raciones

## 1. Database & Role Setup

- [x] 1.1 Crear script de migración SQL para producción asegurando el rol `Totem` (Id: 6, Nombre: `'Totem'`) en la tabla `Roles` de `ComidaDB`.
- [x] 1.2 Actualizar la función `ensureRoles()` en [`backend/src/index.ts`](file:///e:/misdoc/desarrollo/Comida/backend/src/index.ts) para incluir `{ Id: 6, Nombre: 'Totem' }` automáticamente en el arranque.

## 2. Backend Implementation

- [x] 2.1 Crear middleware de verificación de permisos `isTotem` en [`backend/src/middleware/auth.ts`](file:///e:/misdoc/desarrollo/Comida/backend/src/middleware/auth.ts) o [`backend/src/index.ts`](file:///e:/misdoc/desarrollo/Comida/backend/src/index.ts) permitiendo roles Admin (1) y Totem (6).
- [x] 2.2 Implementar endpoint transaccional `POST /api/totem/dispense`:
  - Detección automática del turno según la hora local de Buenos Aires (`< 16:00 hs -> 'Almuerzo'`, `>= 16:00 hs -> 'Cena'`).
  - Detección y rechazo de vouchers consolidados (`SERVICE_ORDER:` o `-Total:`) con el mensaje: *"Voucher de Servicio Consolidado: Este tipo de pedido se valida en nutricion"*.
  - Extracción de DNI mediante `extractDniFromScan(rawCode)` soportando documentos PDF417 de RENAPER y vouchers individuales.
  - Búsqueda de pedido `'Aprobado'` para la fecha de hoy y el turno activo.
  - Validación de entrega previa: si ya fue entregado, retornar HTTP 400 con la hora exacta de entrega.
  - Transacción atómica registrando `FechaEntregado = now()`, `EntregadoPorUsuarioId = usuarioTotem.Id` y `RetiradoPorAgenteId = agente.Id`.
  - Respuesta con payload estructurado para impresión del ticket.
- [x] 2.3 Implementar endpoint `GET /api/totem/activation-token` accesible por Nutrición y Gerencia para emitir el token o QR maestro de vinculación de terminales con imagen QR Base64.

## 3. Frontend Implementation (`/totem`)

- [x] 3.1 Crear la ruta y vista de pantalla completa en [`frontend/src/app/totem/page.tsx`](file:///e:/misdoc/desarrollo/Comida/frontend/src/app/totem/page.tsx) con diseño modo kiosco, reloj digital en vivo y badge de turno activo.
- [x] 3.2 Implementar captura de foco perpetua para lectores de código de barras 2D USB (Keyboard Wedge) garantizando recepción del escaneo sin importar clics o desenfoques.
- [x] 3.3 Implementar generador de audio nativo con Web Audio API (acorde armónico de éxito y tono grave de alerta) y síntesis de voz en español con Web Speech API (`window.speechSynthesis`).
- [x] 3.4 Implementar estados visuales con transiciones automáticas:
  - Reposo / Standby.
  - Procesando validación.
  - Éxito (pantalla verde esmeralda, 4 segundos) con el texto: *"¡Ración confirmada! Imprimiendo ticket..."*.
  - Rechazo (pantalla roja, 5 segundos) con motivos específicos (ausencia de pedido, ración ya entregada o consolidado).
- [x] 3.5 Diseñar e integrar la plantilla de impresión térmica para papel de 80mm (`@media print`):
  - Encabezado institucional, fecha, hora, turno, agente, DNI, servicio.
  - Dieta destacada en gran tamaño: `DIETA: *** {TipoDieta} ***`.
  - Pie de ticket: *"Entregue este ticket para recibir su ración"*.
- [x] 3.6 Implementar sistema de activación inicial por escaneo de QR maestro `TOTEM_ACTIVATE:{token}` con persistencia en `localStorage`, garantizando arranque automático sin login diario.

## 4. Verification & Testing

- [x] 4.1 Probar compilación limpia de Backend (`npm run build`) y Frontend (`next build`).
- [x] 4.2 Probar flujo completo de escaneo de DNI, validación de turnos (Almuerzo vs Cena), rechazo de vouchers consolidados e impresión silenciosa.
- [x] 4.3 Generar script SQL de producción para la creación del rol 6 y usuario tótem.
- [x] 4.4 Reiniciar y verificar contenedores Docker locales.
