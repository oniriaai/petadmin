# Pethijos - Sistema Administrativo (Inicio de Implementacion)

Proyecto creado en:
`C:/Users/pablo/OneDrive/Escritorio/Universidad/ONIRIA/Proyectos/pethijos`

## Estado actual

Este repositorio ya contiene el arranque tecnico ejecutado y funcional para continuar el MVP:

- Backend Node/TypeScript con API inicial (auth, health, dashboard, reservas).
- Frontend React/Vite con flujo base solicitado: Login -> seleccionar logo/unidad -> Dashboard.
- Infraestructura Docker Compose (postgres + backend + frontend).
- Documentacion de arquitectura y trazabilidad de requerimientos.

## Re-evaluacion profesional del requerimiento original

A partir del documento del cliente se consolidaron estas decisiones de interpretacion que afectan implementacion:

1. Inventario asociado a proveedores entra funcional en MVP (no solo diseno).
2. RRHH y permisos avanzados salen del MVP y pasan a fase posterior.
3. Acceso MVP: dos credenciales fijas separadas por negocio (Kinderdog y Pethijos).
4. Datos maestros compartidos (clientes/duenos, mascotas, proveedores, veterinarios).
5. Operacion y finanzas separadas por unidad de negocio.
6. Power BI en fase inicial por exportacion manual CSV/Excel.
7. Impuestos Ecuador configurables desde Configuracion.

## Arquitectura implementada en este arranque

## Backend

Ruta: [backend](backend)

- Runtime: Node 20
- Lenguaje: TypeScript
- API base: Express
- Endpoints iniciales:
  - `GET /api/v1/health`
  - `POST /api/v1/auth/login`
  - `GET /api/v1/dashboard/summary`
  - `GET /api/v1/reservations`

Credenciales semilla:

- Kinderdog: `kinderdog_admin / kinderdog123`
- Pethijos: `pethijos_admin / pethijos123`

## Frontend

Ruta: [frontend](frontend)

- Framework: React + Vite + TypeScript
- Flujo ya implementado:
  - Login
  - Seleccion de unidad (Kinderdog / Pethijos)
  - Dashboard con pestañas requeridas:
    - Nuevo
    - Control de Reservas
    - Perfil del Cliente
    - Animales
    - Disponibilidad
    - Transporte
    - Gestion Administrativa
    - Informes y Graficos
    - Herramientas
    - Configuracion
    - Guia de Uso

## Infraestructura

Ruta: [docker-compose.yml](docker-compose.yml)

Servicios definidos:

- PostgreSQL (`5433` host)
- Backend (`3001`)
- Frontend (`5174`)

Variables base en [ .env.example ](.env.example).

## Como ejecutar

### 1. Configuración de Variables de Entorno

> **IMPORTANTE**: El archivo `.env` contiene credenciales sensibles y **no** debe ser commiteado. 

Copia las variables de ejemplo y personaliza según tu entorno:

```bash
cp .env.example .env
```

Edita `.env` con tus credenciales locales (base de datos, B2, JWT, etc.).

**Para CI/CD y producción**: Configura las variables de entorno en tu plataforma de deployment (GitHub Actions, Docker secrets, etc.) sin comprometer `.env` en git.

### 2. Levantar todo con Docker

```bash
docker compose up --build
```

### 3. Acceder a la Aplicación

- Frontend: `http://localhost:5174`
- Backend health: `http://localhost:3001/api/v1/health`

## Configuración de Almacenamiento (Backblaze B2)

Para habilitar la subida de fotos de mascotas, es necesario configurar las siguientes variables en el archivo `.env`:

```env
B2_KEY_ID=tu_key_id
B2_APPLICATION_KEY=tu_application_key
B2_BUCKET_NAME=nombre_del_bucket
B2_ENDPOINT=s3.us-east-005.backblazeb2.com
B2_REGION=us-east-005
```

### Configuración de CORS en Backblaze B2

Para permitir la subida directa desde el navegador, debes configurar las reglas CORS en tu bucket de Backblaze. En el panel de B2, ve a **Bucket Settings** -> **CORS Rules** y agrega la siguiente configuración (JSON):

```json
[
  {
    "corsRuleName": "AllowDirectUpload",
    "allowedOrigins": [
      "http://localhost:5174",
      "https://tu-dominio-de-produccion.com"
    ],
    "allowedHeaders": [
      "content-type",
      "x-amz-content-sha256",
      "x-amz-date",
      "authorization",
      "x-amz-user-agent"
    ],
    "allowedOperations": [
      "s3_put",
      "s3_get",
      "s3_head"
    ],
    "exposeHeaders": [
      "ETag"
    ],
    "maxAgeSeconds": 3600
  }
]
```

*Nota: Asegúrate de que `allowedOrigins` incluya la URL exacta desde la que estás accediendo a la aplicación.*

## Validacion tecnica en Docker

Para validar compilacion y estado del sistema usar el flujo Docker Compose:

```bash
docker compose up --build -d postgres backend frontend
docker compose exec -T backend npm run build
docker compose exec -T frontend npm run build
curl http://localhost:3001/api/v1/health
docker compose down
```

## Diseño funcional implementado (primer bloque)

1. Flujo de acceso por unidad de negocio.
2. Navegacion primaria por pestañas segun requerimiento.
3. Dashboard inicial preparado para integrar:
   - Resumen del dia
   - Reservas de hoy
   - Entradas/salidas
   - Alertas
   - Indicadores rapidos

Detalle funcional ampliado en [docs/functional-design.md](docs/functional-design.md).

## Matriz de trazabilidad

La cobertura de requerimientos del cliente (original) esta en:
[docs/traceability-matrix.md](docs/traceability-matrix.md)

## Roadmap de implementacion siguiente (bloque 2)

1. Modelo de datos y persistencia real en PostgreSQL.
2. CRUD de clientes/mascotas/proveedores/veterinarios.
3. Reservas completas con entradas/salidas, planning y transporte.
4. Gestion administrativa (compras, gastos, pagos, ingresos) + inventario funcional.
5. Reportes y exportables CSV/Excel para Power BI.
6. Guia de uso interna completa dentro de la app.

Roadmap funcional completo y priorizado en [docs/futuras-implementaciones.md](docs/futuras-implementaciones.md).

## Nota importante

Este commit corresponde al inicio de implementacion real del proyecto solicitado y deja lista la base para acelerar los modulos de negocio en los siguientes bloques.
