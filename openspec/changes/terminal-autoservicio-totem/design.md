# Design Document: Terminal de Autoservicio (Tótem) para Validación de Raciones

## Context & Architecture Overview

La terminal de autoservicio es una estación física compuesta por una PC x86, un monitor estándar (no táctil), un lector de código de barras / QR 2D USB configurado en modo emulación de teclado (HID Keyboard Wedge), parlantes y una impresora térmica USB de tickets (80mm).

```
   ┌────────────────────────────────────────────────────────┐
   │                  HARDWARE DEL TÓTEM                    │
   │                                                        │
   │  ┌──────────────┐     ┌──────────────┐   ┌──────────┐  │
   │  │ Monitor Fijo │     │  Lector 2D   │   │ Impresora│  │
   │  │  (No Táctil) │     │   (USB HID)  │   │  Térmica │  │
   │  └──────▲───────┘     └──────┬───────┘   └────▲─────┘  │
   │         │                    │                │        │
   │         │ (Video)            │ (Pulsaciones)  │ (USB)  │
   │         │                    │                │        │
   │  ┌──────┴────────────────────▼────────────────┴─────┐  │
   │  │               PC / NUC del Tótem                 │  │
   │  │  Windows Auto-Logon + Chrome Kiosk Mode          │  │
   │  │  URL: http://servidor:3000/totem                 │  │
   │  └───────────────────────────▲──────────────────────┘  │
   └──────────────────────────────┼─────────────────────────┘
                                  │ (HTTP REST / JWT)
                                  ▼
                     ┌───────────────────────────┐
                     │     Backend Express       │
                     │  POST /api/totem/dispense │
                     └────────────▲──────────────┘
                                  │ (Prisma Client)
                                  ▼
                     ┌───────────────────────────┐
                     │    SQL Server ComidaDB    │
                     │  (PedidosComida, Padron)  │
                     └───────────────────────────┘
```

---

## 1. Frontend: Ruta `/totem` y Máquina de Estados

La página `/totem` en Next.js se implementa como un componente reactivo autosuficiente que no carga dependencias de navegación ni módulos administrativos.

### Máquina de Estados Visual

```
                     ┌───────────────────────┐
                     │       STANDBY         │
        ┌───────────▶│  (Reloj + Turno +     │◀──────────┐
        │            │   "Acerque su DNI")   │           │
        │            └───────────┬───────────┘           │
        │                        │                       │
        │                        │ Código Escaneado      │
        │                        ▼                       │
        │            ┌───────────────────────┐           │
        │            │      PROCESANDO       │           │
        │            │  (Validación API)     │           │
        │            └─────┬───────────┬─────┘           │
        │                  │           │                 │
        │        Éxito (200)       Error / Rechazo (400) │
        │                  │           │                 │
        │                  ▼           ▼                 │
        │        ┌───────────────┐   ┌───────────────┐   │
        │        │ PANTALLA VERDE│   │ PANTALLA ROJA │   │
        │        │ Beep Confirm. │   │ Tono Alerta   │   │
        │        │ Imprime Ticket│   │ Muestra Causa │   │
        │        └───────┬───────┘   └───────┬───────┘   │
        │                │                   │           │
        └────────────────┴───────────────────┴───────────┘
               Espera 4s                   Espera 5s
```

### Captura de Foco Perpetua (Keyboard Wedge)
Para que el lector USB funcione siempre sin requerir que el usuario haga clic en un campo:
- Un `<input type="text" />` oculto visualmente pero activo en el DOM.
- Event listener global `window.addEventListener('keydown', ...)` que intercepta cualquier entrada y asegura que los caracteres se dirijan al buffer del escáner.
- Re-enfoque automático inmediato en evento `blur` y cada 300ms con `setInterval`.
- Buffer de escaneo que procesa la cadena al detectar el terminador `Enter` (código ASCII 13).

### Generador de Audio Nativo (Web Audio API)
Para no depender de archivos MP3/WAV externos que puedan fallar por caché, el audio se genera sintéticamente en el navegador:
- **Tono de Éxito:** Acorde de dos frecuencias armónicas ascendentes (587 Hz -> 880 Hz, duración 300ms) tipo campanilla agradable.
- **Tono de Rechazo:** Dos pulsos en frecuencia grave (220 Hz -> 160 Hz, duración 400ms) tipo advertencia industrial.

---

## 2. Impresión Térmica Silenciosa (80mm)

### Ejecución en Modo Kiosco
El navegador de la terminal se ejecutará mediante el acceso directo:
```cmd
chrome.exe --kiosk --kiosk-printing --noerrdialogs --disable-pinch http://servidor:3000/totem
```
Al invocar `window.print()`, Chrome imprime silenciosamente en la impresora predeterminada de Windows sin mostrar diálogo de confirmación.

### Plantilla de Ticket CSS (@media print)
- Ancho fijado en `80mm` con márgenes cero (`@page { size: 80mm auto; margin: 0; }`).
- Tipografía monoespaciada de alto contraste en negro puro `#000000`.
- El bloque del ticket permanece oculto en pantalla normal (`display: none`) y se hace visible únicamente al imprimir (`@media print { display: block; }`).
- Corte de papel ejecutado por el driver de la impresora térmica tras la finalización del documento.

---

## 3. Backend: Endpoint `POST /api/totem/dispense`

### Firma del Endpoint
```http
POST /api/totem/dispense
Authorization: Bearer <jwt_totem_token>
Content-Type: application/json

{
  "rawCode": "00238295166LEALGABRIELAF23042249..."
}
```

### Lógica Transaccional Atómica
1. **Verificación de Rol y Hospital:** Validar que el token pertenezca al rol `Totem` (RolId = 6) y extraer su `HospitalId`.
2. **Determinación del Turno Actual:**
   - Obtener hora actual en zona horaria local (`America/Argentina/Buenos_Aires`).
   - `const activeTurno = hour < 16 ? 'Almuerzo' : 'Cena';`
3. **Filtro de Vouchers Consolidados:**
   - Si `rawCode.startsWith('SERVICE_ORDER:')` o contiene `-Total:`:
     - Retornar HTTP 400 con mensaje: *"Voucher de Servicio Consolidado: Este tipo de pedido se valida en nutricion"*.
4. **Extracción de Identidad:**
   - Utilizar `extractDniFromScan(rawCode)` para obtener el DNI de la persona.
   - Si no se detecta DNI, retornar HTTP 400: *"Código de documento o voucher no reconocido"*.
5. **Búsqueda del Pedido:**
   - Buscar en `PedidosComida` para la fecha actual (`todayStr`), `Estado: 'Aprobado'`, `TipoComida: activeTurno`, filtrando por el DNI (como agente titular, reemplazo o emergencia).
   - Si no existe: Retornar HTTP 404: *"No posees pedido aprobado para {activeTurno} hoy"*.
6. **Validación de Entrega Previa:**
   - Si `pedido.FechaEntregado !== null`:
     - Formatear la hora de entrega previa (`HH:mm hs`).
     - Retornar HTTP 400: *"Ración ya retirada hoy a las {hora} hs"*.
7. **Actualización Atómica y Entrega:**
   - Actualizar el registro:
     ```typescript
     await prisma.pedidosComida.update({
       where: { Id: pedido.Id },
       data: {
         FechaEntregado: new Date(),
         EntregadoPorUsuarioId: req.user.userId,
         RetiradoPorAgenteId: pedido.AgenteId || padronAgente?.Id || null
       }
     });
     ```
8. **Respuesta para Impresión:**
   - Retornar los datos limpios para el ticket:
     ```json
     {
       "ok": true,
       "pedidoId": 115681,
       "fecha": "24/10/2026",
       "hora": "12:45",
       "turno": "ALMUERZO",
       "agenteNombre": "LEAL, GABRIELA",
       "agenteDNI": "23.042.249",
       "servicio": "ADMISION GESTION TURNOS",
       "dieta": "HIPOSODICA",
       "hospitalNombre": "HOSPITAL CENTRAL"
     }
     ```

---

## 4. Gestión de Sesión Persistente (Zero-Keyboard)

1. **Almacenamiento Local de Credenciales:**
   - La aplicación almacena el token JWT en `localStorage.getItem('sisar_totem_token')`.
   - Si el token existe y es válido, la ruta `/totem` arranca directamente en estado Standby.
2. **Activación Inicial mediante Escaneo QR:**
   - Si el tótem no tiene token configurado, muestra en pantalla un mensaje con icono: *"Terminal no vinculada. Presente la credencial QR de activación de Nutrición"*.
   - El escáner detecta un código con prefijo `TOTEM_ACTIVATE:{jwt_token}`.
   - El tótem guarda el token en `localStorage` y entra en funcionamiento de inmediato, eliminando la necesidad de conectar un teclado físico para iniciar sesión.
