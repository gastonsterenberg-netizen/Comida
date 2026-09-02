# Tasks: Asignación a Múltiples Planteles y Control Global de Raciones por DNI

## 1. Database & Schema Adjustments

- [ ] 1.1 Update `backend/prisma/schema.prisma` replacing `@unique` on `DNI` in `model Personal` with `@@unique([HospitalId, ServicioId, DNI])`.
- [ ] 1.2 Run `npx prisma db push` and `npx prisma generate` to apply schema changes in SQL Server database.

## 2. Backend Logic & Multi-Service Roster Endpoints

- [ ] 2.1 Update `POST /api/staff/plantel` to allow adding agents to multiple services without overwriting their existing service assignments.
- [ ] 2.2 Update `POST /api/staff/plantel` and deletion flow so that removing an agent from a service deletes their active food orders (`pedidosComida.deleteMany`) for that service on the current date, immediately releasing their DNI quota.
- [ ] 2.3 Refactor `GET /api/staff/active` to fetch all orders across the entire hospital matching the agent's `DNI` for the target date, calculating remaining global quota (1 ración vs 2 raciones).

## 3. Order Processing & Concurrency Protection

- [ ] 3.1 Refactor `POST /api/orders` to execute inside a database transaction (`prisma.$transaction`).
- [ ] 3.2 Add DNI-level quota validation in `POST /api/orders` to ensure total approved orders for a DNI on a date never exceed their master quota (1 or 2 max), rejecting simultaneous race condition submissions.

## 4. Frontend UI/UX Updates

- [ ] 4.1 Update `JefePanel` Planilla view to render global quota status badges per DNI (`🔒 Cupo Completado (1/1)` / `🔒 Almuerzo consumido en Guardia Médica`).
- [ ] 4.2 Update `Configurar Plantel` agent card layout:
  - Preserve 2-row layout structure.
  - Line 1: Agent name on left, DNI and trash icon (`🗑️`) on right.
  - Line 2 (left): Status badges (`Modificado`, `Pendiente de Gerencia`, etc.).
  - Line 2 (right): Collapsible dropdown menu `[ 🏷️ 1 Ración Global ▾ ]`.
- [ ] 4.3 Populate collapsible dropdown menu with 1 Ración, 2 Raciones, and 0 Raciones options, accompanied by the explanatory caption: *"ℹ️ Esta solicitud cambiará la cantidad de raciones diarias del agente en todo el hospital tras la aprobación de Gerencia."*

## 5. Verification & Testing

- [ ] 5.1 Test assigning the same DNI to 2 different services.
- [ ] 5.2 Test requesting 1 ración in Service A and verifying automatic meal lock in Service B.
- [ ] 5.3 Test removing an agent from Service A and verifying immediate quota release in Service B.
- [ ] 5.4 Verify clean build of backend (`npm run build`) and frontend (`npm run build`).
