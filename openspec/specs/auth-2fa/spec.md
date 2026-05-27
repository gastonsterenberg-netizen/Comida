## ADDED Requirements

### Requirement: Autenticación por Usuario y Contraseña
El sistema MUST validar las credenciales de los usuarios (Jefes de Servicio, Gerentes y Supervisores de RRHH) antes de permitir el acceso.

#### Scenario: Login de usuario con credenciales correctas
- **WHEN** el usuario ingresa su nombre de usuario y contraseña válidos
- **THEN** el sistema solicita el código de segundo factor (2FA) para completar el ingreso

#### Scenario: Login de usuario con credenciales incorrectas
- **WHEN** el usuario ingresa un nombre de usuario o contraseña incorrectos
- **THEN** el sistema rechaza el login y muestra un mensaje de error

### Requirement: Autenticación de Doble Factor (2FA) mediante TOTP
El sistema MUST requerir un código temporal de 6 dígitos (TOTP) generado por una aplicación autenticadora (por ejemplo, Google Authenticator) después de validar la contraseña.

#### Scenario: Verificación exitosa de 2FA
- **WHEN** el usuario ingresa el código TOTP correcto de 6 dígitos
- **THEN** el sistema inicia la sesión y redirige al panel correspondiente a su rol

#### Scenario: Verificación fallida de 2FA
- **WHEN** el usuario ingresa un código TOTP incorrecto o expirado
- **THEN** el sistema muestra un mensaje de error y no permite el acceso
