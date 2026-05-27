## 1. Database & Models

- [x] 1.1 Create/Update User model to include `role` enum (GERENTE, JEFE_SERVICIO) and `serviceId` foreign key.
- [x] 1.2 Create Service model (id, name, hospitalId).
- [x] 1.3 Create migration script to insert default roles for existing users.

## 2. Authentication & Authorization

- [x] 2.1 Update authentication payload/token to include `role` and `serviceId`.
- [x] 2.2 Create RBAC middleware guards (`isGerente`, `isJefeServicio`) to protect routes.

## 3. Hospital Management (Gerente)

- [x] 3.1 Implement endpoint to create/update Services.
- [x] 3.2 Implement endpoint to create Jefe de Servicio users and assign them to a Service.
- [x] 3.3 Create frontend views for Manager to configure hospital services and manage users.

## 4. Staff Import (Jefe de Servicio)

- [x] 4.1 Update Staff Import endpoint to extract `serviceId` and `hospitalId` from the authenticated Jefe de Servicio user.
- [x] 4.2 Restrict Staff Import endpoint with `isJefeServicio` middleware.
- [x] 4.3 Update frontend to reflect that Head of Service is importing staff for their own service.

## 5. Meal Reporting

- [x] 5.1 Update report generation query to filter by `serviceId` if user is `JEFE_SERVICIO`.
- [x] 5.2 Update report generation query to fetch all services in the hospital if user is `GERENTE`.
- [x] 5.3 Verify that frontend views for reports adjust correctly based on user role.
