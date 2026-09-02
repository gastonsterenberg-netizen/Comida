# Design Document: Asignación a Múltiples Planteles y Control Global de Raciones por DNI

## Context

En el sistema actual, cada registro de `Personal` exige un `DNI` único global en la base de datos. Si un Jefe de Servicio incorpora a un agente que ya trabaja en otro servicio, el sistema sobrescribe la asociación cambiando al agente de departamento. Asimismo, las verificaciones de pedidos se realizaban a nivel de `PersonalId`, permitiendo potencialmente que dos servicios soliciten comida de forma independiente para la misma persona en el mismo día.

## Goals / Non-Goals

**Goals:**
- Permitir que un profesional de la salud pertenezca simultáneamente a múltiples planteles de servicios (`Guardia Médica`, `Terapia Intensiva`, etc.).
- Controlar en tiempo real que ningún agente supere su cuota diaria máxima de raciones (1 ración para 12h, 2 raciones para 24h) calculando las solicitudes consolidadas por `DNI` a nivel de todo el hospital.
- Liberar automáticamente las raciones pedidas en un servicio si el agente es quitado/desasociado de ese plantel en el día.
- Mantener la UI de la tarjeta de agente de 2 renglones con sus insignias de estado y cesto de basura, incorporando el selector de raciones colapsado `[ 🏷️ 1 Ración Global ▾ ]` con leyenda informativa.
- Encauzar las solicitudes de 2ª ración por extensión de guardia a través del circuito existente de **Emergencias/Gerencia**.

**Non-Goals:**
- Permitir más de 2 raciones totales diarias bajo ningún concepto.
- Modificar el flujo de escaneo QR/DNI en cocina (Nutrición continuará entregando por DNI/Voucher según el turno correspondiente).

## Decisions

1. **Unicidad en Base de Datos**:
   Modificar `model Personal` en Prisma reemplazando `@unique([DNI])` por `@@unique([HospitalId, ServicioId, DNI])`.

2. **Cálculo de Cuota Consolidada por DNI**:
   Al consultar la planilla (`GET /api/staff/active?servicioId=X&fecha=YYYY-MM-DD`), el backend buscará todos los pedidos registrados para el `DNI` de cada agente en esa fecha en todo el hospital.
   - Si `RacionesConsumidas >= CupoBase`: Bloquear la selección en el turno ya consumido y mostrar badge: `🔒 Cupo Completado (1/1)` o `🔒 2/2 Raciones Pedidas`.

3. **Validación Atómica en Backend**:
   En `POST /api/orders`, envolver la verificación y creación en una transacción SQL (`prisma.$transaction`) filtrando por `DNI` y `FechaPedido`. Rebotar cualquier intento simultáneo de sobrepasar la cuota.

4. **Desasociación e Inactivación de Plantel**:
   En `POST /api/staff/plantel`, cuando un agente es removido de la lista del plantel (cesto de basura), inhabilitar el registro de `Personal` del servicio y ejecutar `prisma.pedidosComida.deleteMany` para las solicitudes de ese `ServicioId` en la fecha actual.

5. **UI/UX en Configuración de Plantel**:
   - Conservar la tarjeta de 2 renglones:
     - **Renglón 1**: Nombre completo a la izquierda | DNI y Cesto de basura `🗑️` a la derecha.
     - **Renglón 2 (Izquierda)**: Insignias de estado (`Modificado`, `Pendiente de Autorización de Gerencia`).
     - **Renglón 2 (Derecha)**: Menú colapsable `[ 🏷️ 1 Ración Global ▾ ]`.
     - **Contenido del Menú Desplegable**:
       - `☀️ 1 Ración (Guardia 12h / Estándar)`
       - `🌙 2 Raciones (Guardia 24h)`
       - `🚫 0 Raciones (Sin Comida / Inhabilitado)`
       - *`ℹ️ Esta solicitud cambiará la cantidad de raciones diarias del agente en todo el hospital tras la aprobación de Gerencia.`*

## Risks / Trade-offs

- **Riesgo**: Duplicidad de notificaciones a Gerencia si múltiples Jefes solicitan cambiar la ración permanente del mismo agente.
  - **Mitigación**: Si ya existe una solicitud en estado `Pendiente` para el DNI en `SolicitudesPlantel`, el sistema mostrará el badge `⏳ Solicitud en Revisión por Gerencia` desactivando selecciones duplicadas.
