## Context

The current system lacks differentiation between a manager overseeing the entire hospital and a head of service who only manages their own department's meals and staff. To support the hospital's organizational hierarchy, we need to implement Role-Based Access Control (RBAC).

## Goals / Non-Goals

**Goals:**
- Implement the 'Gerente' (Manager) role with system-wide configuration and reporting capabilities.
- Implement the 'Jefe de Servicio' (Head of Service) role with restricted capabilities to manage their specific service only.
- Refactor existing features like staff import and meal reporting to respect these roles.

**Non-Goals:**
- Implement dynamic permission creation (roles and permissions are statically defined in this phase).
- Modify the actual meal ordering process for the individual staff.

## Decisions

- **Role Management:** We will use predefined roles (`GERENTE`, `JEFE_SERVICIO`) stored in the User entity.
- **Service Entity:** We need a robust `Service` entity. A `User` (Jefe de Servicio) will have a many-to-one or one-to-one relationship with a `Service`.
- **Authorization Checks:** We will implement middleware/guards in the backend API to enforce role checks (`isGerente`, `isJefeServicio`).
- **Data Scoping:** 
  - For Head of Service, database queries for staff and meals will automatically filter by their assigned `serviceId`.
  - For Manager, database queries will fetch all records across the hospital.

## Risks / Trade-offs

- **Risk:** Existing users may lose access if they are not properly migrated to the new roles.
  - **Mitigation:** Create a database migration script to assign default roles (e.g., assigning all existing admins as `GERENTE`).
- **Trade-off:** Hardcoding roles (`GERENTE`, `JEFE_SERVICIO`) instead of a dynamic permissions table. This is simpler to implement initially but less flexible if more custom roles are needed later. We chose simplicity for this phase.
