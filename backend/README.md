# Backend Pethijos

API inicial del sistema administrativo.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`

## Endpoints iniciales

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `GET /api/v1/dashboard/summary`
- `GET /api/v1/reservations`
- `POST /api/v1/storage/upload-url`: Genera URLs firmadas para subida directa a B2.

## Almacenamiento

El backend integra el AWS SDK para interactuar con Backblaze B2 (compatible con S3). No almacena archivos localmente, sino que facilita la subida directa desde el cliente mediante `Presigned URLs`.

## Notas
Este backend es el punto de partida para evolucionar a arquitectura modular completa con persistencia PostgreSQL y reglas de negocio por unidad de negocio.
