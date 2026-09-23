# Diseño Funcional Modular — Pethijos & Kinderdog

## 1. Objetivo Arquitectónico

Consolidar la operación administrativa y diaria de dos líneas de negocio complementarias mediante una **Arquitectura Modular (Modular Monolith)**:
- **Guardería (Kinderdog)**: Flujo de estancias, cupos por sala, planes semanales recurrentes y transporte.
- **Peluquería (Pethijos)**: Flujo de citas y turnos por duración estimada, catálogo de estética, tablero kanban de atención y cobro directo.
- **Core Compartido**: Registro unificado de clientes y mascotas, autenticación y almacenamiento.
- **Finanzas**: Segregación contable estricta con cobros independientes por unidad.

---

## 2. Flujos de Usuario Principales

### Flujo 1: Operación de Guardería (Kinderdog)
1. **Consulta de Ocupación**: El operador abre `/guarderia` y revisa el semáforo de cupos en tiempo real de cada sala (ej. Patio Principal, Sala Cachorros).
2. **Entrada (Check-In)**:
   - Selecciona tutor y mascota.
   - Elige sala de destino. Si la sala está al 100% de su capacidad física, el sistema bloquea el ingreso.
   - Confirma el check-in: la mascota pasa a estado de estancia activa y el cupo disponible se reduce automáticamente.
3. **Planes Recurrentes**: Las suscripciones semanales generan estancias automáticas con 30 días de anticipación sin requerir creación manual diaria.
4. **Transporte**: El operador consulta la pestaña de transporte para revisar las hojas de ruta (recogidas matutinas y entregas vespertinas) con direcciones y contactos.
5. **Salida (Check-Out) y Cobro**:
   - Al retirar a la mascota, el operador registra la salida.
   - Puede generar un cobro independiente acreditado a `KINDERDOG` con su respectivo medio de pago (efectivo, transferencia o tarjeta).

### Flujo 2: Operación de Peluquería (Pethijos)
1. **Agendamiento de Cita**: El operador abre `/peluqueria` y pulsa "Nueva Cita".
   - Selecciona cliente y mascota.
   - Elige el servicio del catálogo (ej. Baño + Corte Higiénico). El sistema asigna automáticamente la tarifa base ($20) y la duración estimada (60 min).
   - Define fecha y hora de inicio: el sistema calcula la hora estimada de finalización.
   - Opcionalmente registra un anticipo.
2. **Avance en Tablero Kanban**:
   - `Agendada` → Mascota esperada para el turno.
   - `En Salón` → Al llegar la mascota con el tutor.
   - `En Baño / Corte` → Al ingresar a la estación de trabajo.
   - `Listo para Entrega` → Al finalizar el corte/secado; se notifica al tutor.
3. **Entrega y Cobro**:
   - El operador pulsa "Entregar y Cobrar".
   - Registra el monto final o saldo pendiente acreditado a `PETHIJOS`.

### Flujo 3: Atención Combinada (Cross-Selling)
- Si una mascota asiste a guardería y el mismo día se le realiza un servicio de peluquería:
  - Se genera un check-in de estancia en Guardería (sala) y una cita en Peluquería (con su duración).
  - Al completar ambos servicios, el sistema emite **dos cobros contables independientes** (uno para Kinderdog y uno para Pethijos) garantizando la trazabilidad tributaria y contable de cada negocio.

---

## 3. Navegación en Interfaz de Usuario

El Sidebar implementa navegación contextual por dominios:

```text
├── Dashboard Principal (/)
├── 🐶 Módulo Guardería (visible para admin y kinderdog)
│   ├── Control Guardería (/guarderia)
│   ├── Salas & Cupos (/salas)
│   ├── Planes Recurrentes (/planes)
│   ├── Transporte (/transporte)
│   └── Disponibilidad (/disponibilidad)
├── ✂️ Módulo Peluquería (visible para admin y pethijos)
│   └── Agenda de Peluquería (/peluqueria)
└── 💼 Gestión Transversal (visible para todos los roles autorizados)
    ├── Clientes (/clientes)
    ├── Animales (/animales)
    ├── Operaciones (/operaciones)
    ├── Gestión Financiera (/transacciones)
    ├── Informes y Gráficos (/informes)
    ├── Herramientas (/herramientas)
    ├── Configuración (/configuracion) [admin]
    └── Guía de Uso (/guia)
```

---

## 4. Endpoints de la API Modular (`/api/v1`)

### Módulo Core
- `POST /auth/login`: Autenticación con JWT y normalización de roles.
- `GET, POST, PUT /clients`: Directorio unificado de tutores.
- `GET, POST, PUT /pets`: Registro único de perrhijos, vacunas y alertas.
- `POST, DELETE /storage`: Carga y eliminación presignada en Backblaze B2.

### Módulo Guardería
- `GET /guarderia/occupancy`: Ocupación en vivo y semáforo de cupos.
- `GET /guarderia/attendance/today`: Asistencia diaria programada y activa.
- `POST /guarderia/attendance/check-in`: Check-in con validación física de sala.
- `POST /guarderia/attendance/check-out`: Check-out con cobro opcional Kinderdog.
- `GET /guarderia/transport`: Rutas consolidadas de transporte.

### Módulo Peluquería
- `GET /peluqueria/services`: Catálogo de servicios y duraciones.
- `GET /peluqueria/appointments`: Listado de citas con filtros.
- `GET /peluqueria/appointments/:id`: Detalle de cita y pagos asociados.
- `POST /peluqueria/appointments`: Creación de cita por fecha y duración.
- `PATCH /peluqueria/appointments/:id/status`: Transición de estados en el kanban.
- `POST /peluqueria/appointments/:id/complete`: Cierre y cobro independiente Pethijos.

### Módulo Finanzas y Backoffice
- `GET, POST, PUT /incomes`: Ingresos categorizados por unidad contable.
- `GET, POST, PUT /payables`: Cuentas por pagar y gastos por unidad.
- `GET, POST /inventory`: Control de insumos y productos clasificados por local.
- `GET /dashboard/summary`: Resumen diario y métricas operativas.
- `GET /reports/*`: Informes consolidados y exportaciones a Excel.
