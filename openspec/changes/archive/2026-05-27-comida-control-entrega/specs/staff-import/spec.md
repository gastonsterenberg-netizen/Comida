## ADDED Requirements

### Requirement: Importación de Plantel Mensual por CSV
El sistema MUST permitir a los administradores cargar un archivo CSV con la lista de personal autorizado para un período. El archivo CSV contiene: Nombre, Apellido, DNI, Servicio, Efector (Hospital), Horario (ej: guardia 12h, 24h, ext. horaria) y Rango de Fechas de Vigencia.

#### Scenario: Importación exitosa de archivo válido
- **WHEN** el administrador selecciona e importa un archivo CSV estructurado correctamente
- **THEN** el sistema procesa los registros, los asocia a sus respectivos efectores y servicios, y muestra un resumen con la cantidad de registros importados exitosamente

#### Scenario: Rechazo de archivo CSV con formato incorrecto
- **WHEN** el administrador intenta importar un archivo CSV que carece de columnas obligatorias o contiene tipos de datos incorrectos (ej. DNI no numérico)
- **THEN** el sistema rechaza la importación completa, revierte los cambios y muestra los errores específicos de validación por fila

### Requirement: Control de Vigencia del Personal
El sistema MUST habilitar al personal para recibir menús únicamente dentro de su rango de vigencia (`PeriodStart` a `PeriodEnd`) configurado en el archivo CSV.

#### Scenario: Personal visible para pedidos
- **WHEN** la fecha actual se encuentra dentro del rango de vigencia de trabajo del personal
- **THEN** la persona aparece activa en la lista del Jefe de Servicio correspondiente

#### Scenario: Personal oculto por vigencia expirada o futura
- **WHEN** la fecha actual está fuera del rango de vigencia de trabajo del personal
- **THEN** la persona no aparece listada en la planilla de pedidos del día del Jefe de Servicio
