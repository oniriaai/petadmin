# Pethijos Admin

Sistema administrativo para operar dos unidades de negocio relacionadas:

- `Kinderdog`: guarderia y operaciones diarias.
- `Pethijos`: peluqueria y servicios complementarios.

El repositorio contiene una aplicacion web React, una API Express con Prisma y PostgreSQL, y la infraestructura minima para levantar el entorno local con Docker Compose.

## Vista General

### Stack
- `frontend/`: React 18, Vite, TypeScript, Tailwind CSS.
- `backend/`: Node.js 20, Express, TypeScript, Prisma ORM.
- `postgres`: base de datos PostgreSQL 16.
- `pgadmin`: consola opcional para inspeccionar la base de datos.
- Backblaze B2: almacenamiento S3-compatible para archivos e imagenes.

### Arquitectura
- El frontend consume la API bajo `/api/v1`.
- El backend expone autenticacion, operaciones, clientes, mascotas, reservas, finanzas, inventario, reportes y almacenamiento.
- PostgreSQL persiste los datos de negocio.
- Backblaze B2 se usa para carga directa de archivos mediante URLs firmadas generadas por el backend.

## Inicio Rapido

### 1. Preparar variables de entorno

Desde la raiz del proyecto:

```bash
cp .env.example .env
```

Revisa al menos estos valores:

- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `BACKEND_PORT`, `FRONTEND_PORT`
- `JWT_SECRET`
- `VAT_PERCENT`
- `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT`, `B2_REGION`

Nota: el `DATABASE_URL` de `.env.example` usa el host `postgres` porque esta pensado para el entorno Docker.

### 2. Levantar todo el stack

```bash
docker compose up --build
```

Que hace el entorno:

- crea PostgreSQL y pgAdmin
- instala dependencias del backend y frontend dentro de los contenedores
- genera el cliente de Prisma
- ejecuta `prisma db push`
- corre el seed inicial del backend

### 3. Acceder a los servicios

- Frontend: `http://localhost:5174`
- Backend health check: `http://localhost:3001/api/v1/health`
- pgAdmin: `http://localhost:5050`

Credenciales por defecto de pgAdmin:

- usuario: `admin@pethijos.com`
- clave: `admin123`

## Credenciales Iniciales

El seed actual crea dos usuarios administrativos:

- `kinderdog_admin` / `kinderdog123`
- `pethijos_admin` / `pethijos123`

Si la base ya contiene usuarios, el seed no vuelve a insertar datos.

## Estructura Del Proyecto

- [backend/README.md](backend/README.md): API, scripts, variables de entorno y dominios del backend.
- [frontend/README.md](frontend/README.md): estructura de la aplicacion web, configuracion y modulos de interfaz.
- [docs/functional-design.md](docs/functional-design.md): diseno funcional y reglas de negocio de referencia.

Estructura base:

```text
.
├── backend/
├── frontend/
├── docs/
├── docker-compose.yml
└── .env.example
```

## Desarrollo Sin Docker

Docker es el camino recomendado para onboarding porque ya resuelve la base, el seed y los puertos. Si necesitas correr partes del sistema fuera de contenedores:

- Backend: revisa [backend/README.md](backend/README.md)
- Frontend: revisa [frontend/README.md](frontend/README.md)

En ese flujo tendras que crear variables de entorno locales por paquete y ajustar el `DATABASE_URL` para usar `localhost:5433` en lugar de `postgres`.
