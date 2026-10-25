# Proposal: Impresión Anticipada de Vouchers con Control de Emisión Única

## Summary
Permitir a los Jefes de Servicio imprimir los vouchers de comida de su servicio de manera anticipada (antes de la hora de cierre/autorización), especialmente útil para turnos nocturnos, fines de semana y feriados. Se implementa un control de emisión única en el servidor para que el Jefe de Servicio solo pueda imprimir una sola vez por turno y fecha (evitando la duplicación de raciones en cocina). El usuario Gerente mantiene la capacidad de imprimir sin restricciones como mecanismo de contingencia.

## Problem Statement
Actualmente, los vouchers de comida solo se pueden imprimir una vez superada la hora límite de autorización (`LimiteAutorizacionAlmuerzo` o `LimiteAutorizacionCena`). Esto genera dificultades operativas:
- Los Jefes de Servicio en turnos previos o antes de fines de semana/feriados/noches deben dejar los vouchers impresos antes de retirarse.
- Si se habilitara la impresión libre antes del cierre sin controles, podrían imprimirse múltiples copias de los vouchers, lo que provocaría la duplicación no autorizada de vales de ración en cocina.

## Proposed Solution
1. **Registro y Validación en Backend (`ImpresionesVoucher`)**:
   - Crear una tabla/modelo `ImpresionesVoucher` con restricción única `@@unique([ServicioId, FechaPedido, TipoComida])`.
   - Cuando un Jefe de Servicio intenta imprimir, el backend valida si ya existe una impresión registrada para su servicio, fecha y turno:
     - Si **no existe**, registra la fecha, hora y usuario que imprime, permitiendo la generación del documento de impresión.
     - Si **ya existe** y el usuario es `JEFE_SERVICIO`, el sistema bloquea la reimpresión con un aviso informativo instando a contactar al Usuario Gerente en caso de falla de impresora.
     - Si el usuario es `GERENTE` o `ADMINISTRADOR`, se permite la impresión sin restricciones.

2. **Confirmación y Alerta en Frontend**:
   - Al hacer clic en "Vouchers Alm." o "Vouchers Cena" antes de la hora tope, se solicita confirmación explícita mediante un cuadro de diálogo advertiendo que la emisión es única.
   - En la interfaz se actualiza el estado del botón a "Impreso" con el detalle del usuario y horario de emisión.

## User Impact
- **Jefe de Servicio**: Puede organizar la entrega de vouchers para la noche o fin de semana antes de concluir su jornada. Tiene la seguridad de que no habrá duplicaciones accidentales.
- **Gerente**: Conserva el control total para reimprimir vouchers en caso de problemas técnicos (papel atascado, falta de tinta, etc.).
- **Cocina / Nutrición**: Recibe vouchers legítimos y sin duplicaciones imprevistas.

## SQL & DB Requirements
- Se proveerá el script SQL de migración para la tabla `ImpresionesVoucher` compatible con SQL Server / entorno de producción conforme a las reglas del proyecto.
