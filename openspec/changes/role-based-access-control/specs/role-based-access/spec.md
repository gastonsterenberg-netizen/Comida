## ADDED Requirements

### Requirement: Role Definitions
The system MUST support predefined roles: GERENTE and JEFE_SERVICIO, which restrict access to different areas of the application.

#### Scenario: Accessing unauthorized areas
- **WHEN** a user with the JEFE_SERVICIO role attempts to access hospital-wide configuration settings
- **THEN** the system denies access and displays an unauthorized error
