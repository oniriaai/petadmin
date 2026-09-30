# Pethijos Admin — Plataforma Modular Multi-Guardería

Sistema administrativo modular (**Modular Monolith**) multi-inquilino para la gestión operativa y
financiera de guarderías y peluquerías caninas. Cada guardería cliente es un **inquilino** (`Daycare`)
con sus propios datos, usuarios y **módulos contratados**; el proveedor los administra desde una
consola propia.

Cada inquilino opera hasta dos **unidades de negocio**: `DAYCARE` ("Guardería") y `GROOMING`
("Peluquería").

- 🐶 **Guardería**: semáforo de cupos por sala en tiempo real, estancias diarias, check-in/check-out
  con validación de aforo, planes recurrentes semanales y rutas de transporte.
- ✂️ **Peluquería**: catálogo de servicios con duración estimada y tarifas base, agenda por franja
  horaria, tablero kanban (`Agendada` → `En Salón` → `En Baño/Corte` → `Listo` → `Entregada`) y cobro directo.
- 🐾 **Núcleo compartido**: tutores y perrhijos (con historial, vacunas y fotos en Backblaze B2),
  autenticación JWT y aislamiento estricto entre inquilinos.
- 💵 **Finanzas**: cobros e ingresos contables segregados por unidad, cuentas por pagar, inventario
  por local y dashboard consolidado.
- 🛡️ **Consola de plataforma**: alta de guarderías, activación de módulos por cliente, provisión de
  usuarios y auditoría. Exclusiva del proveedor.

---

## Vista General

### Stack Tecnológico
- `frontend/`: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons.
- `backend/`: Node.js 20, Express, TypeScript, Prisma ORM.
- `postgres`: PostgreSQL 16.
- `pgadmin`: consola opcional para inspección de base de datos.
- `Backblaze B2`: almacenamiento compatible S3 para fotos y archivos mediante URLs presignadas.

### Arquitectura Modular
```text
.
├── backend/
│   ├── prisma/
│   │   ├── migrations/            # Historial aplicado (baseline + rename + tenancy)
│   │   └── legacy-migrations/     # Superadas por el baseline; se conservan por trazabilidad
│   ├── src/
│   │   ├── core/
│   │   │   ├── clients/ pets/     # Dominios compartidos
│   │   │   ├── storage/           # Construcción y validación de claves de objeto (B2)
│   │   │   └── tenancy/           # Resolución de inquilino y ajustes por unidad
│   │   ├── modules/               # Slices de negocio + platform-admin (consola)
│   │   ├── platform/              # Registro de módulos, catálogo de producto, gate de acceso
│   │   ├── routes/                # Routers en proceso de migración
│   │   └── main.ts                # Bootstrap que compone el registro
│   └── tests/                     # Arquitectura + E2E (modular, financial, checkin, tenancy, platform)
├── frontend/
│   └── src/
│       ├── modules/               # Contratos y registro de módulos
│       ├── pages/
│       │   ├── guarderia/ peluqueria/ clientes/ transacciones/
│       │   └── platform/          # Consola del proveedor (carga diferida)
│       └── components/layout/     # Sidebar contextual y banner de modo plataforma
└── docs/                          # Documentación funcional y checklist de módulos
```

---

## Multi-Inquilino, Roles y Módulos

### Inquilinos

Toda fila operativa pertenece a una guardería. Los modelos consultados directamente por un router
llevan `daycareId`; los registros hijos (vacunas, documentos, pagos, movimientos de inventario)
heredan el inquilino a través de su padre.

**Regla de respuesta**: pedir un registro de otro inquilino devuelve **404** (no se confirma que
exista); pedir un módulo no contratado devuelve **403** con `code: "MODULE_DISABLED"`. Son fallos
distintos y se mantienen distinguibles a propósito.

### Roles

| Rol | Alcance |
|---|---|
| `superadmin` | Proveedor. **No pertenece a ninguna guardería** y ninguna guardería puede asignarlo. Acceso total; fija un inquilino con la cabecera `X-Daycare-Id`. |
| `admin` | Administrador de su guardería, ambas unidades, con selector de workspace. |
| `daycare` | Operación de Guardería de su guardería. |
| `grooming` | Operación de Peluquería de su guardería. |

La base de datos garantiza la invariante con la restricción `users_superadmin_untenanted`:
`(role = 'superadmin') = ("daycareId" IS NULL)`.

### Módulos de producto

Lo que se vende y lo que la consola activa por cliente. Cada uno concede varios módulos internos
del backend (definidos en `backend/src/platform/product-modules.ts`):

| Módulo | Concede | Notas |
|---|---|---|
| `nucleo` | `auth`, `dashboard`, `clients`, `pets`, `storage`, `settings` | Núcleo: siempre disponible, no se puede desactivar |
| `reservas` | `reservations`, `rooms`, `check-in-out`, `recurring-plans` | Primitivos compartidos: las reservas de peluquería también ocupan sala y registran entrada/salida |
| `guarderia` | `guarderia` | Requiere `reservas` |
| `peluqueria` | `peluqueria` | Requiere `reservas` |
| `finanzas` | `incomes`, `payables`, `providers` | |
| `inventario` | `inventory` | Stock con aviso de mínimo y movimientos |
| `informes` | `reports`, `export` | |
| `cumplimiento` | `contracts`, `alerts` | Pestañas de Alertas y Contratos en Herramientas |
| `plataforma` | `platform` | Solo del proveedor; nunca se asigna a una guardería |

Los cobros generados al cerrar una estancia o una cita **se registran siempre**, incluso con
`finanzas` deshabilitado: lo que se restringe es el acceso a la API y a la interfaz financiera.

El registro de módulos (`registerBackendModules`) monta cada módulo como
`requireAuth → requireModuleAccess → router`, así que la autorización por rol y por contratación
vive en un solo sitio. Un módulo backend que no pertenezca a ningún módulo de producto **impide
arrancar la aplicación**, para que nada quede montado sin control.

---

## Inicio Rápido con Docker

### 1. Variables de entorno
```bash
cp .env.example .env
```
Verifica PostgreSQL, puertos, claves de B2 y las variables `SUPERADMIN_*`.
`SUPERADMIN_PASSWORD` es **obligatoria** cuando `NODE_ENV=production`; en desarrollo hay un valor
por defecto que el seed anuncia con una advertencia.

### 2. Levantar el stack
```bash
docker compose up --build
```

El contenedor del backend ejecuta:
1. `prisma generate`
2. `prisma migrate deploy` — historial versionado, ya no `db push`
3. Seed (`prisma/seed.ts`)
4. Servidor Express con scheduler de planes en el puerto `3001`

### 3. URLs
- **Frontend**: [http://localhost:5174](http://localhost:5174)
- **Health check**: [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)
- **pgAdmin**: [http://localhost:5050](http://localhost:5050) (`admin@pethijos.com` / `admin123`)

---

## Credenciales de Acceso

El seed provisiona **dos inquilinos**. El segundo existe a propósito con módulos desactivados: una
base de datos de un solo inquilino oculta exactamente los fallos que el aislamiento y la
contratación deben evitar.

### Guardería `pethijos` — todos los módulos activos

| Usuario | Contraseña | Rol | Contexto |
|---|---|---|---|
| `admin_global` | `admin123` | `admin` | Vista consolidada con selector de unidad |
| `kinderdog_admin` | `kinderdog123` | `daycare` | Operación y finanzas de Guardería |
| `pethijos_admin` | `pethijos123` | `grooming` | Operación y finanzas de Peluquería |

### Guardería `demo` — solo `GROOMING`, con `reservas` y `peluqueria`

| Usuario | Contraseña | Rol | Contexto |
|---|---|---|---|
| `demo_admin` | `demo123` | `admin` | Guardería, finanzas, inventario, informes y cumplimiento **desactivados** |

### Plataforma (proveedor)

| Usuario | Contraseña | Rol | Contexto |
|---|---|---|---|
| `superadmin` | `superadmin123` | `superadmin` | Consola en `/platform`. Configurable con `SUPERADMIN_USERNAME` / `SUPERADMIN_PASSWORD`; el seed **nunca** cambia la contraseña de un superadmin existente |

En la pantalla de login, el proveedor entra por la tarjeta **Plataforma** (no selecciona unidad).

---

## Verificación y Pruebas Automatizadas

```bash
# Arquitectura: registros, catálogo de producto, gate de módulos, claves de objeto
cd backend && npm run test:architecture

# E2E dentro del contenedor
docker exec pethijos-backend npm run test:modular     # Guardería, Peluquería, permisos y cobros
docker exec pethijos-backend npm run test:financial   # Transacciones y cuentas por pagar
docker exec pethijos-backend npm run test:checkin     # Check-in / check-out
docker exec pethijos-backend npm run test:tenancy     # Aislamiento, MODULE_DISABLED y unidad de negocio
docker exec pethijos-backend npm run test:platform    # Consola de plataforma
docker exec pethijos-backend npm run test:settings    # Configuración por guardería y su efecto en el IVA
docker exec pethijos-backend npm run test:scheduler   # Idempotencia del generador de planes recurrentes

# Frontend
cd frontend && npm run build && npm test -- --run
```

`test:platform` crea y elimina su propia guardería de prueba, así que no depende de los inquilinos
sembrados ni los altera.

---

## Documentación Detallada

- [backend/README.md](backend/README.md): API, endpoints modulares, tenancy y consola.
- [frontend/README.md](frontend/README.md): aplicación React, navegación contextual y gating de módulos.
- [docs/alcance.md](docs/alcance.md): alcance funcional por módulo y reglas de negocio.
- [docs/functional-design.md](docs/functional-design.md): flujos operativos y mapa de experiencia.
- [docs/adding-a-module.md](docs/adding-a-module.md): checklist para incorporar nuevos módulos.
- [docs/futuras-implementaciones.md](docs/futuras-implementaciones.md): roadmap técnico.
