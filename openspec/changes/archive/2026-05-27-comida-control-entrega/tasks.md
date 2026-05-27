## 1. Configuración de Base de Datos (SQL Server)

- [x] 1.1 Diseñar e implementar el script de migración SQL para crear las tablas básicas (Hospitales, Servicios, Roles).
- [x] 1.2 Crear e implementar la tabla `Personal` con los campos necesarios de vigencia (`PeriodoInicio`, `PeriodoFin`) y la tabla `Usuarios` con soporte para 2FA.
- [x] 1.3 Crear e implementar la tabla `PedidosComida` para almacenar los pedidos ordinarios y de emergencia.
- [x] 1.4 Insertar datos semilla iniciales para roles (Jefe, Gerente, RRHH) y hospitales de prueba.

## 2. Backend - Autenticación y Seguridad (2FA)

- [x] 2.1 Configurar el backend (NestJS/C#) y su conexión a SQL Server.
- [x] 2.2 Implementar los endpoints de autenticación tradicionales (registro, login inicial, generación de tokens JWT).
- [x] 2.3 Implementar la lógica para generación de secretos TOTP y envío de códigos QR al usuario en su primer login.
- [x] 2.4 Validar el segundo factor de autenticación (código de 6 dígitos) en los logins subsiguientes antes de otorgar el token de sesión definitivo.
- [x] 2.5 Implementar endpoint para que el Administrador/RRHH restablezca el secreto 2FA de un usuario.

## 3. Backend - Importación de Plantel Mensual (CSV)

- [x] 3.1 Crear endpoint de subida de archivos (upload) que reciba el archivo CSV de personal autorizado.
- [x] 3.2 Implementar parser de CSV que valide la presencia de campos obligatorios (DNI, Nombre, Apellido, Servicio, Hospital, Horario, Período).
- [x] 3.3 Validar que el efector (hospital) y el servicio del CSV existan en la base de datos (o crearlos según decisión de diseño).
- [x] 3.4 Insertar o actualizar masivamente los registros del personal en la tabla `Personal`.

## 4. Frontend - Panel de Selección de Menús (Jefe de Servicio)

- [x] 4.1 Crear la interfaz visual de planilla diaria para el Jefe de Servicio que liste al personal del servicio activo en el día actual.
- [x] 4.2 Agregar las columnas e interactividad con botones visibles para los tipos de dieta (Normal, Gástrica, Diabética, Hepática, Vegetariano, Celíaca) para solicitar `Almuerzo` y `Cena` con un solo clic.
- [x] 4.3 Implementar endpoint del backend para registrar o eliminar el pedido (incluyendo el Tipo de Dieta) de manera automática e instantánea al presionar el botón (estado 'AutoApproved').
- [x] 4.4 Implementar lógica en el frontend y backend para bloquear todos los inputs si la hora local supera las 10:00 AM del día actual.

## 5. Gestión de Solicitudes de Emergencia (Jefes y Gerentes)

- [x] 5.1 Crear el formulario interactivo en el panel del Jefe de Servicio para solicitar un menú de emergencia fuera de lista (Nombre, DNI, Período, Tipo de Dieta, Justificación).
- [x] 5.2 Implementar el endpoint en el backend para crear solicitudes de emergencia en estado 'Pendiente'.
- [x] 5.3 Crear la bandeja del Gerente del Hospital donde se listan las solicitudes pendientes asociadas a su efector.
- [x] 5.4 Desarrollar la acción de Aceptar/Rechazar en la bandeja del Gerente, forzando el ingreso de una justificación escrita, y actualizando el estado de la solicitud en la base de datos.

## 6. Reportes y Auditoría (RRHH, Gerente, Jefe)

- [x] 6.1 Implementar endpoint de reportes con filtros avanzados por fecha, rango de fechas, hospital, servicio, jefe y persona.
- [x] 6.2 Desarrollar la interfaz visual de reportes en el frontend para el supervisor de RRHH con gráficos o tablas de conteo de menús totales.
- [x] 6.3 Implementar los límites de acceso de datos (Jefe solo ve su servicio, Gerente solo ve su hospital, RRHH ve todo) tanto a nivel API como UI.
