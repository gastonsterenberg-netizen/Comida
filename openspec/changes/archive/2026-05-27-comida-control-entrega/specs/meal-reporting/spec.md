## ADDED Requirements

### Requirement: Generación de Reportes e Historiales
El sistema MUST permitir la visualización de la cantidad de menús solicitados y entregados en intervalos de tiempo determinados. Los datos deben desglosarse por fecha, hospital, servicio, jefe solicitante y comensal.

#### Scenario: Visualización de reporte consolidado por RRHH
- **WHEN** un supervisor de RRHH ingresa filtros de fechas, hospital y servicio
- **THEN** el sistema calcula y muestra el total general de menús consumidos (almuerzos y cenas por separado), detallando quién los consumió y qué usuario los autorizó

### Requirement: Restricción de Alcance de Reportes por Rol
El sistema MUST limitar el acceso a los datos de reportes basándose en el rol del usuario logueado.

#### Scenario: Acceso de Jefe de Servicio a sus propios reportes
- **WHEN** el Jefe de Servicio solicita un reporte de pedidos
- **THEN** el sistema muestra únicamente los pedidos asociados a su propio servicio, denegando el acceso a otros servicios u hospitales

#### Scenario: Acceso de Gerente a reportes de su hospital
- **WHEN** el Gerente de un hospital solicita un reporte de pedidos
- **THEN** el sistema muestra los pedidos de todos los servicios del hospital a su cargo, pero deniega el acceso a reportes de otros hospitales
