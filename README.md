# Pethijos Admin — Sistema Modular para Guardería y Peluquería

Sistema administrativo modular (**Modular Monolith**) para la gestión operativa y financiera de dos unidades de negocio especializadas:

- 🐶 **Kinderdog (Módulo Guardería)**: control de salas con semáforo de cupos físicos en tiempo real, estancias diarias, check-in/check-out con validación de capacidad, planes recurrentes semanales y rutas de transporte.
- ✂️ **Pethijos (Módulo Peluquería)**: catálogo de servicios con duración estimada y tarifas base, agenda de citas por franja horaria, tablero kanban de flujo de atención (`Agendada` → `En Salón` → `En Baño/Corte` → `Listo` → `Entregada`) y cobro directo.
- 🐾 **Core Compartido**: datos maestros unificados de Clientes (Tutores) y Perrhijos (Mascotas con historial, vacunas y fotos en Backblaze B2), autenticación JWT y control de acceso multi-tenant.
- 💵 **Finanzas & Administración**: cobros e ingresos contables estrictamente segregados por unidad de negocio, cuentas por pagar, inventario por local y Dashboard Consolidado para la dirección.

---

## Vista General

### Stack Tecnológico
- `frontend/`: React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons.
- `backend/`: Node.js 20, Express, TypeScript, Prisma ORM.
- `postgres`: Base de datos relacional PostgreSQL 16.
- `pgadmin`: Consola opcional para inspección de base de datos.
- `Backblaze B2`: Almacenamiento compatible S3 para fotos y archivos mediante URLs presignadas.

### Arquitectura Modular
```text
.
├── backend/
│   ├── src/
│   │   ├── core/                  # Capacidades y contratos compartidos
│   │   ├── modules/               # Slices de negocio especializados
│   │   ├── platform/              # Bootstrap y registro de módulos
│   │   ├── routes/                # Routers existentes en proceso de migración
│   │   └── main.ts                # Bootstrap que compone el registro
│   └── tests/                     # Suites E2E: modular, financial, checkin
├── frontend/
│   └── src/
│       ├── modules/               # Contratos y registro de módulos
│       ├── pages/
│       │   ├── guarderia/         # ControlGuarderiaPage (Salas, Cupos, Transporte)
│       │   ├── peluqueria/        # AgendaPeluqueriaPage (Kanban de citas y cobro)
│       │   ├── clientes/          # Gestión unificada de tutores y perrhijos
│       │   └── transacciones/     # Finanzas e inventario por unidad
│       └── components/layout/     # Sidebar contextual por rol y unidad activa
└── docs/                          # Documentación funcional y matriz de trazabilidad
```

### Contrato para nuevos módulos

Cada módulo nuevo debe registrarse en los dos registros centrales:

1. Backend: implementar un `BackendModule` con `id`, `basePath`, `router` y descripción en `backend/src/platform/module-registry.ts`.
2. Frontend: implementar un `FrontendModule` con rutas, permisos, navegación y componentes en `frontend/src/modules/registry.tsx`.
3. Mantener la lógica interna privada al módulo; las integraciones entre dominios deben pasar por contratos públicos del `core`.
4. Añadir una prueba de flujo y una prueba de aislamiento/autorización para el módulo.

Los registros validan IDs y rutas duplicadas al iniciar o probar la aplicación, evitando que un módulo nuevo se conecte de forma parcial o sobrescriba otro.

La verificación backend se ejecuta con `cd backend && npm run test:architecture`; las suites
de negocio existentes siguen cubriendo los flujos E2E de Guardería, Peluquería, finanzas y check-in/out.

---

## Inicio Rápido con Docker

### 1. Variables de entorno
Desde la raíz del proyecto:
```bash
cp .env.example .env
```
Verifica que las credenciales de PostgreSQL, puertos y claves de B2 estén configuradas.

### 2. Levantar el stack completo
```bash
docker compose up --build
```

El contenedor del backend ejecuta automáticamente:
1. `prisma generate`
2. `prisma db push`
3. Seed inicial (`prisma/seed.ts`)
4. Servidor Express con scheduler de planes en puerto `3001`

### 3. URLs de acceso
- **Frontend Web**: [http://localhost:5174](http://localhost:5174)
- **Backend Health Check**: [http://localhost:3001/api/v1/health](http://localhost:3001/api/v1/health)
- **pgAdmin**: [http://localhost:5050](http://localhost:5050) (`admin@pethijos.com` / `admin123`)

---

## Credenciales de Acceso

El seed inicial provisiona usuarios para cada contexto operativo:

| Usuario | Contraseña | Rol | Contexto Operativo |
|---|---|---|---|
| `kinderdog_admin` | `kinderdog123` | `kinderdog` | Acceso directo al Módulo de Guardería y finanzas Kinderdog |
| `pethijos_admin` | `pethijos123` | `pethijos` | Acceso directo al Módulo de Peluquería y finanzas Pethijos |
| `admin_global` | `admin123` | `admin` | Acceso global consolidado con selector de workspace en Sidebar |

---

## Verificación y Pruebas Automatizadas

El proyecto incluye 3 suites E2E ejecutables dentro del contenedor Docker del backend:

```bash
# 1. Pruebas de dominios modulares (Peluquería, Guardería, permisos y cobros)
docker exec pethijos-backend npm run test:modular

# 2. Pruebas de transacciones financieras y cuentas por pagar
docker exec pethijos-backend npm run test:financial

# 3. Pruebas de check-in / check-out
docker exec pethijos-backend npm run test:checkin
```

Compilación del Frontend:
```bash
docker exec pethijos-frontend npm run build
```

---

## Documentación Detallada

- [backend/README.md](backend/README.md): Especificación técnica de la API, endpoints modulares y servicios.
- [frontend/README.md](frontend/README.md): Arquitectura de la aplicación React, navegación contextual y páginas modulares.
- [docs/alcance.md](docs/alcance.md): Alcance funcional por módulo y reglas de negocio.
- [docs/functional-design.md](docs/functional-design.md): Diseño de flujos operativos y mapa de experiencia.
- [docs/traceability-matrix.md](docs/traceability-matrix.md): Matriz de trazabilidad requisito -> componente -> endpoint.
- [docs/adding-a-module.md](docs/adding-a-module.md): Checklist para incorporar nuevos módulos.
- [docs/futuras-implementaciones.md](docs/futuras-implementaciones.md): Roadmap técnico y fases posteriores.
