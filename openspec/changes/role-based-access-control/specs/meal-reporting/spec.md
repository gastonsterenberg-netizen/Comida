## MODIFIED Requirements

### Requirement: Restricción de Alcance de Reportes por Rol
El sistema MUST limitar el acceso a los datos de reportes basándose en el rol del usuario logueado, garantizando que Gerentes y Jefes de Servicio tengan vistas precisas.

#### Scenario: Acceso de Jefe de Servicio a sus propios reportes
- **WHEN** el Jefe de Servicio solicita un reporte de pedidos
- **THEN** el sistema muestra únicamente los pedidos asociados a su propio servicio, denegando el acceso a otros servicios u hospitales

#### Scenario: Acceso de Gerente a reportes de su hospital
- **WHEN** el Gerente de un hospital solicita un reporte de pedidos
- **THEN** el sistema muestra los pedidos de todos los servicios del hospital a su cargo, pero deniega el acceso a reportes de otros hospitales
