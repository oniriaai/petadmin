# Frontend — Aplicación Web Modular

Aplicación React 18 con Vite, TypeScript y Tailwind CSS para la operación diaria de **Guardería** y
**Peluquería**, más la **consola de plataforma** del proveedor.

---

## Requisitos

- Node.js 20+
- npm
- Backend disponible en `http://localhost:3001/api/v1`

---

## Sesión y módulos contratados

La sesión es **autoritativa desde el servidor**. `src/lib/auth-context.tsx` llama a `GET /auth/me`
al montar y después de iniciar sesión, y expone:

```ts
const { user, daycare, enabledModules, units, fullAccess,
        hasModule, hasModules, pinnedDaycareId, setPinnedDaycare } = useAuth();
```

`localStorage` es solo una **caché de render**: el usuario guardado pinta el primer fotograma para
que recargar no se sienta como un arranque en frío, y `/auth/me` lo corrige acto seguido. Un módulo
desactivado en la consola llega al navegador **sin volver a iniciar sesión**: `src/lib/api.ts`
detecta `code: "MODULE_DISABLED"` y vuelve a leer la sesión, de modo que la navegación y los guards
se ponen al día en lugar de dejar una ruta muerta en pantalla.

`src/lib/api.ts` conserva el estado HTTP y el `code` del servidor en un `ApiError`
(`status`, `code`, `details`). Antes colapsaba cualquier respuesta no-2xx en `new Error(message)`,
lo que hacía imposible distinguir un 404 de un 403 y dejaba `MODULE_DISABLED` fuera de alcance.

Cabeceras que envía automáticamente: `Authorization`, `X-Business-Unit` (unidad activa) y
`X-Daycare-Id` (inquilino fijado por un superadmin). `downloadFile` también las envía; sin la
segunda, una exportación del proveedor saldría del alcance equivocado.

---

## Gating de módulos

La composición de rutas y navegación vive en `src/modules/registry.tsx`. Cada `ModuleRoute` y cada
`ModuleNavigationItem` declara `requires?: ProductModuleId[]`, con semántica **Y**: hacen falta
todos.

Los cuatro ids de módulo del frontend (`dashboard`, `guarderia`, `peluqueria`, `shared`) son
agrupaciones de presentación y **no** se corresponden con los módulos de producto, por eso la
contratación se declara por ruta. Cada valor es el módulo dueño de una API que la página llama de
verdad:

| Ruta | Requiere | Motivo |
|---|---|---|
| `/guarderia` | `guarderia` | |
| `/salas`, `/planes`, `/disponibilidad` | `reservas` | Salas y planes son primitivos compartidos |
| `/transporte` | `guarderia` + `informes` | La página lee `/reports/transport`, no `/guarderia/transport` |
| `/operaciones` | `reservas` | |
| `/peluqueria` | `peluqueria` | |
| `/transacciones` | `finanzas` | Sus cuatro pestañas pertenecen al mismo módulo |
| `/inventario` | `inventario` | |
| `/informes` | `informes` | |
| `/`, `/clientes`, `/animales`, `/herramientas`, `/configuracion`, `/guia` | — | Núcleo |

`validateFrontendModules()` rechaza un `requires` que no esté en el catálogo de
`src/modules/shared/contracts.ts`: los ids viven en dos bases de código y uno desconocido no
coincidiría con nada, ocultando la ruta para todo el mundo en silencio.

**Gating por pestaña**: `cumplimiento` no tiene ruta propia — sus dos pantallas son las pestañas
de Alertas y Contratos en `HerramientasPage`, así que se comprueba ahí; el estimador es una
calculadora local sin API y sigue disponible. Si el módulo se desactiva a mitad de sesión, la
pestaña abierta cede.

**Gating por unidad**: una ruta puede declarar `unit`. El backend rechaza un módulo que no sirve a
la unidad acotada, así que `/guarderia`, `/transporte` y `/peluqueria` lo declaran y el guard
explica el desajuste ofreciendo cambiar de unidad, en vez de montar una página que se llena de 403.

### Guards (`src/App.tsx`)

- `GuardedRoute` comprueba **rol y contratación**. Si bloquea, **explica** el motivo nombrando el
  módulo que falta en lugar de redirigir a `/`: un salto silencioso es indistinguible de un enlace
  roto. Un `superadmin` no queda limitado por la contratación, igual que en el backend.
- `enabledModules` está vacío hasta que responde el primer `/auth/me`, así que el guard espera a
  `isSessionLoading` en vez de anunciar "módulo no disponible" en cada carga de página.
- `SuperAdminRoute` protege `/platform/*`; un usuario de guardería vuelve a `/`, y un superadmin sin
  inquilino fijado que aterrice en el workspace va a `/platform`.
- `Sidebar.shouldShowItem` filtra por rol, unidad activa y contratación. Ya no trata a un usuario
  indefinido como administrador.

---

## Consola de plataforma

`src/pages/platform/`, montada en `/platform/*` con **carga diferida**. El límite `React.lazy` es un
requisito, no una optimización: empaquetada de forma normal, cada usuario de guardería recibiría el
código de la consola y con él un mapa completo de la API `/platform`. No es un agujero de
autorización —el backend es quien decide— pero no hay razón para repartirlo.

La consola se distingue con un bloque de tokens `[data-theme="platform"]` en `src/styles.css` que
reescribe las variables de `:root`. Las clases compartidas (`.btn`, `.card`, `.input`, `.table-*`)
se vuelven oscuras e índigo ahí **sin duplicar un solo componente**.

Pantallas: resumen, listado de guarderías, detalle (matriz de módulos, usuarios y auditoría), alta
de guardería y auditoría general.

"Operar como esta guardería" fija el inquilino y entra al workspace. El shell del inquilino muestra
entonces un banner **no descartable** (`PlatformBanner`): es lo único que distingue al proveedor
dentro del workspace de un cliente del administrador de ese cliente, así que no puede cerrarse.
Entrar a la consola libera el inquilino fijado, e iniciar sesión también, para que una sesión no
arrastre el pin a la siguiente.

---

## Módulos y páginas

### Guardería (`src/pages/guarderia/ControlGuarderiaPage.tsx`)
Ruta `/guarderia`, roles `admin` y `daycare`:
- Semáforo de cupos en vivo por sala, con barra de ocupación y bloqueo al alcanzar el aforo.
- Lista de asistencia diaria y check-out con cobro opcional a nombre de `DAYCARE`.
- Rutas de transporte del día (recogidas y entregas).

### Peluquería (`src/pages/peluqueria/AgendaPeluqueriaPage.tsx`)
Ruta `/peluqueria`, roles `admin` y `grooming`:
- KPIs del día y tablero kanban (`Agendadas` → `En Salón` → `En Baño/Corte` → `Listo` → `Entregadas`).
- Modal de agendamiento con búsqueda de clientes, selección de servicio, duración y anticipo.
- Cobro directo como ingreso contable de `GROOMING`.

### Navegación

El Sidebar agrupa en Guardería, Peluquería y Gestión Transversal. Un `admin` dispone de un selector
de workspace (Consolidado / Guardería / Peluquería); los roles `daycare` y `grooming` solo ven su
sección y la gestión transversal.

Los contratos compartidos viven en `src/modules/shared/contracts.ts` y las operaciones compartidas
de clientes y mascotas en `src/modules/shared/api.ts`. Consulta
[docs/adding-a-module.md](../docs/adding-a-module.md) para el checklist completo.

---

## Clientes API

```typescript
import { peluqueriaApi, guarderiaApi } from "./lib/api";
import { platformApi } from "./lib/platform-api";   // solo en el bundle de la consola

await peluqueriaApi.getAppointments({ date: "2026-09-22" });
await guarderiaApi.checkIn({ clientId, petId, roomId });
await platformApi.setModules(daycareId, [{ moduleId: "finanzas", isEnabled: true }]);
```

`platform-api.ts` se mantiene fuera de `lib/api.ts` para que solo entre en el bundle diferido.

---

## Scripts

```bash
npm run dev                  # Vite (5173, o 5174 en Docker)
npm run build                # tsc -b && vite build
npm run preview              # Vista previa del build
npm run test -- --run        # Vitest
```

Suites: `route-guards`, `module-gating` (gating de rutas y navegación, rutas del superadmin y
validación del registro), `app-shell` (topbar, cajón móvil, colapso, selector de unidad, menú de
usuario y banner de plataforma), `module-registry` y `shared-contracts`.

---

## Shell de la aplicación

`src/components/layout/AppShell.tsx` compone la navegación, la topbar y la página:

- **Topbar** con el nombre de la guardería, el selector de unidad y el menú de usuario. Antes no
  había cabecera alguna.
- **Sidebar colapsable** en escritorio (se reduce a iconos y recuerda la preferencia) y **cajón
  lateral** por debajo de `lg`. Antes era un `w-64` fijo sin clases responsivas, así que la
  aplicación no se podía usar por debajo de ~768px.
- El banner de modo plataforma vive dentro de la topbar fija, para que no se pueda dejar atrás al
  hacer scroll.

`PageHeader` sustituye el bloque de título/subtítulo/acciones que estaba copiado en 13 páginas;
ahora las acciones se envuelven bajo el título en pantallas estrechas en lugar de comprimirlo. Los
contenedores de página usan `p-4 sm:p-6`, las rejillas de 3 y 4 columnas se apilan, y las tablas
van dentro de un contenedor con scroll horizontal en vez de recortarse.

Los tokens de `src/styles.css` están expuestos a Tailwind (`bg-surface`, `text-muted`, `border-line`,
`bg-shell`…) como variables CSS, así que `[data-theme="platform"]` sigue retematizando la consola sin
duplicar clases.

## Configuración

`ConfiguracionPage` era una pantalla simulada; ahora lee y escribe `/settings`. Muestra los datos de
la guardería en solo lectura (los gestiona el proveedor) y, por cada unidad contratada, el IVA por
defecto y la zona horaria. El selector de idioma se **eliminó**: la interfaz es solo en español y
nada consumía ese valor, así que era un control que no hacía nada.
