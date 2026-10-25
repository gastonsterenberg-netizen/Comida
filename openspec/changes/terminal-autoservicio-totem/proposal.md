# Change Proposal: Terminal de Autoservicio (Tótem) para Validación de Raciones

## Why

Actualmente, todas las raciones de comida (tanto de servicios consolidados como individuales) se validan en la estación de entrega de Nutrición/Cocina mediante un operador humano que manipula la pantalla y la pistola lectora.
Durante los horarios pico de entrega (12:00 a 14:00 hs y 20:00 a 22:00 hs):
- Se generan largas colas de agentes hospitalarios esperando retirar su vianda individual.
- El personal de cocina o nutrición debe interrumpir la manipulación higiénica de alimentos para operar una computadora o pistola de escaneo.
- Se producen errores involuntarios en la entrega de platos para dietas especiales (*ej. Celíaco, Hiposódico, Diabético*) debido a la rapidez del despacho.

Para resolver esto, se requiere implementar una **Terminal de Autoservicio (Tótem de Despacho)** ubicada en la antesala del comedor. Los agentes que retiran raciones individuales presentarán directamente su DNI o voucher en el lector 2D del tótem, el sistema validará el pedido de forma instantánea y emitirá un ticket térmico impreso. El agente entregará dicho ticket en la ventanilla para recibir su plato, eliminando colas y liberando al personal de cocina de tareas administrativas.

## What Changes

1. **Ruta Dedicada de Autoservicio (`/totem` en Frontend):**
   - Pantalla completa optimizada para terminal fija (no táctil, sin mouse ni teclado expuesto al público).
   - El lector de códigos 2D / QR USB opera como único periférico de entrada mediante captura de foco perpetua en segundo plano.
   - Reloj digital en vivo y determinación automática del turno según la hora del día:
     - **00:00 a 15:59 hs:** Turno `☀️ ALMUERZO`
     - **16:00 a 23:59 hs:** Turno `🌙 CENA`
   - Retroalimentación audiovisual sonora por parlantes (tono agudo agradable para confirmación, tono grave de alerta para rechazo).
   - Mensajes específicos de estado:
     - Éxito: **"¡Ración confirmada! Imprimiendo ticket..."** (4 segundos en pantalla verde antes de volver a reposo).
     - Voucher consolidado: **"Voucher de Servicio Consolidado: Este tipo de pedido se valida en nutricion"** (5 segundos en pantalla roja).
     - Ración ya retirada: **"Ración ya retirada hoy a las {hora} hs"**.
     - Sin pedido: **"No posees pedido aprobado para {turno} hoy"**.

2. **Impresión Térmica Silenciosa USB (80mm):**
   - Salida por impresora térmica USB conectada a la PC mediante `--kiosk-printing` en Chrome/Edge.
   - Formato de ticket optimizado para lectura rápida de cocina, enfocado en el agente y su tipo de dieta:
     - Encabezado institucional del hospital.
     - Fecha y Hora exacta de validación.
     - Turno: ALMUERZO o CENA.
     - Agente: Apellido y Nombre, DNI y Servicio.
     - Dieta destacada en tipografía grande: `DIETA: *** {TipoDieta} ***`.
     - ID del Pedido y terminal.
     - Pie de ticket: **"Entregue este ticket para recibir su ración"**.

3. **Backend y Nuevo Rol de Sistema:**
   - Creación del nuevo Rol `Totem` (Id: 6 en la tabla `Roles`).
   - Endpoint transaccional dedicado `POST /api/totem/dispense` que:
     - Identifica al agente a partir del DNI escaneado (PDF417 de RENAPER) o voucher individual.
     - Rechaza vouchers consolidados (`SERVICE_ORDER:`) guiando al usuario a ventanilla.
     - Verifica existencia de pedido `'Aprobado'` para la fecha y turno actual.
     - Valida que no haya sido retirado previamente (`FechaEntregado IS NULL`).
     - Realiza la actualización atómica registrando `FechaEntregado = now()`, `EntregadoPorUsuarioId = usuarioTotem.Id` y `RetiradoPorAgenteId = agente.Id`.

4. **Autonomía Operativa (Sin Login Diario):**
   - Sesión persistente de larga duración en la terminal con autorenovación en cada arranque.
   - En caso de reinicio de la PC o cortes de energía, Windows inicia sesión automáticamente e invoca el navegador en modo kiosco, entrando directo a `/totem` listo para escanear en segundos.
   - Procedimiento de activación inicial o reseteo por escaneo de QR maestro de activación, evitando la necesidad de conectar periféricos auxiliares.

## Capabilities

### New Capabilities
- `self-service-kiosk-dispense`: Capacidad para validar pedidos de comidas individuales mediante terminal de autoservicio con lector 2D e impresión térmica de tickets sin intervención de operadores.

### Modified Capabilities
- `user-roles-permissions`: Incorporación del rol `Totem` (Id 6) con permisos exclusivos y restringidos al endpoint de despacho de autoservicio.
- `meal-delivery-management`: Soporte para entregas realizadas a través del canal de autoservicio manteniendo trazabilidad completa del titular que retiró.

## Impact

- **Base de Datos**: Inserción del rol `Totem` (Id 6) en la tabla `Roles` (idempotente). No se modifican estructuras de tablas existentes.
- **Backend**: Creación del endpoint `POST /api/totem/dispense` y configuración de autenticación para terminales de autoservicio.
- **Frontend**: Nueva página `/totem` en Next.js con diseño de alto impacto visual, audio web con Web Audio API o archivos de sonido, y estilos `@media print` para tickets térmicos de 80mm.
