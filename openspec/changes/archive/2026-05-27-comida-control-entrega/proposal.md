## Why

Actualmente, los hospitales no cuentan con un sistema digital centralizado y seguro para auditar y controlar la entrega de comida (almuerzo y cena) al personal de guardia (12 o 24 horas) y con libre disponibilidad/extensión horaria. Esto genera un descontrol en la cantidad de menús consumidos, falta de justificación en situaciones de emergencia y dificultad para realizar reportes consolidados por hospital, servicio y persona. Se requiere una solución sumamente simple ("de solo clics") con control de horario de pedidos (límite 10:00 AM) y doble factor de autenticación para asegurar la transparencia en el uso de los recursos.

## What Changes

- **Control de Menús por Clics**: Interfaz simple para Jefes de Servicio donde tildan el almuerzo o cena y eligen el tipo de dieta (normal, gástrica, diabética, hepática, vegetariano, celíaca) mediante botones visibles en pantalla para el personal de su servicio.
- **Límite Horario de Carga**: Bloqueo automático de pedidos diarios después de las 10:00 AM.
- **Importación Mensual de Personal**: Módulo administrativo para importar un archivo CSV que define el plantel autorizado y sus períodos de trabajo (incluyendo reemplazos temporales).
- **Flujo de Emergencias**: Opción para solicitar menús para personal fuera de la lista precargada, requiriendo aprobación del Gerente de Hospital con justificación obligatoria.
- **Auditoría y Reportes (RRHH)**: Reportes globales para supervisores de RRHH y reportes locales para Gerentes por rango de fechas, hospital, servicio y persona.
- **Autenticación con 2FA**: Sistema de login seguro con usuario/contraseña y código de autenticación temporal (TOTP).

## Capabilities

### New Capabilities

- `auth-2fa`: Autenticación de usuarios con contraseña y código de segundo factor (TOTP) obligatorio para garantizar la seguridad operativa diaria.
- `staff-import`: Importación mensual de planillas CSV de personal autorizado por efector, servicio, horario y período de trabajo activo.
- `meal-selection`: Selección diaria simplificada de menús (almuerzo/cena) y tipo de dieta (normal, gástrica, diabética, hepática, vegetariano, celíaca) por Jefe de Servicio antes de las 10:00 AM.
- `emergency-requests`: Creación de solicitudes de menús de emergencia por Jefes de Servicio para personal no listado, y aprobación/rechazo obligatorio por parte del Gerente de Hospital.
- `meal-reporting`: Generación de reportes detallados y consolidados de comidas por fecha, hospital, servicio, solicitante y beneficiario.

### Modified Capabilities

*(Ninguna, es un sistema nuevo)*

## Impact

- **Base de Datos**: Creación del esquema relacional en SQL Server.
- **Frontend**: Aplicación web responsiva de interfaz simplificada (optimizada para clics y uso en múltiples dispositivos).
- **Seguridad**: Implementación de políticas de autenticación multifactor.
