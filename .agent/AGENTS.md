# Reglas del Proyecto

- Siempre que se realicen cambios en la estructura de la base de datos (tablas, columnas, alter table, create table, índices, etc.), proporcionar inmediatamente al usuario los scripts SQL correspondientes formateados para ejecutarlos en el entorno de producción.
- Todo el funcionamiento actual del resto de la app no debe ser alterado. Realizar siempre un análisis de impacto riguroso antes de hacer cambios para garantizar la estabilidad de las funcionalidades existentes.
