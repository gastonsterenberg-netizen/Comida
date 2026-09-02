# Change Proposal: Asignación de Agentes a Múltiples Planteles y Control Global de Raciones por DNI

## Why

Actualmente, un agente de salud (`Personal`) está restringido por la base de datos a pertenecer a un único servicio. En la operación real del hospital, un mismo profesional puede prestar servicios en múltiples planteles (por ejemplo, Guardia Médica y Terapia Intensiva). 
Asimismo, se requiere garantizar un control estricto del consumo de comida: el cupo de raciones autorizadas pertenece al **DNI del Agente** (según su perfil máster en el Padrón) y no a un servicio individual. Si a un agente ya se le solicitó su comida del día en un plantel, el sistema debe impedir la selección duplicada en cualquier otro plantel al que esté asignado, permitiendo únicamente solicitudes de 2ª ración excepcional mediante el circuito de emergencias previa autorización de Gerencia.

## What Changes

- **Modelo de Base de Datos**: Reemplazar la restricción de unicidad de DNI único por agente en `Personal` para permitir que un DNI exista en múltiples servicios dentro del mismo hospital (`@@unique([HospitalId, ServicioId, DNI])`).
- **Control Global de Raciones por DNI**: Actualizar la consulta de la Planilla (`GET /api/staff/active`) para calcular en tiempo real el consumo diario del agente agregando todas las solicitudes de cualquier servicio del hospital asociadas a su `DNI`.
- **Desasociación e Inactivación de Plantel**: Al eliminar a un agente de un plantel (icono de cesto de basura en "Configurar Plantel"), el sistema eliminará automáticamente los pedidos del día generados por dicho servicio para ese agente, liberando la cuota del DNI para otros planteles.
- **Validación Atómica en Backend**: En la API de guardado de pedidos (`POST /api/orders`), re-validar la cuota consumida del DNI dentro de una transacción de base de datos (`prisma.$transaction`) para prevenir carreras de clics simultáneos.
- **Rediseño Visual de Configuración de Plantel**: Conservar la maqueta actual de 2 renglones, manteniendo intactos los badges de estado (`Modificado`, `Pendiente de Gerencia`) y el cesto de basura (`🗑️`), colapsando la selección de raciones en un menú interactivo desplegable (`[ 🏷️ 1 Ración Global ▾ ]`) que incluye internamente la nota explicativa para el usuario.
- **Manejo de Excepciones (Doble Turno / Extensión de Guardia)**: Las 2ªs raciones para agentes con régimen base de 1 ración se canalizarán a través del módulo de **Emergencias existente** (con justificación y autorización de Gerencia).

## Capabilities

### New Capabilities
- `multi-service-roster`: Capacidad para asociar un mismo agente a múltiples planteles de servicios en simultáneo sin sobrescribir sus registros.
- `global-dni-quota-control`: Motor de control y bloqueo en tiempo real de raciones acumuladas por DNI y fecha a nivel hospitalario.

### Modified Capabilities
- `staff-roster-management`: Modificar la gestión de bajas/desasociación de planteles para liberar raciones diarias activas.
- `order-submission-validation`: Reforzar la validación de transacciones atómicas al grabar pedidos en la planilla.

## Impact

- **Base de Datos**: Esquema Prisma (`schema.prisma`) y migración en SQL Server.
- **Backend API**: Endpoints `/api/staff/plantel`, `/api/staff/active`, `/api/orders`, `/api/emergencies`.
- **Frontend Next.js**: Componente de Planilla y vista de Configurar Plantel en `JefePanel`.
