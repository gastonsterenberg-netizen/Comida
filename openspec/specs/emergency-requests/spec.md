## ADDED Requirements

### Requirement: Solicitud de Menú Extra por Emergencia
El sistema MUST permitir al Jefe de Servicio solicitar menús para personas no registradas o fuera del plantel del día, requiriendo ingresar Nombre, Apellido, DNI, Período de vigencia, Tipo de Dieta (normal, gástrica, diabética, hepática, vegetariano, celíaca) y una Justificación escrita.

#### Scenario: Creación de solicitud de menú de emergencia
- **WHEN** el Jefe de Servicio completa el formulario de menú de emergencia con los datos, el tipo de dieta y justificación válidos y lo envía
- **THEN** el sistema guarda la solicitud en estado "Pendiente" y la envía a la bandeja del Gerente del Hospital correspondiente

### Requirement: Resolución de Emergencia por el Gerente
El Gerente del Hospital correspondiente MUST poder aprobar o rechazar cada solicitud de menú de emergencia pendiente, siendo obligatoria una justificación para su respuesta.

#### Scenario: Aprobación de menú por parte del Gerente
- **WHEN** el Gerente visualiza una solicitud de emergencia pendiente, escribe una justificación de respuesta y hace clic en "Aceptar"
- **THEN** el sistema registra el pedido en estado aprobado y lo contabiliza en los menús del día

#### Scenario: Rechazo de menú por parte del Gerente
- **WHEN** el Gerente visualiza una solicitud de emergencia pendiente, escribe una justificación de respuesta y hace clic en "Rechazar"
- **THEN** el sistema registra el pedido en estado rechazado, no contabiliza el menú, y queda archivado con la justificación ingresada
