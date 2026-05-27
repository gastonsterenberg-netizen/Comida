## ADDED Requirements

### Requirement: Hospital Configuration
The system MUST allow Managers (Gerente) to configure the hospital settings and create services within the hospital.

#### Scenario: Manager creates a service
- **WHEN** the Manager submits the service creation form with a valid name and details
- **THEN** the system creates the service associated with the Manager's hospital

### Requirement: Head of Service Assignment
The system MUST allow Managers to create Head of Service (Jefe de Servicio) users and assign them to specific services.

#### Scenario: Manager assigns a Head of Service
- **WHEN** the Manager creates a new user, selects the 'Head of Service' role, and assigns them to an existing service
- **THEN** the new user can log in and manage only that assigned service
