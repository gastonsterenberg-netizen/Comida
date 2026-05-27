## MODIFIED Requirements

### Requirement: Importación de Plantel Mensual por CSV
El sistema MUST permitir a los Jefes de Servicio (Head of Service) cargar un archivo CSV con la lista de personal autorizado para su servicio en un período. El archivo CSV contiene: Nombre, Apellido, DNI, Horario (ej: guardia 12h, 24h, ext. horaria) y Rango de Fechas de Vigencia. El efector y servicio se asignan automáticamente según el Jefe de Servicio que realiza la carga.

#### Scenario: Importación exitosa de archivo válido por Jefe de Servicio
- **WHEN** el Jefe de Servicio selecciona e importa un archivo CSV estructurado correctamente
- **THEN** el sistema procesa los registros, los asocia automáticamente al servicio y hospital del Jefe de Servicio, y muestra un resumen con la cantidad de registros importados exitosamente

#### Scenario: Rechazo de archivo CSV con formato incorrecto
- **WHEN** el Jefe de Servicio intenta importar un archivo CSV que carece de columnas obligatorias o contiene tipos de datos incorrectos (ej. DNI no numérico)
- **THEN** el sistema rechaza la importación completa, revierte los cambios y muestra los errores específicos de validación por fila
