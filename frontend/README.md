# Frontend

Aplicacion React para la operacion diaria del sistema administrativo de Kinderdog y Pethijos. El frontend consume la API del backend, protege rutas con autenticacion y organiza la experiencia por modulos operativos.

## Requisitos

- Node.js 20+
- npm
- Backend disponible en local o via Docker

## Formas De Ejecutarlo

### Opcion recomendada: stack completo con Docker

Desde la raiz del repo:

```bash
cp .env.example .env
docker compose up --build
```

El servicio frontend queda disponible en `http://localhost:5174` y recibe `VITE_API_URL=http://localhost:3001/api/v1` desde `docker-compose.yml`.

### Opcion local: frontend fuera de Docker

1. Instala dependencias:

```bash
cd frontend
npm install
```

2. Crea `frontend/.env`:

```env
VITE_API_URL=http://localhost:3001/api/v1
```

3. Inicia el servidor de desarrollo:

```bash
npm run dev
```

Por defecto Vite expone la aplicacion en `http://localhost:5173`. Si quieres replicar el puerto de Docker, usa:

```bash
npm run dev -- --port 5174
```

## Scripts

- `npm run dev`: inicia Vite en modo desarrollo.
- `npm run build`: compila TypeScript y genera el build de produccion.
- `npm run preview`: sirve localmente el build generado.
- `npm run test`: ejecuta pruebas de frontend con Vitest.

## Configuracion

La variable clave del frontend es:

- `VITE_API_URL`: base URL de la API. Si no existe, el codigo usa `http://localhost:3001/api/v1`.

Notas:

- no hay archivo `frontend/.env.example` en este momento
- el frontend usa `fetch` mediante un wrapper en `src/lib/api.ts`
- el token JWT se guarda en `localStorage`
- para usuario `admin`, la unidad activa (`KINDERDOG`/`PETHIJOS`) se guarda en `localStorage` como `activeBusinessUnit`; si no existe, la vista es consolidada
- cuando hay unidad activa, el frontend envia `X-Business-Unit` al backend para filtrar alcance

## Estructura De La Aplicacion

Piezas principales:

- `src/App.tsx`: define router, `PrivateRoute`, `PublicOnlyRoute` y layout general con sidebar.
- `src/lib/auth-context.tsx`: estado de autenticacion, bootstrap de sesion y limpieza centralizada.
- `src/lib/api.ts`: wrapper HTTP, helpers de descarga, APIs de check-in/out y manejo global de `401`.
- `src/components/`: layout y componentes reutilizables.
- `src/pages/`: modulos funcionales de la aplicacion.

## Modulos Actuales

Rutas y pantallas principales detectadas en el router:

- `Login`
- `Dashboard`
- `Clientes`
- `Animales`
- `Operaciones`
- `Salas`
- `Planes`
- `Disponibilidad`
- `Transporte`
- `Transacciones`
- `Informes`
- `Herramientas`
- `Configuracion`
- `Guia`

Adicionalmente:

- algunas pantallas incluyen formularios y modales dentro del mismo modulo
- las rutas no implementadas caen en un placeholder de "Proximamente"

## Flujo Con El Backend

El frontend consume el backend principalmente bajo `/api/v1` para:

- autenticacion
- CRUD de clientes, mascotas, salas y reservas
- operaciones de check-in/check-out
- ingresos, cuentas por pagar e inventario
- reportes y exportaciones

El wrapper de `src/lib/api.ts`:

- agrega `Authorization: Bearer <token>` si existe sesion
- serializa JSON por defecto
- convierte errores HTTP en mensajes utilizables por la UI
- ante `401` dispara una limpieza de sesion y redireccion a `/login`

## Reglas De Guardas De Ruta

- `PrivateRoute`: bloquea rutas privadas cuando no hay sesion; redirige a `/login` con `state.from` para retorno post-login.
- `PublicOnlyRoute`: bloquea `/login` para usuarios ya autenticados y los redirige a su `from` o `/`.
- `Login`: despues de autenticarse, navega a `state.from` si existe; en caso contrario a `/`.

## Pruebas De Guardas

- Archivo: `src/test/route-guards.test.tsx`
- Cubre:
  - redireccion desde ruta privada a `/login` conservando `from`
  - redireccion de usuario autenticado fuera de `/login` hacia la ruta solicitada

## Carga De Imagenes

La UI incluye soporte para imagenes de mascotas y archivos relacionados. El flujo actual es:

1. el frontend pide una URL firmada al backend
2. sube el archivo directamente a Backblaze B2
3. guarda la URL resultante en la entidad correspondiente
4. puede solicitar la eliminacion de archivos anteriores cuando una imagen se reemplaza

Esto evita pasar binarios completos por la API principal.

## Observaciones De Desarrollo

- la aplicacion esta organizada por paginas, no por un framework full-stack
- el estado global visible en el repo se apoya en React Context y hooks
- el sistema visual usa Tailwind CSS
- el comportamiento de cada modulo depende de que el backend y la base esten inicializados con datos validos
