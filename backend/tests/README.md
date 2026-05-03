# Backend E2E Tests

Este directorio contiene suites E2E ejecutadas contra un backend ya levantado en `http://localhost:3001`.

## Suites disponibles

- `check-in-out.e2e.ts`: pruebas del flujo operativo de check-in/check-out (ad-hoc y ligado a reservas).
- `financial.e2e.ts`: smoke E2E financiero para `incomes` y `payables` (CRUD base + pagos parciales).

## Prerrequisitos

1. Backend corriendo en `http://localhost:3001`.
2. Base inicializada con seed.
3. Credenciales admin disponibles (por defecto):
   - `businessUnit`: `KINDERDOG`
   - `username`: `kinderdog_admin`
   - `password`: `kinderdog123`

## Ejecucion

Desde `backend/`:

```bash
npm run test:checkin
npm run test:financial
```

Tambien puedes ejecutar cada suite directamente:

```bash
tsx tests/check-in-out.e2e.ts
tsx tests/financial.e2e.ts
```

## Cobertura actual

### Check-in/Check-out (`test:checkin`)

- autenticacion y preparacion de cliente/mascota
- creacion ad-hoc por `petId` y `petIds`
- consulta de activos e historial
- check-in/check-out sobre registros ad-hoc
- validacion de flujo unificado reserva -> `check_in_out`

### Financiero (`test:financial`)

- `incomes`:
  - crear ingreso con IVA
  - listar y actualizar ingreso
- `payables`:
  - crear documento por pagar con IVA
  - registrar pago parcial
  - revertir pago parcial
- limpieza de datos creados por la suite

## Notas

- Las suites son E2E reales: dependen del estado operativo de API + DB.
- Si usas Docker Compose desde la raiz, verifica que `backend` y `postgres` esten `Up` antes de correr pruebas.
