## ADDED Requirements

### Requirement: Registro de Menús Mediante Planilla con Selección de Dieta
El sistema MUST proveer al Jefe de Servicio una lista visual con el personal activo asignado a su servicio para ese día, permitiéndole solicitar almuerzo o cena haciendo clic directo en el botón correspondiente al tipo de dieta (normal, gástrica, diabética, hepática, vegetariano, celíaca) sin menús desplegables.

#### Scenario: Selección y guardado de menús con dieta específica
- **WHEN** el Jefe de Servicio hace clic en el botón de un tipo de dieta específico (ej: "Celíaca") para el almuerzo de una persona activa
- **THEN** el sistema registra la solicitud del menú con ese tipo de dieta inmediatamente en estado aprobado y muestra una confirmación visual

### Requirement: Límite Horario de Carga (10:00 AM)
El sistema MUST bloquear la creación, modificación o eliminación de pedidos de almuerzo y cena para el día en curso una vez superadas las 10:00 AM.

#### Scenario: Edición permitida antes del límite
- **WHEN** la hora local del hospital es menor a las 10:00 AM
- **THEN** el Jefe de Servicio puede marcar y desmarcar pedidos de comida para el día en curso

#### Scenario: Bloqueo de controles después del límite
- **WHEN** la hora local del hospital es posterior o igual a las 10:00 AM
- **THEN** el sistema deshabilita todos los casilleros de selección de comida del día en curso y muestra una advertencia de "Período cerrado"
