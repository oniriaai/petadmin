# Argos Suite — Plataforma Modular Multi-Guardería

Sistema administrativo modular (**Modular Monolith**) multi-inquilino para la gestión operativa y
financiera de guarderías, peluquerías y clínicas veterinarias. Cada guardería cliente es un **inquilino** (`Daycare`)
con sus propios datos, usuarios y **módulos contratados**; el proveedor los administra desde una
consola propia.

Cada inquilino opera hasta tres **unidades de negocio**: `DAYCARE` ("Guardería"), `GROOMING`
("Peluquería") y `VETERINARY` ("Veterinaria").

- 🐶 **Guardería**: semáforo de cupos por sala en tiempo real, estancias diarias, check-in/check-out
  con validación de aforo, planes recurrentes semanales y rutas de transporte.
- ✂️ **Peluquería**: catálogo de servicios con duración estimada y tarifas base, agenda por franja
  horaria, tablero kanban (`Agendada` → `En Salón` → `En Baño/Corte` → `Listo` → `Entregada`) y cobro directo.
- 🩺 **Veterinaria**: agenda de consultas por veterinario y sala, sala de espera con prioridad,
  historia clínica (registro SOAP, signos vitales, diagnósticos), vacunas y preventivos, recetas y
  farmacia sobre el inventario, hospitalización con hoja de tratamiento, cirugías con
  consentimiento firmado, laboratorio e imagen, recordatorios e informe clínico, y cierre con
  cobro acreditado a `VETERINARY`.
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
│   │   ├── migrations/            # Historial aplicado (baseline, rename, tenancy, limpieza, usuarios)
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
| `admin` | Administrador de su guardería, todas sus unidades, con selector de workspace. |
| `daycare` | Operación de Guardería de su guardería. |
| `grooming` | Operación de Peluquería de su guardería. |
| `veterinary` | Operación de la clínica veterinaria de su guardería. El catálogo, el personal y el informe clínico son solo del `admin`. |

La base de datos garantiza la invariante con la restricción `users_superadmin_untenanted`:
`(role = 'superadmin') = ("daycareId" IS NULL)`.

### Módulos de producto

Lo que se vende y lo que la consola activa por cliente. Cada uno concede varios módulos internos
del backend (definidos en `backend/src/platform/product-modules.ts`):

| Módulo | Concede | Notas |
|---|---|---|
| `nucleo` | `auth`, `dashboard`, `clients`, `pets`, `storage`, `settings`, `users` | Núcleo: siempre disponible, no se puede desactivar |
| `reservas` | `reservations`, `rooms`, `check-in-out`, `recurring-plans` | Primitivos compartidos: las reservas de peluquería también ocupan sala y registran entrada/salida |
| `guarderia` | `guarderia` | Requiere `reservas` |
| `peluqueria` | `peluqueria` | Requiere `reservas` |
| `veterinaria` | `veterinaria` | Requiere `reservas`: cada consulta es una reserva de la unidad `VETERINARY` |
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

---

## Despliegue en Producción

`docker-compose.yml` es un stack de **desarrollo**: monta el código, ejecuta `npm run dev`,
publica el puerto de Postgres, incluye pgAdmin y siembra las guarderías de demostración en cada
arranque. No debe apuntarse nunca a datos de clientes.

Para producción se usa `docker-compose.prod.yml`, que construye imágenes
(`backend/Dockerfile`, `frontend/Dockerfile`), no monta código, no expone la base de datos, no
incluye pgAdmin y **no siembra datos de demostración**: un servicio `migrate` de un solo uso
aplica `prisma migrate deploy` y provisiona únicamente la cuenta de plataforma.

Cada servicio declara `image:` y `build:`, de modo que hay dos caminos y `APP_VERSION` elige:

```bash
# Correr una release publicada (preferido): el artefacto que CI verificó.
APP_VERSION=v1.2.3 docker compose -f docker-compose.prod.yml pull
APP_VERSION=v1.2.3 docker compose -f docker-compose.prod.yml up -d

# Construir en este host (sigue funcionando, p. ej. para un hotfix sin etiquetar).
docker compose -f docker-compose.prod.yml up --build -d
```

`pull` descarga la etiqueta indicada y el `up -d` posterior la usa sin construir. Ver
«Releases» más abajo para cómo se publican esas etiquetas.

### Variables obligatorias en producción

El backend **se niega a arrancar** (`assertSecureConfig`) si falta cualquiera de estas, porque
cada una falla de forma silenciosa y peligrosa si se deja por defecto:

| Variable | Por qué es obligatoria |
|---|---|
| `JWT_SECRET` | Firma y verifica los tokens. Antes caía a `"change_me"` en dos sitios: con una clave conocida cualquiera puede emitirse un token de `superadmin`. Mínimo 32 caracteres (`openssl rand -base64 48`). |
| `CORS_ORIGINS` | Lista de orígenes del frontend. Sin ella no hay lista blanca y cualquier sitio podría llamar a la API desde el navegador de un usuario autenticado. |
| `DATABASE_URL` | Conexión a Postgres. |
| `SUPERADMIN_PASSWORD` | Ya exigida por el seed; sin ella no existiría cuenta de plataforma o tendría una contraseña de ejemplo. |

Opcionales, con valores por defecto seguros: `TRUST_PROXY` (número de saltos de proxy inverso
en los que confiar para resolver la IP real; sin definir, los límites por IP comparten contador),
`RATE_LIMIT_GLOBAL`, `RATE_LIMIT_LOGIN`, `RATE_LIMIT_STORAGE`, `SEED_DEMO_DATA` (inactivo en
producción) y `RUN_SCHEDULER_IN_PROCESS` (inactivo en producción).

### Protecciones de borde

- **Límite de inicios de sesión** por IP **y** usuario (`/auth/login`): las dos mitades
  importan, porque los usuarios son únicos a nivel global y adivinar uno es adivinar una cuenta
  real. Los inicios correctos no se cuentan.
- **Límite de almacenamiento** por guardería (`/storage/*`): cada operación cuesta dinero en el
  proveedor, y el límite debe recaer sobre el inquilino, no sobre la IP.
- **Lista blanca de CORS** en vez de reflejar el origen recibido, `helmet` y `x-powered-by`
  desactivado.
- **Suspensión efectiva**: `requireAuth` relee el estado de la cuenta y de la guardería en cada
  petición (con caché corta que la consola invalida al escribir). Desactivar un usuario o
  suspender un inquilino surte efecto en la **petición siguiente**, no cuando caduque su token
  12 horas después. El usuario recibe `403` con `code: "USER_INACTIVE"` o `"DAYCARE_INACTIVE"`,
  distinguibles de un token caducado (`401`).

### El inquilino de backfill

`20260903000000_add_daycare_tenancy` inserta la guardería `daycare_pethijos` sin condiciones:
era correcto para su propósito (adoptar los datos de la instalación de un solo inquilino), pero
en una base de datos **nueva** dejaba un inquilino que nadie creó, activo y con los siete
módulos habilitados. `20260905000000_drop_unused_backfill_tenant` lo elimina **solo si no posee
ningún dato** (se comprueban todas las tablas con `daycareId`). Donde ese inquilino es el
negocio real, se conserva intacto.

### Planes recurrentes

En producción el generador **no** corre dentro del proceso web: N réplicas lo ejecutarían N
veces, y un redespliegue reinicia el temporizador de 24 h, con lo que podría no ejecutarse nunca.
Se invoca como job programado desde el cron del host:

```bash
docker compose -f docker-compose.prod.yml run --rm scheduler
```

La generación es idempotente sobre la clave única `(recurringPlanId, checkIn)`, así que una
ejecución repetida es inofensiva; el job sale con código distinto de cero si alguna ocurrencia
falla.

---

---

## Operación: observabilidad, límites y red de seguridad

### Registro estructurado

Cada petición lleva un `x-request-id` (se acepta el de la pasarela si existe, para que una traza
abarque proxy y API) y cada línea autenticada lleva `daycareId`, `userId`, `username` y `role`:
atender a varias guarderías desde una sola instalación significa que la primera pregunta de
cualquier incidencia es *de qué inquilino*, y `console.log` no podía responderla. El `Authorization`,
las cookies y las contraseñas se eliminan del registro.

Un error no controlado responde `500` con el `requestId` incluido —lo único que hace rastreable un
reporte de "falló sobre las 3"— y nunca con el texto del error. Con `SENTRY_DSN` definido, los
errores se reportan etiquetados por inquilino; sin él no se envía nada.

`GET /api/v1/health` informa además del estado de las migraciones (`applied` / `pending`) y responde
`503` si quedan pendientes: un proceso que corre contra un esquema sin migrar falla en las rutas
reales mientras se declara sano. `GET /api/v1/ready` es la sonda barata para el orquestador.

### Paginación

Los listados aceptan `?page` y `?pageSize` (tope de 200) y devuelven
`{ items, total, page, pageSize, pageCount }`. **Sin parámetros de paginación devuelven el array de
siempre**, acotado: tres formularios (`CheckInOutForm`, `NuevaReservaModal`, `RecurringPlanForm`)
cargan la lista completa en un `<select>`, y un selector truncado en silencio es peor que una
consulta lenta. `X-Total-Count` viaja en ambos casos, así que un cliente siempre puede detectar que
no recibió todo.

El histórico de check-in/out ordenaba por `checkInTime DESC`. Postgres coloca los `NULL` **primero**
en orden descendente, y una fila creada desde una reserva no tiene `checkInTime` hasta que la
mascota llega: con 64 filas así y una página de 50, la primera página del histórico eran visitas que
nunca ocurrieron y la más reciente real era inalcanzable. Ahora `nulls: "last"`, con `createdAt`
como desempate para que los límites de página sean estables.

### Red de seguridad del aislamiento

El aislamiento se aplica en código: cada router deriva su filtro de `core/tenancy/scope.ts`. Eso
no tenía respaldo —un router futuro que olvide `buildScopeWhere` filtra datos de otra guardería sin
que nada lo detecte—, así que el cliente Prisma lleva una extensión
(`core/tenancy/guard.ts`) que **falla ruidosamente** cuando, dentro de la petición de un usuario de
inquilino, una consulta a un modelo con dueño no filtra por inquilino.

Exenciones deliberadas: fuera del contexto de una petición (planificador, seed, scripts), un
`superadmin` sin inquilino fijado, y `update`/`delete` singulares —Prisma exige que su `where`
seleccione una fila única, así que no admiten `daycareId`; el patrón del código es `findFirst`
acotado + `assertRecordAccess` + escritura por id—. Para una consulta acotada a través de un padre
ya verificado existe `withVerifiedScope(motivo, fn)`, que obliga a declarar por qué es segura.

Lanza en desarrollo y CI, y solo advierte en producción: un falso positivo no debe tumbar la
pantalla de un cliente. **Al activarla encontró tres fallos reales de aislamiento** (cliente, sala y
escrituras masivas aceptados desde el cuerpo de la petición sin comprobar el inquilino), ya
corregidos y cubiertos por `test:tenancy`.

### Integración continua

`.github/workflows/ci.yml` se ejecuta en cada push a `main` y en cada pull request, en tres
trabajos:

| Trabajo | Qué comprueba |
|---|---|
| `static` | Tipos (`npm run typecheck`), lint (`eslint`), formato (`prettier --check`) y la suite de arquitectura en el backend; tipos, lint, formato, build y pruebas en el frontend. Sin base de datos, así que falla lo obvio primero. |
| `e2e` | Las **doce** suites e2e contra un Postgres de servicio, con migraciones aplicadas y datos de demostración sembrados. Termina comprobando que el registro del backend no contiene ninguna consulta sin ámbito de inquilino. |
| `production-image` | Construye las dos imágenes de producción y comprueba que el backend **se niega a arrancar** sin `JWT_SECRET` y que una base de datos nueva queda con la cuenta de plataforma y **sin** guarderías de demostración. |

`test:ratelimit` va deliberadamente al final de `e2e`: agota el límite de inicios de sesión a
propósito y antes throttlearía los logins que necesitan las demás suites.

**No hay comprobación de deriva de esquema** (`prisma migrate diff`), y es intencionado: el
índice parcial de `20260906000000_per_tenant_usernames` no se puede expresar en `schema.prisma`,
así que esa comprobación fallaría siempre. Lo que cubre la corrección de las migraciones es
aplicar el historial completo sobre una base vacía en `e2e`, más el hecho de que
`/api/v1/health` responde 503 mientras quede alguna migración pendiente.

El lint arranca en verde a propósito: `no-explicit-any` (106 avisos) y
`react-hooks/exhaustive-deps` (3) están en `warn` con el motivo anotado en cada
`eslint.config`. Prettier se limita a TypeScript; el Markdown y el YAML se formatean a mano
porque sus comentarios están envueltos a mano y reflowearlos costaría más de lo que ordena.

### Releases: entrega continua, despliegue manual

`.github/workflows/release.yml` se dispara al empujar una etiqueta `v*`. Reutiliza el workflow
de CI completo —la etiqueta solo se publica si ese commit exacto pasa las tres fases— y después
publica las imágenes en GHCR y crea una release en GitHub con las instrucciones de despliegue.

```bash
git tag v1.2.3
git push origin v1.2.3
```

Produce `ghcr.io/oniriaai/petadmin-backend:v1.2.3` y `…-frontend:v1.2.3` (más `1.2`, el sha, y
`latest` solo si no es una prerelease: una etiqueta con guion, `v1.2.3-rc1`, publica sus
versiones pero no mueve `latest`).

**Nada de este pipeline toca el servidor de producción, y no hay credenciales SSH en el
repositorio.** El host tira de la versión que quiera, cuando quiera:

```bash
APP_VERSION=v1.2.3 docker compose -f docker-compose.prod.yml pull
APP_VERSION=v1.2.3 docker compose -f docker-compose.prod.yml up -d
```

Lo que esto cambia: producción dejaba de compilar TypeScript en la propia máquina, así que lo
que corría no era el artefacto que CI había verificado. Ahora sí lo es.

Requisito previo, una sola vez: definir la variable de repositorio **`PUBLIC_API_URL`** en
Settings → Secrets and variables → Actions → Variables. El frontend incrusta `VITE_API_URL` en
el build, y `lib/api.ts` sólo tiene fallback para `undefined` con `??`, así que un valor vacío
publicaría un bundle con URL base vacía que falla en el navegador sin dejar rastro en el
servidor. El workflow se niega a publicar si falta.

**Reversión:** apuntar `APP_VERSION` a la etiqueta anterior y repetir los dos comandos. Esto
**no** revierte las migraciones; si la versión que se retira cambió el esquema de forma
incompatible hace falta `scripts/restore.sh`.

---

---

## Ciclo de vida del cliente

### Usuarios: cada guardería administra su personal

`/users` (solo rol `admin`, parte del Núcleo) permite a una guardería listar, crear y desactivar
a su propio personal y restablecer contraseñas. Antes la consola del proveedor era **la única**
vía, así que cada alta, baja u olvido de contraseña en cualquier cliente era un ticket de
soporte: soportable con dos clientes, el coste dominante con veinte.

No reimplementa la lógica: reutiliza `provisionUser` y `updateUser` de la consola, que ya
derivan la unidad del rol, exigen que el rol quepa en una unidad contratada e impiden dejar la
guardería sin administrador activo. La guardería **siempre** sale de
`getRequiredDaycareId(req)`, nunca de la ruta ni del cuerpo, y `ASSIGNABLE_TENANT_ROLES` excluye
`superadmin`. Un admin tampoco puede desactivarse ni degradarse a sí mismo (`SELF_DEMOTION`).

### Nombres de usuario por guardería

Los usuarios son únicos **por guardería**, no globalmente
(`20260906000000_per_tenant_usernames`). Antes lo eran globalmente porque el login no tenía
selector de inquilino, y la consola tenía que disculparse por ello sugiriendo renombrar al
usuario detrás del de otro cliente. Dos clientes pueden tener ahora su propio `recepcion`.

Dos índices, porque cubren cosas distintas: `(daycareId, username)` para la regla del inquilino,
y un índice parcial sobre `username` donde `daycareId IS NULL` para las cuentas de plataforma
—Postgres considera los `NULL` distintos entre sí, así que el primero no las cubriría—.

El login acepta un campo `daycare` opcional con el identificador de la guardería. Solo es
necesario cuando el usuario existe en varias: entonces la API responde `400` con
`code: "DAYCARE_REQUIRED"` y la pantalla de login revela el campo (y lo recuerda). Un usuario
único en toda la instalación sigue entrando sin él, así que nadie tiene que aprender un
identificador que no necesita. Un `daycare` desconocido responde `401`, como una contraseña
incorrecta: no confirma qué guarderías existen.

### Baja de una guardería

- `GET /platform/daycares/:id/export` entrega un libro de Excel con todo lo que posee el
  inquilino (guardería, usuarios, tutores, perrhijos, salas, reservas, cobros, cuentas por
  pagar, inventario y contratos). Sin hashes de contraseña: no son datos que el cliente
  necesite y entregarlos es entregar algo que se puede romper sin prisa.
- `DELETE /platform/daycares/:id` la elimina de forma permanente. Dos salvaguardas, porque es la
  única acción irreversible de la consola: hay que **repetir el identificador** de la guardería
  en el cuerpo (`{ "confirm": "<slug>" }`), y la guardería **debe estar ya desactivada**, de modo
  que "cortarles el acceso" y "destruir sus datos" sean dos decisiones tomadas en dos momentos.

El borrado va en una sola transacción y en orden: varias tablas se referencian entre sí
(`check_in_outs` apunta a reservas, perrhijos, tutores, salas y usuarios) y `users.daycareId` es
`onDelete: Restrict`. Los archivos se borran después y **fuera** de la transacción: el
almacenamiento de objetos no participa en una transacción de base de datos, y el prefijo
(`daycares/{id}/`) se deriva del id, así que un fallo al borrar archivos se informa y se puede
repetir; el orden contrario arriesgaría destruir los archivos de un inquilino que sigue vivo.
Se borran todas las versiones y marcadores de borrado, no solo la versión actual: el bucket
tiene versionado y "hemos borrado sus datos" no debería significar "se pueden recuperar".

La línea de auditoría **sobrevive** al inquilino: `PlatformAuditLog.daycareId` es una columna sin
clave ajena precisamente para que el registro de una eliminación dure más que lo eliminado.

### Copias de seguridad

```bash
scripts/backup.sh [directorio]          # volcado verificado + rotación local
scripts/restore.sh <archivo.dump> [bd]  # restaura en OTRA base y la comprueba
```

`backup.sh` usa el formato `custom` de `pg_dump` (restaurable por tablas y en paralelo),
ejecutándolo **dentro** del contenedor de Postgres para que la versión del cliente siempre
coincida con la del servidor —un desajuste es el motivo habitual de que una restauración falle
justo cuando se necesita—. Después comprueba que `pg_restore` puede leer el archivo: un volcado
ilegible es peor que ninguno, porque se cree bueno.

`restore.sh` restaura en una base **distinta** (`pethijos_restore_check` por defecto) y se niega
a escribir sobre la base en uso. Luego cuenta filas y vuelve a comprobar la invariante
`users_superadmin_untenanted`: si no se cumple, la copia no sirve como punto de partida por
muchas filas que tenga. Una copia que no se ha restaurado nunca no es una copia de seguridad,
así que esto está pensado para ensayarse, no para leerse.

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
| `vet_admin` | `vet12345` | `veterinary` | Clínica veterinaria: agenda, historias clínicas, farmacia, hospitalización y laboratorio |

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
# Arquitectura (no requiere base de datos): registros, catálogo de producto, gate de
# módulos, claves de objeto, guarda de configuración de producción, contrato del
# manejador de errores y contrato de la paginación
cd backend && npm run test:architecture

# E2E dentro del contenedor
docker exec pethijos-backend npm run test:modular     # Guardería, Peluquería, permisos y cobros
docker exec pethijos-backend npm run test:financial   # Transacciones y cuentas por pagar
docker exec pethijos-backend npm run test:checkin     # Check-in / check-out
docker exec pethijos-backend npm run test:tenancy     # Aislamiento, MODULE_DISABLED y unidad de negocio
docker exec pethijos-backend npm run test:platform    # Consola de plataforma
docker exec pethijos-backend npm run test:settings    # Configuración por guardería y su efecto en el IVA
docker exec pethijos-backend npm run test:scheduler   # Idempotencia del generador de planes recurrentes
docker exec pethijos-backend npm run test:suspension  # Desactivación de usuarios y suspensión de inquilinos
docker exec pethijos-backend npm run test:ratelimit   # Límite de inicios de sesión y lista blanca de CORS
docker exec pethijos-backend npm run test:users       # Usuarios por guardería y nombres por inquilino
docker exec pethijos-backend npm run test:offboarding # Exportación y eliminación de una guardería

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
