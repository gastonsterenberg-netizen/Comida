## Why

The system currently lacks a robust role-based access control and organizational structure. To effectively manage food services in a hospital setting, we need distinct roles for 'Manager' (Gerente) and 'Head of Service' (Jefe de Servicio). This change introduces the necessary organizational hierarchy where managers can configure the hospital structure, and heads of service can manage their specific personnel, ensuring proper delegation and data access control.

## What Changes

- Introduce 'Gerente' (Manager) role with permissions to configure the hospital, create services, and manage 'Jefe de Servicio' users.
- Introduce 'Jefe de Servicio' (Head of Service) role with permissions scoped to their assigned service.
- Modify the staff import process so that it is executed by the 'Jefe de Servicio' for their specific personnel.
- Enable the 'Gerente' to access all food-related queries and reports across the entire hospital.
- **BREAKING**: Existing user management and staff import flows might be restricted or require specific roles.

## Capabilities

### New Capabilities
- `hospital-management`: Manager capabilities to configure hospital, create services, and assign head of service users.
- `role-based-access`: Core infrastructure for role-based access control (Manager, Head of Service).

### Modified Capabilities
- `staff-import`: Restrict and contextualize staff import to be performed by the Head of Service for their assigned service.
- `meal-reporting`: Expand reporting access so Managers can view all hospital-wide food data.

## Impact

- User authentication and authorization modules.
- Staff import feature and endpoints.
- Reporting and querying features.
- Database schema (new entities for Roles, Services, and their relationships to Users).
