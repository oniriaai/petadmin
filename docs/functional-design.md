# Diseño Funcional Modular

## 1. Objetivo Arquitectónico

Consolidar la operación administrativa y diaria de tres líneas de negocio complementarias mediante una **Arquitectura Modular (Modular Monolith)**:
- **Guardería** (`DAYCARE`): Flujo de estancias, cupos por sala, planes semanales recurrentes y transporte.
- **Peluquería** (`GROOMING`): Flujo de citas y turnos por duración estimada, catálogo de estética, tablero kanban de atención y cobro directo.
- **Veterinaria** (`VETERINARY`): Agenda de consultas por veterinario y sala, sala de espera con prioridad, historia clínica, farmacia, hospitalización, laboratorio y cobro al cerrar.
- **Core Compartido**: Registro unificado de clientes y mascotas, autenticación y almacenamiento.
- **Finanzas**: Segregación contable estricta con cobros independientes por unidad.

---

## 2. Flujos de Usuario Principales

### Flujo 1: Operación de Guardería
1. **Consulta de Ocupación**: El operador abre `/guarderia` y revisa el semáforo de cupos en tiempo real de cada sala (ej. Patio Principal, Sala Cachorros).
2. **Entrada (Check-In)**:
   - Selecciona tutor y mascota.
   - Elige sala de destino. Si la sala está al 100% de su capacidad física, el sistema bloquea el ingreso.
   - Confirma el check-in: la mascota pasa a estado de estancia activa y el cupo disponible se reduce automáticamente.
3. **Planes Recurrentes**: Las suscripciones semanales generan estancias automáticas con 30 días de anticipación sin requerir creación manual diaria.
4. **Transporte**: El operador consulta la pestaña de transporte para revisar las hojas de ruta (recogidas matutinas y entregas vespertinas) con direcciones y contactos.
5. **Salida (Check-Out) y Cobro**:
   - Al retirar a la mascota, el operador registra la salida.
   - Puede generar un cobro independiente acreditado a `DAYCARE` con su respectivo medio de pago (efectivo, transferencia o tarjeta).

### Flujo 2: Operación de Peluquería
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
   - Registra el monto final o saldo pendiente acreditado a `GROOMING`.

### Flujo 3: Atención Combinada (Cross-Selling)
- Si una mascota asiste a guardería y el mismo día se le realiza un servicio de peluquería:
  - Se genera un check-in de estancia en Guardería (sala) y una cita en Peluquería (con su duración).
  - Al completar ambos servicios, el sistema emite **dos cobros contables independientes** (uno para `DAYCARE` y uno para `GROOMING`) garantizando la trazabilidad tributaria y contable de cada negocio.

### Flujo 4: Consulta Veterinaria
1. **Recepción**: El operador abre `/veterinaria` y crea la consulta. Con hora queda `Programada`; sin hora entra a la `Sala de espera`, ordenada por prioridad. Una urgencia se registra aunque el veterinario o la sala estén ocupados.
2. **Atención**: En `/veterinaria/consultas/:id` el veterinario registra signos vitales, anamnesis, examen, valoración, plan y diagnósticos. Desde ahí aplica vacunas y preventivos, emite recetas, solicita exámenes, programa procedimientos y redacta consentimientos.
3. **Farmacia**: Cada línea recetada se entrega una sola vez desde `/veterinaria/farmacia`, descuenta el stock de la unidad y puede añadirse como cargo mientras la consulta siga abierta.
4. **Cierre y Cobro**: Los cargos se suman, se aplica descuento e IVA de la unidad y se registra el cobro acreditado a `VETERINARY`. La consulta queda congelada; el saldo se abona después.

### Flujo 5: Hospitalización y Cirugía
1. **Ingreso**: Desde la consulta se ingresa al paciente a una sala de tipo hospitalización con cupo. La consulta **permanece abierta** mientras dure el ingreso.
2. **Hoja de Tratamiento**: En `/veterinaria/hospitalizacion` se indican tratamientos con su intervalo. Cada dosis se firma una sola vez, como administrada u omitida con motivo; la siguiente se calcula desde la última firmada.
3. **Cirugía**: Un procedimiento de tipo cirugía o eutanasia no inicia sin un consentimiento firmado del mismo tipo en esa consulta. Finalizar una eutanasia registra el fallecimiento, y el paciente deja de admitir reservas en cualquier unidad.
4. **Alta**: Exige resumen, suspende las indicaciones y añade a la consulta los días de estancia por la tarifa diaria. Después la consulta se cierra y se cobra.

### Flujo 6: Seguimiento
- `/veterinaria/laboratorio` recibe los resultados, incluso con la consulta ya cerrada.
- `/veterinaria/recordatorios` lista refuerzos, preventivos, controles y exámenes pendientes, calculados al momento, con un enlace de WhatsApp al tutor. Con el módulo `recordatorios`, cada fila se envía por el sistema.
- `/veterinaria/informe` (solo administradores) resume consultas, facturación, diagnósticos y hospitalización de un periodo.

### Flujo 7: Recordatorios a tutores (módulo `recordatorios`)
1. **Configuración**: El administrador elige por unidad los canales, el canal por defecto, los días de aviso y el contacto del negocio, y decide si se envía automáticamente.
2. **Preferencia del tutor**: En su ficha se elige WhatsApp, correo o no recibir recordatorios; sin elección vale el canal de la unidad.
3. **Envío automático**: Cada hora, en horario diurno de la unidad, salen las citas del día siguiente y las vacunas, preventivos y controles dentro de los días de aviso. Nada se envía dos veces.
4. **Envío a mano**: En `/avisos` se ve cada recordatorio con el mensaje ya redactado y se envía o reenvía por el canal que se elija. Lo vencido y los exámenes pendientes solo salen así.
5. **Registro**: La pestaña Enviados muestra cada envío, fallo u omisión con su motivo.

---

## 3. Navegación en Interfaz de Usuario

El Sidebar implementa navegación contextual por dominios:

Cada entrada se filtra por **rol**, por **unidad activa** y por el **módulo de producto
contratado**. Entre corchetes, el módulo que debe estar habilitado; sin corchetes, pertenece al
núcleo y está siempre disponible.

```text
├── Inicio (/)
├── 🐶 Módulo Guardería (roles admin y daycare)
│   ├── Control de guardería (/guarderia)   [guarderia]
│   ├── Salas y cupos (/salas)              [reservas]
│   ├── Planes recurrentes (/planes)        [reservas]
│   ├── Transporte (/transporte)            [guarderia + informes]
│   └── Disponibilidad (/disponibilidad)    [reservas]
├── ✂️ Módulo Peluquería (roles admin y grooming)
│   └── Agenda de peluquería (/peluqueria)  [peluqueria]
├── 🩺 Módulo Veterinaria (roles admin y veterinary)
│   ├── Agenda veterinaria (/veterinaria)             [veterinaria + reservas]
│   ├── Consulta (/veterinaria/consultas/:id)         [veterinaria]
│   ├── Historias clínicas (/veterinaria/pacientes)   [veterinaria]
│   ├── Farmacia (/veterinaria/farmacia)              [veterinaria]
│   ├── Receta imprimible (/veterinaria/recetas/:id)  [veterinaria]
│   ├── Hospitalización (/veterinaria/hospitalizacion) [veterinaria]
│   ├── Hoja de alta (/veterinaria/hospitalizacion/:id) [veterinaria]
│   ├── Laboratorio (/veterinaria/laboratorio)        [veterinaria]
│   ├── Consentimiento (/veterinaria/consentimientos/:id) [veterinaria]
│   ├── Recordatorios (/veterinaria/recordatorios)    [veterinaria]
│   ├── Informe clínico (/veterinaria/informe)        [veterinaria] (solo admin)
│   └── Catálogo clínico (/veterinaria/catalogo)      [veterinaria] (solo admin)
└── 💼 Gestión (todos los roles autorizados)
    ├── Operaciones (/operaciones)          [reservas]
    ├── Clientes (/clientes)
    ├── Animales (/animales)
    ├── Finanzas (/transacciones)           [finanzas]
    ├── Avisos a tutores (/avisos)          [recordatorios]
    ├── Alertas (/herramientas)             [cumplimiento]
    ├── Configuración (/configuracion)      [admin]
    └── Guía de uso (/guia)
```

`Salas`, `Planes` y `Disponibilidad` dependen de `reservas` y no de `guarderia`: salas, asistencia y
planes recurrentes son primitivos compartidos que las reservas de peluquería también usan.
`Transporte` necesita además `informes` porque la página lee `/reports/transport`.

`Informes` no tiene página propia: es la pestaña **Resumen** de `Finanzas`, que lee
`/reports/finance`, y el botón **Excel** de sus pestañas Ingresos y Egresos. Una guardería con
`finanzas` y sin `informes` ve el libro de ingresos y egresos, sin resumen ni exportación.

La consola del proveedor vive fuera de este árbol, en `/platform`, con su propia navegación
(Resumen, Guarderías, Auditoría) y carga diferida.

---

## 4. Endpoints de la API Modular (`/api/v1`)

### Módulo Núcleo
- `POST /auth/login`: Autenticación con JWT, normalización de roles y validación de inquilino.
- `GET /auth/me`: Sesión según el servidor, con la guardería y los módulos habilitados.
- `GET, POST, PUT /clients`: Directorio unificado de tutores de la guardería.
- `GET, POST, PUT /pets`: Registro único de mascotas, vacunas y alertas.
- `POST /storage/upload-url`, `POST /storage/remove`: Carga presignada y eliminación en Backblaze
  B2. El borrado se autoriza contra la base de datos y acotado a la guardería que llama: una
  guardería no puede referenciar ni borrar un archivo bajo el prefijo de otra.

### Consola de Plataforma (solo `superadmin`)
- `GET /platform/overview`, `GET /platform/daycares`, `POST /platform/daycares`.
- `GET, PATCH /platform/daycares/:id`: Detalle y edición del inquilino.
- `GET, PUT /platform/daycares/:id/modules`: Matriz de módulos contratados.
- `POST, PATCH /platform/daycares/:id/users`: Provisión y mantenimiento de usuarios.
- `GET /platform/audit`: Registro de auditoría de la consola.

### Módulo Guardería
- `GET /guarderia/occupancy`: Ocupación en vivo y semáforo de cupos.
- `GET /guarderia/attendance/today`: Asistencia diaria programada y activa.
- `POST /guarderia/attendance/check-in`: Check-in con validación física de sala.
- `POST /guarderia/attendance/check-out`: Check-out con cobro opcional para `DAYCARE`.
- `GET /guarderia/transport`: Rutas consolidadas de transporte.

### Módulo Peluquería
- `GET /peluqueria/services`: Catálogo de servicios y duraciones.
- `GET /peluqueria/appointments`: Listado de citas con filtros.
- `GET /peluqueria/appointments/:id`: Detalle de cita y pagos asociados.
- `POST /peluqueria/appointments`: Creación de cita por fecha y duración.
- `PATCH /peluqueria/appointments/:id/status`: Transición de estados en el kanban.
- `POST /peluqueria/appointments/:id/complete`: Cierre y cobro independiente para `GROOMING`.

### Módulo Veterinaria
- `GET, POST, PUT, DELETE /veterinaria/services`, `/veterinaria/staff`: Catálogo con precio y personal (escritura solo `admin`).
- `GET, POST /veterinaria/visits`: Agenda y alta de consulta (reserva `VETERINARY` + registro clínico).
- `PATCH /veterinaria/visits/:id`, `/status`: Registro clínico y estado en el flujo.
- `POST /veterinaria/visits/:id/vitals | diagnoses | charges`: Signos vitales, diagnósticos y cargos.
- `POST /veterinaria/visits/:id/close`, `/payments`: Cierre con cobro independiente para `VETERINARY` y abonos.
- `GET /veterinaria/patients/:petId/history`: Historia clínica del paciente.
- `POST /veterinaria/visits/:id/vaccinations | preventives | prescriptions`: Vacunas, preventivos y recetas.
- `POST /veterinaria/prescription-items/:itemId/dispense`: Dispensación con descuento de stock.
- `GET /veterinaria/pharmacy/queue | controlled-log | expiring | items`: Mostrador de farmacia.
- `POST /veterinaria/visits/:id/hospitalizations`, `/hospitalizations/:id/discharge`: Ingreso y alta con cobro de la estancia.
- `POST /veterinaria/hospitalizations/:id/orders | vitals`, `/treatment-orders/:orderId/doses`: Hoja de tratamiento.
- `POST /veterinaria/visits/:id/procedures | lab-orders | consents`: Procedimientos, exámenes y consentimientos.
- `POST /veterinaria/procedures/:id/start | finish`, `/lab-orders/:id/result`, `/consents/:id/sign`: Su ciclo de vida.
- `GET /veterinaria/reminders`, `/reports/summary`: Recordatorios calculados e informe del periodo.

### Módulo Recordatorios
- `GET /reminders/due`: Lo que hay que recordar en la unidad, con canal y mensaje.
- `POST /reminders/send`: Envío a mano de un recordatorio, eligiendo canal.
- `GET /reminders/log`, `/reminders/channels`: Registro de envíos y canales disponibles.
- `PUT /settings/:businessUnit` (`reminders`), `PUT /clients/:id` (`reminderChannel`): Configuración de la unidad y preferencia del tutor.

### Módulo Finanzas y Backoffice
- `GET, POST, PUT /incomes`: Ingresos categorizados por unidad contable. La lista se filtra por
  `from`, `to`, `q`, `type`, `paymentMethod` y `status`; `/incomes/summary` da los totales de
  esos mismos filtros.
- `GET, POST, PUT /payables`: Cuentas por pagar y gastos por unidad. Filtros: `from`, `to`, `q`,
  `type`, `category`, `providerId` y `status` (`VENCIDO` es un documento sin pagar con la fecha
  de vencimiento pasada); `/payables/summary` da los totales. Un egreso se fecha por su factura
  y, si no tiene, por el día en que se registró.
- `GET /reports/finance`: Las cifras del resumen para un periodo (`from`, `to`; el mes en curso
  por defecto) y el anterior: ingresos, gastos, utilidad, IVA, serie mensual, desgloses y
  cuentas por pagar.
- `GET, POST /inventory`: Control de insumos y productos clasificados por local.
- `GET /dashboard/summary`: Resumen diario y métricas operativas.
- `GET /reports/*`: Informes consolidados y exportaciones a Excel.
