# Backend

API Express para la operacion administrativa de Kinderdog y Pethijos. El backend concentra autenticacion, reglas de negocio, acceso a PostgreSQL via Prisma y generacion de URLs firmadas para Backblaze B2.

## Requisitos

- Node.js 20+
- npm
- PostgreSQL
- Docker y Docker Compose para el flujo recomendado

## Formas De Ejecutarlo

### Opcion recomendada: desde la raiz con Docker

Desde la raiz del repo:

```bash
cp .env.example .env
docker compose up --build
```

En este modo el backend:

- usa `BACKEND_PORT` desde la raiz
- se conecta a PostgreSQL con el host `postgres`
- ejecuta `prisma generate`, `prisma db push` y el seed al iniciar el contenedor

### Opcion local: backend fuera de Docker

1. Levanta solo la base de datos:

```bash
docker compose up -d postgres
```

2. Instala dependencias:

```bash
cd backend
npm install
```

3. Crea `backend/.env` con las variables necesarias. Si partes del archivo raiz, cambia el host de `DATABASE_URL` a `localhost:5433`.

Ejemplo minimo:

```env
DATABASE_URL=postgresql://pethijos:pethijos123@localhost:5433/pethijos
BACKEND_PORT=3001
JWT_SECRET=change_me
VAT_PERCENT=15
B2_KEY_ID=tu_key_id
B2_APPLICATION_KEY=tu_application_key
B2_BUCKET_NAME=nombre_del_bucket
B2_ENDPOINT=s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
```

4. Genera Prisma y prepara la base:

```bash
npm run db:generate
npm run db:setup
```

5. Inicia el servidor:

```bash
npm run dev
```

## Scripts

- `npm run dev`: inicia `tsx watch src/main.ts`.
- `npm run build`: compila TypeScript a `dist/`.
- `npm run start`: ejecuta el build compilado.
- `npm run db:generate`: genera el cliente de Prisma.
- `npm run db:push`: aplica el esquema a la base sin migraciones versionadas.
- `npm run db:seed`: ejecuta `prisma/seed.ts`.
- `npm run db:setup`: corre `db push` y luego seed.
- `npm run seed:photos:upload`: carga fotos de mascotas del seed a B2 una sola vez (omite claves ya existentes).
- `npm run seed:photos:replace`: recarga fotos del seed sobre las mismas claves canonicas (sin duplicar keys).
- `npm run test:financial`: suite E2E del modulo financiero.
- `npm run test:checkin`: suite E2E del flujo de check-in/check-out.

## Variables De Entorno

Variables usadas directamente por el backend:

- `DATABASE_URL`: conexion PostgreSQL para Prisma.
- `BACKEND_PORT`: puerto HTTP del servicio. Por defecto `3001`.
- `JWT_SECRET`: firma y verificacion de tokens JWT.
- `VAT_PERCENT`: porcentaje por defecto para calculos tributarios.
- `B2_KEY_ID`
- `B2_APPLICATION_KEY`
- `B2_BUCKET_NAME`
- `B2_ENDPOINT`
- `B2_REGION`

Notas importantes:

- En Docker, `DATABASE_URL` apunta a `postgres:5432`.
- Fuera de Docker, normalmente debe apuntar a `localhost:5433`.
- Si faltan variables de B2, el backend arranca, pero las cargas de archivos pueden fallar.

## Estructura Tecnica

### Entrada principal

- `src/main.ts` configura CORS, JSON, health check, rutas y middleware global de errores.
- El health check vive en `GET /api/v1/health` y valida tambien conectividad a la base de datos con `SELECT 1`.

### Rutas montadas

Rutas activas bajo `/api/v1`:

- `auth`: login y emision de JWT.
- `dashboard`: resumenes y metricas principales.
- `clients`, `pets`: gestion de clientes y mascotas.
- `storage`: URLs firmadas y eliminacion de archivos en B2.
- `reservations`, `recurring-plans`, `check-in-out`: operaciones diarias, reservas y planes recurrentes.
- `rooms`: salas, capacidad y disponibilidad operativa.
- `providers`, `payables`, `incomes`: proveedores, cuentas por pagar e ingresos.
- `inventory`: items y movimientos de inventario.
- `reports`, `export`: consultas y exportaciones.
- `alerts`, `contracts`: alertas operativas y contratos.

### Multirol y alcance por unidad

- Roles normalizados: `admin`, `kinderdog`, `pethijos`.
- Usuarios `kinderdog` y `pethijos` operan solo sobre su unidad.
- `admin` tiene vista consolidada por defecto (ambas unidades) y puede acotar por unidad enviando `X-Business-Unit: KINDERDOG|PETHIJOS` (o `?businessUnit=`).
- En operaciones de escritura para `admin`, debe existir una unidad objetivo (header/query o `businessUnit` en body).

## Dominios De Negocio

El esquema de Prisma modela principalmente:

- usuarios con `businessUnit` y `role`
- clientes y mascotas
- documentos, vacunas y alertas de mascotas
- salas
- reservas y planes recurrentes
- check-in/check-out
- ingresos
- proveedores, cuentas por pagar y pagos
- inventario y movimientos
- contratos

Patrones actuales relevantes:

- varios modelos usan `isActive` para soft delete
- los ingresos pueden quedar asociados a una reserva
- los planes recurrentes generan soporte para operacion repetitiva por dias

## Planes Recurrentes Y Reservas

Implementacion actual (backend):

- existe un scheduler en `src/main.ts` que inicia al levantar el servicio
- el scheduler ejecuta una generacion de reservas al iniciar y luego cada 24 horas
- se generan reservas para los proximos 30 dias para planes activos segun `daysOfWeek`
- cada reserva generada queda vinculada al plan via `Reservation.recurringPlanId`
- al crear esas reservas se crean tambien registros `check_in_out` vinculados por mascota
- el sistema evita duplicados de ocurrencias con una restriccion unica en `reservations` sobre `(recurringPlanId, checkIn)`

Sincronizacion y desactivacion:

- al editar un plan recurrente se sincronizan solo reservas futuras con estado `PENDIENTE` vinculadas a ese plan
- al desactivar (`PATCH /recurring-plans/:id/status` con `isActive=false`) o eliminar (`DELETE /recurring-plans/:id`) un plan:
  - se cancelan reservas futuras `PENDIENTE` vinculadas (`status = CANCELADA`)
  - se marcan sus `check_in_out` vinculados como inactivos (`isActive = false`)

## Seed Y Datos Iniciales

`prisma/seed.ts` crea datos base solo si la tabla `users` esta vacia:

- usuarios admin global, Kinderdog y Pethijos
- salas iniciales
- proveedor base
- clientes y mascotas de ejemplo
- reservas de ejemplo
- una cuenta por pagar
- inventario inicial

Credenciales creadas por defecto:

- `admin_global` / `admin123`
- `kinderdog_admin` / `kinderdog123`
- `pethijos_admin` / `pethijos123`

Fotos de mascotas en seed:

- El mapeo vive en `prisma/seed-pet-photos.json` y asigna 1 URL publica de B2 por mascota.
- Las imagenes se suben con `seed:photos:upload` usando claves canonicas `pets/seed/<pet>.jpg`.
- El script nunca crea claves con timestamp, por lo que re-ejecutarlo no genera duplicados en el bucket.
- `prisma/seed.ts` falla si falta el mapeo de alguna mascota esperada.

## Flujo De Archivos E Imagenes

El backend no sube archivos grandes directamente a B2 desde el navegador. El flujo actual es:

1. el frontend solicita una URL firmada a `storage`
2. el cliente sube el archivo directamente a Backblaze B2
3. el backend persiste o reutiliza la URL publica
4. cuando corresponde, el frontend pide al backend eliminar archivos previos

Esto reduce carga en la API y centraliza credenciales de almacenamiento en el servidor.

## Pruebas

Las pruebas E2E disponibles viven en `backend/tests/` y asumen:

- backend corriendo en `http://localhost:3001`
- base inicializada con seed
- credenciales administrativas disponibles

Consulta `backend/tests/README.md` si necesitas detalles del flujo de pruebas.
