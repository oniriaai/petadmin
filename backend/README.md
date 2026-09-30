# Backend — API Modular Multi-Inquilino

API Express con TypeScript y Prisma ORM estructurada como un **Modular Monolith** por dominios
verticales. Concentra autenticación, aislamiento entre guarderías, contratación de módulos, lógica
de guardería y peluquería, persistencia en PostgreSQL y URLs firmadas para Backblaze B2.

---

## Requisitos

- Node.js 20+
- npm
- PostgreSQL 16
- Docker y Docker Compose (recomendado)

---

## Estructura

```text
backend/src/
├── core/                                # Capacidades y contratos transversales
│   ├── clients/                        # Router público de tutores
│   ├── pets/                           # Router público de mascotas
│   ├── storage/object-keys.ts          # Construcción y validación de claves de objeto B2
│   ├── tenancy/scope.ts                # Resolución del inquilino de cada petición
│   ├── tenancy/unit-settings.ts        # Ajustes por (guardería, unidad)
│   └── modules.ts                      # Superficie pública del Core
│
├── platform/                            # Composición y control de acceso
│   ├── module-registry.ts              # Único punto de montaje de módulos
│   ├── module.ts                       # Contrato `BackendModule`
│   ├── product-modules.ts              # Catálogo de módulos vendibles
│   └── module-access.ts                # Entitlements por guardería + middleware del gate
│
├── modules/                             # Slices de negocio
│   ├── operaciones/                     # Salas y check-in/check-out
│   ├── reservas/                        # Reservas y planes recurrentes
│   ├── guarderia/                       # Ocupación en vivo, aforo y transporte
│   ├── peluqueria/                      # Catálogo, agenda y flujo de atención
│   └── platform-admin/                  # Consola del proveedor (/platform)
│
├── middleware/auth.ts                   # JWT, roles, unidades, versión de token
├── routes/                              # Routers en migración (finanzas, informes, etc.)
├── lib/s3.ts                            # Cliente S3 para Backblaze B2
├── db.ts                                # Instancia central de PrismaClient
└── main.ts                              # Bootstrap de Express
```

---

## Registro de módulos y control de acceso

`src/platform/module-registry.ts` es el **único** punto de composición. `registerBackendModules()`
monta cada módulo así:

```ts
app.use(`${prefix}${basePath}`, requireAuth, requireModuleAccess(module), module.router);
```

El gate es **hermano** del router, nunca un envoltorio: el router que exporta el módulo sigue
siendo exactamente el objeto que se monta.

`requireModuleAccess` decide en este orden, y el orden importa:

1. Sin sesión → **401**.
2. `role === "superadmin"` → **permitido**. Va antes del control de rol a propósito: ningún módulo
   lista `superadmin` en `access.roles` (ahí se enumeran roles de inquilino), así que comprobar el
   rol primero dejaría a la plataforma fuera del producto que administra.
3. Rol no permitido → **403** sin código.
4. Módulo de producto `core` → permitido.
5. Unidad de negocio que el módulo no sirve → **403** con `{ code: "WRONG_BUSINESS_UNIT" }`.
   Solo muerde para un rol que abarca ambas unidades y que ha acotado con `X-Business-Unit`:
   pedir la ocupación de Guardería estando en Peluquería devolvía datos de Guardería e ignoraba
   la cabecera en silencio.
6. Módulo no contratado por la guardería → **403** con
   `{ code: "MODULE_DISABLED", module }`.

El módulo `auth` es el único `public: true`: se monta sin `requireAuth` porque es de donde sale la
sesión. `GET /auth/me` aplica `requireAuth` por su cuenta.

`validateBackendModules()` se ejecuta al arrancar y en `test:architecture`. Falla si hay ids o
paths duplicados, si algún módulo que no sea `auth` se declara público, o si **un módulo backend no
pertenece a ningún módulo de producto** — esa última invariante es lo que impide que un módulo nuevo
quede montado sin control.

Los entitlements se leen con una caché en memoria de 30 s (`module-access.ts`). La consola llama a
`invalidate(daycareId)` en cada escritura, así que un cambio de contratación se nota en la petición
siguiente, sin esperar al TTL.

---

## Aislamiento entre guarderías

Todo `where` de datos operativos deriva su inquilino de `src/core/tenancy/scope.ts`, nunca del
cuerpo de la petición:

| Helper | Uso |
|---|---|
| `resolveDaycareScope(req)` | `{ mode: "single", daycareId }` o `{ mode: "all" }` (solo superadmin sin fijar) |
| `buildScopeWhere(req)` | Fragmento de inquilino **y** unidad de negocio. Sustituye al antiguo `buildBusinessUnitWhere` |
| `buildDaycareWhere(req)` | Solo el fragmento de inquilino |
| `buildChildScopeWhere(req, rel)` | Para modelos que heredan el inquilino por su padre |
| `getRequiredDaycareId(req)` | Escrituras. Un superadmin **debe** fijar con `X-Daycare-Id` o recibe 400 |
| `assertRecordAccess(req, row)` | Comprobación posterior: inquilino **y** unidad |

`buildBusinessUnitWhere` fue **eliminado**, no marcado como obsoleto: un helper que filtra por
unidad pero no por inquilino lee entre guarderías, y dejarlo importable invita justo a ese fallo.

### Cabeceras

| Cabecera | Quién | Efecto |
|---|---|---|
| `Authorization: Bearer <jwt>` | Todos | Sesión. Los tokens llevan `tv` (versión); uno anterior a la tenancy recibe 401 limpio |
| `X-Business-Unit: DAYCARE\|GROOMING` | `admin` y `superadmin` | Acota la vista a una unidad. Sin ella, consolidado |
| `X-Daycare-Id: <id>` | `superadmin` | Fija el inquilino. Un usuario de guardería solo puede enviar el suyo (403 en otro caso) |

### 404 frente a 403

- **404** al pedir un registro de otro inquilino: confirmar que existe ya sería una fuga.
- **403** al pedir un módulo no contratado, con `code: "MODULE_DISABLED"`.
- **403** al pedir un módulo que el rol no alcanza, **sin** ese código.

---

## Endpoints

### Configuración (`/api/v1/settings`, solo `admin`)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/settings` | Datos de la guardería (solo lectura) y una entrada por unidad contratada |
| `PUT` | `/settings/:businessUnit` | IVA por defecto y zona horaria de esa unidad |

El IVA configurado es el que usan las reservas y citas nuevas que no indiquen otro; antes estaba
escrito a mano como `15` en tres sitios. La zona horaria se valida contra el runtime, porque una
zona inexistente desplazaría en silencio cada ocurrencia que genera el planificador.

### Autenticación (`/api/v1/auth`, público)

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Emite el JWT. Comprueba que la guardería esté activa y que el rol y el inquilino sean coherentes |
| `GET` | `/auth/me` | Sesión según el servidor: `{ user, daycare, enabledModules, units, fullAccess }`. Es lo que permite que el frontend filtre la navegación sin confiar en `localStorage` |

Para un superadmin, `/auth/me` depende de si hay inquilino fijado: sin fijar informa alcance total;
fijado informa los entitlements **reales de ese inquilino**, para ver lo mismo que sus usuarios.
`fullAccess` sigue siendo `true` en ambos casos, porque el gate no lo restringe de verdad.

### Consola de plataforma (`/api/v1/platform`, solo `superadmin`)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/platform/overview` | Conteos de guarderías, usuarios y módulos habilitados |
| `GET` | `/platform/modules` | Catálogo de módulos vendibles, unidades y roles asignables |
| `GET` | `/platform/daycares` | Listado con conteo de usuarios y módulos |
| `POST` | `/platform/daycares` | Crea guardería + entitlements + ajustes por unidad + su primer administrador |
| `GET` | `/platform/daycares/:id` | Detalle con matriz de módulos, usuarios y auditoría |
| `PATCH` | `/platform/daycares/:id` | Nombre, razón social, zona horaria, unidades, activación |
| `GET` | `/platform/daycares/:id/modules` | Matriz de contratación |
| `PUT` | `/platform/daycares/:id/modules` | Alta/baja masiva de módulos |
| `POST` | `/platform/daycares/:id/users` | Provisiona un usuario de la guardería |
| `PATCH` | `/platform/daycares/:id/users/:userId` | Activar/desactivar, renombrar, cambiar rol o contraseña |
| `POST` | `/platform/daycares/:id/refresh` | Invalida la caché de entitlements a mano |
| `GET` | `/platform/audit` | Registro de auditoría |

Garantías del módulo:

- El rol de un usuario determina su unidad (`admin` → `GLOBAL`, `daycare` → `DAYCARE`,
  `grooming` → `GROOMING`); no se acepta del cuerpo de la petición, y debe caber en una unidad que
  la guardería haya contratado.
- `superadmin` no existe en el esquema de roles asignables, así que no se puede pedir.
- Las dependencias entre módulos se validan sobre el **estado resultante**, no sobre el cambio: se
  rechaza tanto habilitar `guarderia` sin `reservas` como quitar `reservas` con `guarderia` activo.
- Un usuario solo se edita a través de su propia guardería (404 en caso contrario).
- No se puede desactivar al último administrador activo ni quitar una unidad con usuarios activos.
- **No hay endpoint para borrar una guardería**: eliminar un inquilino con datos operativos no debe
  estar a una petición de distancia.
- Toda escritura queda auditada; las contraseñas nunca llegan al registro.

### Módulo de Guardería (`/api/v1/guarderia`)
*Roles `admin` y `daycare`. Requiere el módulo de producto `guarderia`.*

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/guarderia/occupancy` | Ocupación en tiempo real por sala |
| `GET` | `/guarderia/attendance/today` | Reservas esperadas y check-ins activos |
| `POST` | `/guarderia/attendance/check-in` | Check-in validando el aforo físico |
| `POST` | `/guarderia/attendance/check-out` | Salida con cobro contable opcional para `DAYCARE` |
| `GET` | `/guarderia/transport` | Recogidas y entregas del día |

### Módulo de Peluquería (`/api/v1/peluqueria`)
*Roles `admin` y `grooming`. Requiere el módulo de producto `peluqueria`.*

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/peluqueria/services` | Catálogo con duración estimada y tarifa base |
| `GET` | `/peluqueria/appointments` | Citas con filtros por fecha, estado y búsqueda |
| `GET` | `/peluqueria/appointments/:id` | Detalle y pagos registrados |
| `POST` | `/peluqueria/appointments` | Agenda una cita (`endTime = startTime + durationMinutes`), con anticipo opcional |
| `PATCH` | `/peluqueria/appointments/:id/status` | `PENDIENTE` → `RECEPCIONADA` → `EN_PROCESO` → `LISTO` → `COMPLETADA` → `CANCELADA` |
| `POST` | `/peluqueria/appointments/:id/complete` | Completa y registra el cobro para `GROOMING` |
| `DELETE` | `/peluqueria/appointments/:id` | Cancela la cita |

---

## Almacenamiento de objetos (Backblaze B2)

`src/core/storage/object-keys.ts` es el único sitio donde se decide la forma de una clave:

```
daycares/{daycareId}/pets/{mascota}_{tutor}/{timestamp}-{archivo}
```

- Todos los segmentos se sanean; ninguno puede ser `.` ni `..` ni contener separadores.
- `resolveObjectKey` rechaza travesías, segmentos vacíos y **URLs cuyo host no sea este bucket**.
  Importa el orden: el parser de URL normaliza `/../../x` a `/x` en silencio, así que lo que
  realmente protege es la comprobación de host. Sin `B2_ENDPOINT` configurado se rechaza cualquier URL.
- `DELETE /storage` autoriza **contra la base de datos**: la clave debe estar referenciada por un
  `Pet.photoUrl` o un `PetDocument.filePath` **de la guardería que llama**. Autorizar por la forma
  de la clave no serviría, y así las claves antiguas sin prefijo siguen funcionando mientras que
  adivinar la de otro inquilino no logra nada.

---

## Migraciones

El historial vive en `prisma/migrations/` y se aplica con `prisma migrate deploy` (Docker ya lo
hace). `prisma db push` queda como salida de emergencia en desarrollo.

| Migración | Contenido |
|---|---|
| `20260901000000_baseline` | Esquema completo previo a la tenancy |
| `20260902000000_rename_business_units` | `KINDERDOG`→`DAYCARE`, `PETHIJOS`→`GROOMING` y sus roles |
| `20260903000000_add_daycare_tenancy` | `daycares`, `daycare_modules`, `platform_audit_logs`, `daycareId` con backfill, FKs, índices y el CHECK `users_superadmin_untenanted` |
| `20260904000000_add_unit_vat_percent` | `business_unit_settings.vatPercent`, con el valor por defecto que ya estaba escrito a mano |

`prisma/legacy-migrations/` conserva tres migraciones anteriores al baseline. Están **fuera** de
`prisma/migrations/` a propósito: sus marcas de tiempo ordenan antes que el baseline, así que en una
base de datos nueva `migrate deploy` las ejecutaría primero y el baseline fallaría al recrear las
mismas tablas.

---

## Scripts

```bash
# Desarrollo
npm run dev                  # tsx watch src/main.ts
npm run build                # Compila src + (seed, scripts, tests) a través de tsconfig.seed.json
npm run start                # Ejecuta el build
npm run typecheck:aux        # Solo seed/scripts/tests

# Base de datos
npm run db:generate          # Prisma Client
npm run db:migrate           # migrate deploy
npm run db:migrate:dev       # migrate dev
npm run db:push              # Salida de emergencia; no usar con datos reales
npm run db:seed              # prisma/seed.ts
npm run db:setup             # migrate deploy + seed

# Pruebas
npm run test:architecture    # Registros, catálogo, gate de módulos, claves de objeto
npm run test:modular         # E2E Guardería y Peluquería
npm run test:financial       # E2E transacciones y cuentas por pagar
npm run test:checkin         # E2E check-in / check-out
npm run test:tenancy         # Aislamiento, MODULE_DISABLED y unidad de negocio
npm run test:platform        # Consola de plataforma
npm run test:settings        # Configuración por guardería y su efecto en el IVA
npm run test:scheduler       # Idempotencia del generador de planes recurrentes
```

---

## Ejecución con Docker

```bash
docker compose up --build

docker exec pethijos-backend npm run test:modular
docker exec pethijos-backend npm run test:financial
docker exec pethijos-backend npm run test:checkin
docker exec pethijos-backend npm run test:tenancy
docker exec pethijos-backend npm run test:platform
```
