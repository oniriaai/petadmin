# Frontend — Aplicación Web Modular Pethijos & Kinderdog

Aplicación React 18 con Vite, TypeScript y Tailwind CSS diseñada para la operación diaria y modular de **Guardería (Kinderdog)** y **Peluquería (Pethijos)**.

---

## Requisitos

- Node.js 20+
- npm
- Backend disponible en `http://localhost:3001/api/v1`

---

## Nuevos Módulos y Páginas Especializadas

### 1. Módulo de Peluquería (`src/pages/peluqueria/AgendaPeluqueriaPage.tsx`)
Accesible en la ruta `/peluqueria` (exclusivo para `admin` y `pethijos`):
- **KPIs del Día**: Citas agendadas, perrhijos en salón/baño, listos para entrega, entregados y total facturado.
- **Tablero Kanban de Flujo de Atención**:
  - `Agendadas`: Citas con hora de inicio y duración estimada en minutos.
  - `En Salón`: Recepción de la mascota por el tutor.
  - `En Baño / Corte`: Proceso de estilismo activo.
  - `Listo para Entrega`: Mascota terminada en espera de retiro.
  - `Entregadas / Cobradas`: Cierre y confirmación de cobro.
- **Modal de Agendamiento Ágil**:
  - Búsqueda en vivo de clientes.
  - Selección de mascota(s).
  - Selector de servicio con duración (minutos) y tarifa base automática.
  - Fecha y hora con cálculo automático de horario de fin.
  - Anticipo opcional con medio de pago.
- **Modal de Cobro Directo**: Registro de ingreso contable independiente a nombre de **Pethijos**.

### 2. Módulo de Guardería (`src/pages/guarderia/ControlGuarderiaPage.tsx`)
Accesible en la ruta `/guarderia` (exclusivo para `admin` y `kinderdog`):
- **Semáforo de Cupos en Vivo por Salas**:
  - Tarjetas visuales por cada sala física con capacidad total, perrhijos presentes y cupos disponibles.
  - Barra de progreso porcentual coloreada (verde si hay disponibilidad, amarillo si supera el 75%, rojo si está llena).
  - Lista de perrhijos en estancia con foto, nombre, raza, tutor y hora de ingreso.
  - Bloqueo de entrada automático cuando la sala alcanza su capacidad máxima.
- **Lista de Asistencia Diaria**:
  - Monitoreo de todas las mascotas con check-in activo.
  - Botón de Check-out rápido con opción de registro de cobro independiente a nombre de **Kinderdog**.
- **Rutas de Transporte**:
  - Segmentación de *Recogidas* y *Entregas* del día con hora, tutor, teléfono y dirección.

---

## Navegación Contextual (`src/components/layout/Sidebar.tsx`)

La composición de rutas y navegación vive en `src/modules/registry.tsx`. Cada
`FrontendModule` declara sus rutas, roles, unidad de negocio y elementos de navegación;
`App.tsx` y `Sidebar.tsx` consumen el mismo registro para evitar que una ruta protegida
quede visible o autorizada con reglas distintas.

Los contratos compartidos de autenticación, unidades de negocio, clientes y mascotas
viven en `src/modules/shared/contracts.ts`; los clientes de API pueden reexportarlos,
pero las nuevas APIs deben importar los contratos desde ese módulo compartido.

Las operaciones compartidas de Clientes y Mascotas se exponen mediante
`src/modules/shared/api.ts`. Los módulos de negocio deben consumir ese contrato
(`clientsApi` / `petsApi`) en lugar de construir URLs de esos dominios directamente.

Consulta [docs/adding-a-module.md](../docs/adding-a-module.md) para el checklist
completo de incorporación de módulos.

El Sidebar organiza la navegación en dominios claros, evitando la sobrecarga de pestañas planas:

1. **Dashboard Principal (`/`)**: Resumen del día y accesos directos.
2. **Sección Guardería (🐶)**:
   - Control Guardería (`/guarderia`)
   - Salas & Cupos (`/salas`)
   - Planes Recurrentes (`/planes`)
   - Transporte (`/transporte`)
   - Disponibilidad (`/disponibilidad`)
3. **Sección Peluquería (✂️)**:
   - Agenda de Peluquería (`/peluqueria`)
4. **Gestión Transversal (💼)**:
   - Clientes (`/clientes`), Perrhijos (`/animales`), Operaciones (`/operaciones`), Finanzas (`/transacciones`), Informes (`/informes`), Herramientas (`/herramientas`), Configuración (`/configuracion`), Guía (`/guia`).

### Reglas de Visualización según Rol
- **Rol `kinderdog`**: Solo visualiza la sección de Guardería y la Gestión Transversal. Las rutas de peluquería están ocultas y protegidas.
- **Rol `pethijos`**: Solo visualiza la sección de Peluquería y la Gestión Transversal. Las rutas de guardería están ocultas y protegidas.
- **Rol `admin`**: Dispone de un selector de workspace en la cabecera del Sidebar para filtrar la vista en:
  - *Consolidado (Ambos)*
  - *Kinderdog (Guardería)*
  - *Pethijos (Peluquería)*

---

## Clientes API Modulares (`src/lib/api.ts`)

Se exportan clientes tipados para consumir los nuevos endpoints:

```typescript
// Peluquería
import { peluqueriaApi } from "./lib/api";

const services = await peluqueriaApi.getServices();
const appointments = await peluqueriaApi.getAppointments({ date: "2026-09-22" });
await peluqueriaApi.createAppointment({ ... });
await peluqueriaApi.updateStatus(id, { status: "LISTO" });
await peluqueriaApi.completeAndCollect(id, { paymentMethod: "EFECTIVO", amount: 25 });

// Guardería
import { guarderiaApi } from "./lib/api";

const occupancy = await guarderiaApi.getOccupancy();
const attendance = await guarderiaApi.getTodayAttendance();
await guarderiaApi.checkIn({ clientId, petId, roomId });
await guarderiaApi.checkOut({ checkInOutId, createIncome: true, amount: 20 });
const transport = await guarderiaApi.getTransport();
```

---

## Scripts Disponibles

```bash
npm run dev                  # Servidor de desarrollo Vite (puerto 5173 o 5174 en Docker)
npm run build                # Compilación estática TypeScript + Vite
npm run preview              # Vista previa del build generado
npm run test                 # Pruebas con Vitest (route-guards.test.tsx)
```
