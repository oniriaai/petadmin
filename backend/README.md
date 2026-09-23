# Backend — API Modular Pethijos & Kinderdog

API Express con TypeScript y Prisma ORM estructurada como un **Modular Monolith** por dominios de negocio verticales. Concentra autenticación, lógica de guardería y peluquería, persistencia en PostgreSQL y generación de URLs firmadas para Backblaze B2.

---

## Requisitos

- Node.js 20+
- npm
- PostgreSQL 16
- Docker y Docker Compose (recomendado)

---

## Estructura Modular del Backend

```text
backend/src/
├── core/                                # Contratos y capacidades transversales
│   ├── auth/                           # Middleware JWT, roles, normalización
│   ├── clients/                        # Router público de Clientes / Tutores
│   ├── pets/                           # Router público de Mascotas
│   ├── storage/                        # Cliente S3 presigned para Backblaze B2
│   └── index.ts                        # Barrel de utilidades y exports del Core
│
├── modules/                             # Slices de negocio especializados
│   ├── reservas/                         # Reservas y planes recurrentes
│   ├── guarderia/                      # MÓDULO GUARDERÍA (Kinderdog)
│   │   ├── attendance.service.ts       # Ocupación en vivo, control de cupos y check-in/out
│   │   └── guarderia.router.ts         # Router montado en /api/v1/guarderia
│   │
│   └── peluqueria/                     # MÓDULO PELUQUERÍA (Pethijos)
│       ├── services.ts                 # Catálogo de servicios y duraciones estimadas
│       ├── appointments.service.ts     # Agendamiento, cálculo de horarios y cobro directo
│       └── peluqueria.router.ts        # Router montado en /api/v1/peluqueria
│
├── routes/                             # Routers existentes en migración
│   ├── auth.ts                         # Login y emisión de JWT
│   ├── dashboard.ts                    # Resúmenes operativos y KPIs
│   ├── reservations.ts                 # Compatibilidad; implementación en modules/reservas
│   ├── check-in-out.ts                 # Asistencia legacy
│   ├── rooms.ts                        # Salas físicas
│   ├── recurring-plans.ts              # Compatibilidad; implementación en modules/reservas
│   ├── incomes.ts                      # Ingresos contables segregados
│   ├── payables.ts                     # Cuentas por pagar y gastos
│   ├── inventory.ts                    # Inventario y movimientos por unidad
│   └── reports.ts                      # Reportes y exportaciones
│
├── db.ts                               # Instancia central de PrismaClient
└── main.ts                             # Bootstrap de la aplicación Express
```

### Registro de módulos

`src/platform/module-registry.ts` es el punto de composición del backend. Cada entrada
declara un `id`, `basePath`, router y descripción, y `main.ts` registra todas las
entradas mediante `registerBackendModules`. Los IDs y paths se validan para impedir
colisiones al incorporar un módulo nuevo.

Los dominios compartidos de Clientes y Mascotas se exponen desde `src/core/clients`,
`src/core/pets` y `src/core/modules.ts`. Sus rutas HTTP actuales se mantienen estables,
pero el registro ya depende de la superficie pública de Core y no de los archivos planos
de `src/routes`.

Consulta [docs/adding-a-module.md](../docs/adding-a-module.md) para el checklist
completo de backend y frontend.

---

## Nuevos Endpoints Modulares

### Módulo de Guardería (`/api/v1/guarderia`)
*Acceso exclusivo para roles `admin` y `kinderdog` (usuarios con rol `pethijos` reciben `403 Forbidden`).*

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/guarderia/occupancy` | Consulta ocupación en tiempo real por cada sala (capacidad, ocupados, libres, % ocupación y lista de perrhijos en estancia con foto y tutor). |
| `GET` | `/guarderia/attendance/today` | Lista reservas esperadas para hoy y check-ins activos. |
| `POST` | `/guarderia/attendance/check-in` | Registra check-in en sala validando que no se exceda la capacidad física máxima. |
| `POST` | `/guarderia/attendance/check-out` | Registra salida de guardería con opción de generar cobro contable independiente para `KINDERDOG`. |
| `GET` | `/guarderia/transport` | Rutas consolidadas de transporte del día (recogidas y entregas). |

### Módulo de Peluquería (`/api/v1/peluqueria`)
*Acceso exclusivo para roles `admin` y `pethijos` (usuarios con rol `kinderdog` reciben `403 Forbidden`).*

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/peluqueria/services` | Catálogo de servicios con nombre, categoría, duración estimada en minutos y tarifa base. |
| `GET` | `/peluqueria/appointments` | Listado de citas de peluquería con filtros por fecha (`?date=YYYY-MM-DD`), estado y búsqueda. |
| `GET` | `/peluqueria/appointments/:id` | Detalle completo de una cita y sus pagos registrados. |
| `POST` | `/peluqueria/appointments` | Agenda nueva cita por fecha, servicio y duración estimada (`endTime = startTime + durationMinutes`). Admite anticipo opcional. |
| `PATCH` | `/peluqueria/appointments/:id/status` | Actualiza estado del servicio: `PENDIENTE` → `RECEPCIONADA` → `EN_PROCESO` → `LISTO` → `COMPLETADA` → `CANCELADA`. |
| `POST` | `/peluqueria/appointments/:id/complete` | Completa la cita y registra el cobro contable independiente para `PETHIJOS`. |
| `DELETE` | `/peluqueria/appointments/:id` | Cancela/elimina una cita de peluquería. |

---

## Multi-Tenancy y Aislamiento de Negocio

El sistema aplica aislamiento estricto mediante el middleware `auth.ts`:

1. **Roles disponibles**: `admin`, `kinderdog`, `pethijos`.
2. **Usuarios `kinderdog`**: Solo pueden acceder al módulo `/guarderia` y a finanzas de Kinderdog.
3. **Usuarios `pethijos`**: Solo pueden acceder al módulo `/peluqueria` y a finanzas de Pethijos.
4. **Usuarios `admin`**: Acceso sin restricción a ambos módulos y vistas consolidadas. Pueden acotar el alcance enviando el header `X-Business-Unit: KINDERDOG|PETHIJOS`.
5. **Datos Compartidos**: Las entidades `Client` y `Pet` viven en el Core compartido para evitar duplicar tutores y permitir que un perrhijo utilice tanto guardería como peluquería sin fragmentar su historial.
6. **Segregación Contable**: Cada cobro (`Income`) y compra/gasto (`Payable`) pertenece estrictamente a una unidad (`KINDERDOG` o `PETHIJOS`). Los cobros de guardería y peluquería se registran por separado.

---

## Scripts Disponibles

```bash
# Desarrollo local
npm run dev                  # Inicia tsx watch src/main.ts
npm run build                # Compila TypeScript a dist/
npm run start                # Ejecuta build compilado

# Base de datos
npm run db:generate          # Genera Prisma Client
npm run db:push              # Sincroniza esquema en PostgreSQL
npm run db:seed              # Ejecuta datos iniciales (seed.ts)
npm run db:setup             # push + seed

# Suites de Pruebas E2E
npm run test:modular         # Suite E2E de dominios modulares (Guardería y Peluquería)
npm run test:financial       # Suite E2E de transacciones y cuentas por pagar
npm run test:checkin         # Suite E2E de check-in / check-out
```

---

## Ejecución con Docker

Recomendado para garantizar el entorno idéntico a producción:

```bash
# Desde la raíz del repositorio:
docker compose up --build

# Correr pruebas dentro del contenedor:
docker exec pethijos-backend npm run test:modular
docker exec pethijos-backend npm run test:financial
docker exec pethijos-backend npm run test:checkin
```
