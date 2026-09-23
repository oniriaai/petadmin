# Backend E2E Tests

Suites de pruebas End-to-End ejecutadas contra el backend levantado en `http://localhost:3001/api/v1`.

---

## Suites Disponibles

0. **`module-registry.ts` (`npm run test:architecture`)**:
   - Verifica que todos los módulos backend tengan IDs y paths únicos.
   - Verifica que los módulos especializados publiquen sus roles y unidades permitidas.

1. **`modular-domains.e2e.ts` (`npm run test:modular`)**:
   - Pruebas del **Módulo de Peluquería**: Catálogo con duraciones, agendamiento ágil por fecha/servicio/duración, cálculo de fin de servicio, transición de estados del kanban, cobro contable independiente para Pethijos y aislamiento multi-tenant contra rol Kinderdog.
   - Pruebas del **Módulo de Guardería**: Monitoreo de ocupación en vivo, semáforo de cupos por sala, check-in con validación estricta de capacidad física de sala, check-out con cobro independiente para Kinderdog y aislamiento multi-tenant contra rol Pethijos.

2. **`check-in-out.e2e.ts` (`npm run test:checkin`)**:
   - Flujo operativo de check-in / check-out general (ad-hoc y ligado a reservas).
   - Ocupación de salas y cálculo de balances.

3. **`financial.e2e.ts` (`npm run test:financial`)**:
   - Smoke E2E financiero para `incomes` y `payables` (CRUD base + pagos parciales y totales por unidad de negocio).

---

## Ejecución

### En Docker (Recomendado)
```bash
docker exec pethijos-backend npm run test:modular
docker exec pethijos-backend npm run test:financial
docker exec pethijos-backend npm run test:checkin
```

### En local (fuera de Docker)
```bash
cd backend
npm run test:modular
npm run test:financial
npm run test:checkin
```

---

## Prerrequisitos

1. Backend corriendo en `http://localhost:3001`.
2. Base de datos PostgreSQL con el esquema sincronizado (`prisma db push`).
3. Seed inicial ejecutado (`prisma/seed.ts`):
   - `admin_global` / `admin123`
   - `kinderdog_admin` / `kinderdog123`
   - `pethijos_admin` / `pethijos123`
