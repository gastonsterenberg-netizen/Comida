## Context

El sistema tiene como objetivo automatizar y controlar el flujo de solicitudes de comidas para el personal médico de guardia y con libre disponibilidad en múltiples hospitales. El sistema debe ser lo más simple posible, basándose principalmente en "clics" de planillas. Para asegurar el cumplimiento de las restricciones de negocio (límite de pedidos a las 10:00 AM) y auditar de forma robusta las comidas solicitadas y entregadas, se requiere un diseño técnico que detalle la base de datos SQL Server, la estructura del frontend, el mecanismo de 2FA y la importación de planillas mensuales.

## Goals / Non-Goals

**Goals:**
- Diseñar un esquema de base de datos en SQL Server que soporte múltiples efectores (hospitales) y sus servicios respectivos.
- Implementar un login seguro con doble factor de autenticación (TOTP).
- Crear un flujo de importación mensual de archivos CSV con verificación de períodos de vigencia.
- Proveer una UI móvil-first ultra simplificada para que el Jefe de Servicio realice los pedidos con solo clics directos sobre botones visibles para el tipo de dieta (sin desplegables).
- Establecer un control estricto del huso horario y hora límite (10:00 AM) tanto en cliente como en servidor para evitar la carga extemporánea de pedidos.
- Diseñar la bandeja de autorización de menús de emergencia para Gerentes.
- Construir reportes detallados y consolidados según el nivel de privilegios del usuario (Jefe, Gerente, RRHH).

**Non-Goals:**
- No se gestionará el tipo de comida, el stock físico, la preparación de platos ni el precio de los menús.
- No se integrará la base de datos de manera automatizada en tiempo real con sistemas externos de control de personal o reloj de fichadas en esta primera etapa.

## Decisions

### 1. Stack Tecnológico
- **Base de Datos**: Microsoft SQL Server.
- **Backend**: API REST utilizando Node.js con NestJS y TypeORM/Prisma, o en su defecto ASP.NET Core (C#) con EF Core.
- **Frontend**: Next.js (React) con Tailwind CSS. Permite realizar renderizado rápido y diseño responsivo óptimo para dispositivos móviles y tablets que usan los médicos de guardia.
- **2FA**: Implementación basada en el estándar TOTP (RFC 6238) utilizando librerías como `otplib` en Node o similar en .NET.

### 2. Esquema Físico de Base de Datos (SQL Server)
Se propone el siguiente diseño de tablas y relaciones para SQL Server:

```sql
-- Tabla de Hospitales (Efectores)
CREATE TABLE Hospitales (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    Nombre NVARCHAR(100) NOT NULL,
    Codigo NVARCHAR(20) UNIQUE NOT NULL
);

-- Tabla de Servicios por Hospital
CREATE TABLE Servicios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    HospitalId INT NOT NULL FOREIGN KEY REFERENCES Hospitales(Id),
    Nombre NVARCHAR(100) NOT NULL,
    CONSTRAINT UQ_Servicio_Hospital UNIQUE (HospitalId, Nombre)
);

-- Tabla de Personal Autorizado (Importado mensualmente)
CREATE TABLE Personal (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    DNI NVARCHAR(20) UNIQUE NOT NULL,
    Nombre NVARCHAR(100) NOT NULL,
    Apellido NVARCHAR(100) NOT NULL,
    HospitalId INT NOT NULL FOREIGN KEY REFERENCES Hospitales(Id),
    ServicioId INT NOT NULL FOREIGN KEY REFERENCES Servicios(Id),
    Horario NVARCHAR(50) NOT NULL, -- Guardia 12h, 24h, Extensión Horaria
    PeriodoInicio DATE NOT NULL,
    PeriodoFin DATE NOT NULL,
    Activo BIT DEFAULT 1
);

-- Tabla de Roles de Usuario
CREATE TABLE Roles (
    Id INT PRIMARY KEY, -- 1: RRHH_Global, 2: Gerente_Hospital, 3: Jefe_Servicio
    Nombre NVARCHAR(50) NOT NULL
);

-- Tabla de Usuarios del Sistema (Logueo)
CREATE TABLE Usuarios (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    NombreUsuario NVARCHAR(50) UNIQUE NOT NULL,
    ContrasenaHash NVARCHAR(255) NOT NULL,
    RolId INT NOT NULL FOREIGN KEY REFERENCES Roles(Id),
    HospitalId INT NULL FOREIGN KEY REFERENCES Hospitales(Id), -- NULL para RRHH Global
    ServicioId INT NULL FOREIGN KEY REFERENCES Servicios(Id),   -- NULL para Gerentes y RRHH
    TwoFactorSecret NVARCHAR(128) NULL,
    TwoFactorHabilitado BIT DEFAULT 0
);

-- Tabla de Pedidos de Menú
CREATE TABLE PedidosComida (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    FechaPedido DATE NOT NULL,
    TipoComida NVARCHAR(20) NOT NULL CHECK (TipoComida IN ('Almuerzo', 'Cena')),
    TipoDieta NVARCHAR(30) NOT NULL DEFAULT 'Normal' CHECK (TipoDieta IN ('Normal', 'Gastrica', 'Diabetica', 'Hepatico', 'Vegetariano', 'Celiaca')),
    PersonalId INT NULL FOREIGN KEY REFERENCES Personal(Id), -- NULL para pedidos de emergencia fuera de lista
    SolicitadoPorUsuarioId INT NOT NULL FOREIGN KEY REFERENCES Usuarios(Id),
    Estado NVARCHAR(20) NOT NULL DEFAULT 'Aprobado' CHECK (Estado IN ('Aprobado', 'Pendiente', 'Aceptado', 'Rechazado')),
    -- Campos exclusivos para solicitudes de Emergencia
    EmergenciaNombre NVARCHAR(100) NULL,
    EmergenciaApellido NVARCHAR(100) NULL,
    EmergenciaDNI NVARCHAR(20) NULL,
    EmergenciaPeriodoInicio DATE NULL,
    EmergenciaPeriodoFin DATE NULL,
    JustificacionSolicitud NVARCHAR(500) NULL,
    JustificacionResolucion NVARCHAR(500) NULL,
    EvaluadoPorUsuarioId INT NULL FOREIGN KEY REFERENCES Usuarios(Id)
);
```

### 3. Mecanismo de Control Horario (Límite 10:00 AM)
- **Cliente (Frontend)**: Deshabilita los switches/checkboxes y el botón de solicitar menú de emergencia si la hora del dispositivo supera las 10:00 AM.
- **Servidor (Backend)**: Toda petición POST/PUT de pedidos para la fecha actual es validada contra la hora del servidor (ajustada a la zona horaria del hospital). Si el servidor registra una hora mayor o igual a las 10:00 AM, retorna error `400 Bad Request` indicando que el período de solicitudes ha expirado.

### 4. Flujo de Activación y Login 2FA
- **Primer Login**: El usuario ingresa con usuario y contraseña provistos por el administrador. El sistema detecta que `TwoFactorHabilitado = 0` y le muestra un código QR para que lo escanee con su aplicación autenticadora (Google Authenticator / Authy), junto a un código de respaldo.
- **Siguientes Logins**: Tras ingresar contraseña, se solicita el código TOTP actual. La API valida el código con el `TwoFactorSecret` almacenado.

## Risks / Trade-offs

- **[Riesgo] Zona Horaria y Desfase Horario del Servidor**  
  *Mitigación*: El backend utilizará almacenamiento y validación horaria basada en UTC pero realizando el cálculo del cierre local mediante la configuración del huso horario específico del hospital (por ejemplo, `America/Argentina/Buenos_Aires`).
- **[Riesgo] Pérdida de Dispositivo 2FA por Jefes de Servicio**  
  *Mitigación*: Se proveerá un panel de administración central donde los administradores globales pueden restablecer el secreto 2FA (`TwoFactorHabilitado = 0` y `TwoFactorSecret = NULL`) para forzar un nuevo enrolamiento al usuario.
- **[Riesgo] Errores al Cargar Nombres de Servicios en CSV**  
  *Mitigación*: Durante la importación, si el archivo CSV contiene un nombre de servicio que no está registrado para ese hospital, el sistema detendrá el proceso y solicitará confirmación (o creará dinámicamente el servicio si el administrador lo autoriza).
