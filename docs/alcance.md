# Alcance del Sistema Modular

El sistema se estructura como un **Modular Monolith** multi-inquilino. Cada guardería cliente es un
inquilino independiente que opera hasta dos unidades de negocio —`DAYCARE` ("Guardería") y
`GROOMING` ("Peluquería")— sobre un núcleo de datos maestros compartidos, y accede únicamente a los
módulos de producto que contrató.

---

## 0. Inquilinos y Módulos Contratados

- ✅ **Aislamiento por guardería**: toda fila operativa pertenece a un inquilino. Pedir un registro
  de otra guardería responde **404** (no se confirma que exista), no 403.
- ✅ **Módulos de producto**: lo que se vende y se activa por cliente —`reservas`, `guarderia`,
  `peluqueria`, `finanzas`, `inventario`, `informes`, `cumplimiento`— sobre un `nucleo` que toda
  guardería recibe. Un módulo no contratado responde **403** con `code: "MODULE_DISABLED"`.
- ✅ **Cumplimiento en la API, no solo en la interfaz**: el control vive en el registro de módulos
  (`requireAuth → requireModuleAccess → router`), así que ocultar una pantalla nunca es suficiente
  ni necesario para que el módulo quede cerrado.
- ✅ **Integridad contable independiente de la contratación**: los cobros que genera cerrar una
  estancia o una cita se registran siempre, aunque `finanzas` esté deshabilitado; lo que se
  restringe es el acceso a la API y a la interfaz financiera.
- ✅ **Consola de plataforma**: alta de guarderías con sus unidades y módulos, provisión de usuarios,
  activación de módulos y auditoría. Exclusiva del proveedor (`superadmin`).

---

## 1. Módulo Core Compartido (Datos Maestros Unificados)

- ✅ **Clientes / Tutores (CRUD completo)**: Cédula, teléfono, WhatsApp, email, dirección, notas y estado activo.
- ✅ **Mascotas / Perrhijos (CRUD completo)**: Nombre, especie, raza, sexo, fecha de nacimiento, microchip, notas médicas, alergias, foto y estado.
- ✅ **Almacenamiento de Imágenes y Documentos**: Carga directa a Backblaze B2 mediante URLs presignadas sin sobrecargar la API.
- ✅ **Autenticación y Control de Acceso**: JWT con roles `admin`, `daycare` y `grooming` dentro de
  cada guardería, más el rol `superadmin` del proveedor, que no pertenece a ninguna guardería y que
  ninguna puede asignar. El aislamiento es estricto por **inquilino y por unidad de negocio**.

---

## 2. Módulo de Guardería

Centrado en estancias físicas prolongadas (día completo o medio día) y ocupación de espacios:

- ✅ **Salas y Capacidad Física**: Nombre, tipo de sala y capacidad máxima de perrhijos.
- ✅ **Semáforo de Cupos en Vivo**: Monitoreo en tiempo real de cupos ocupados, cupos libres y porcentaje de saturación por sala.
- ✅ **Control de Asistencia (Check-In / Check-Out)**:
  - Check-in con validación estricta de cupo disponible en sala (bloqueo automático ante sobrecupo).
  - Check-out con registro de cobro contable independiente para `DAYCARE`.
- ✅ **Planes Recurrentes de Guardería**: Suscripciones por días semanales (2, 3, 4, 5 días) con generación automática de estancias para los próximos 30 días mediante scheduler diario.
- ✅ **Rutas de Transporte**: Control de perrhijos con servicio de transporte, segmentado en ruta de recogida (mañana) y ruta de entrega (tarde).
- ✅ **Finanzas de Guardería**: Registro de ingresos, gastos y compras separados estrictamente de Peluquería.

---

## 3. Módulo de Peluquería

Centrado en citas y turnos individuales por servicio de estética:

- ✅ **Catálogo de Servicios de Estética**: Servicios predefinidos (Baño básico, Corte higiénico, Peluquería integral de raza, Deslanado profundo, Corte de uñas spa, Baño medicado) con tiempos estimados de atención en minutos y tarifas base.
- ✅ **Agenda de Citas por Turnos**: Agendamiento ágil por fecha, servicio y duración estimada (`endTime = startTime + durationMinutes`), sin exigir salas de guardería.
- ✅ **Tablero Kanban de Flujo de Atención**:
  - `Agendadas`: Próximas citas del día.
  - `En Salón`: Mascota recepcionada en el local.
  - `En Baño / Corte`: Proceso activo de estética.
  - `Listo para Entrega`: Mascota lista esperando al tutor.
  - `Entregadas / Cobradas`: Confirmación de entrega.
- ✅ **Cobro Directo e Independiente**: Registro de ingreso contable acreditado exclusivamente a `GROOMING`. Admite anticipo al agendar y cobro del saldo al entregar.
- ✅ **Finanzas de Peluquería**: Registro de ingresos y gastos separados estrictamente de Guardería.

### Veterinaria (`VETERINARY`, módulo `veterinaria`) — fases 1 y 2 de 4

- ✅ **Agenda de Consultas**: Por día y veterinario, con sala. Un veterinario o una sala no se reservan dos veces; una urgencia se registra igual.
- ✅ **Sala de Espera**: `Programadas` → `Sala de espera` (ordenada por prioridad) → `En consulta` → `Cerradas`, más cancelaciones y ausencias.
- ✅ **Registro Clínico**: Motivo, anamnesis, examen físico, valoración, plan y próximo control; signos vitales y diagnósticos presuntivos o definitivos.
- ✅ **Historia Clínica por Paciente**: Consultas, evolución del peso, vacunas, alergias, condiciones crónicas y fallecimiento. Imprimible.
- ✅ **Catálogo de la Clínica**: Servicios con precio y duración propios de cada clínica, y veterinarios de planta o externos.
- ✅ **Cobro al Cerrar**: Cargos del catálogo o libres, descuento, IVA de la unidad, cobro parcial y abonos posteriores, acreditados a `VETERINARY`.
- ✅ **Vacunas y Preventivos**: Vacunas con lote, laboratorio y refuerzo; desparasitaciones con próxima dosis, aplicadas en consulta o transcritas.
- ✅ **Recetas**: Varios medicamentos con dosis, frecuencia, duración e indicaciones. Imprimible con paciente, tutor y matrícula del prescriptor.
- ✅ **Farmacia**: Cola de recetas por dispensar, entrega que descuenta el inventario de la unidad (y puede cobrarse en la consulta abierta), libro de medicamentos controlados imprimible y lotes por caducar.
- ⏳ **Pendiente**: hospitalización, cirugía, laboratorio e imagen, consentimientos (fase 3); recordatorios e informes clínicos (fase 4).

---

## 4. Módulo de Administración y Finanzas

- ✅ **Usuarios y Multi-Inquilino**: Control de roles, conmutación de unidad de negocio y pertenencia
  a una única guardería. El proveedor puede fijar un inquilino con la cabecera `X-Daycare-Id`; al
  hacerlo, el workspace muestra un aviso permanente de "modo plataforma".
- ✅ **Dashboard Consolidado**: Resumen diario de ingresos totales de la guardería (ambas unidades),
  ocupación promedio y flujo de perrhijos.
- ✅ **Gestión Contable Segregada**:
  - Dos cobros separados por unidad cuando una mascota recibe servicios de guardería y peluquería el mismo día.
  - Cuentas por pagar (`Payables`) y pagos parciales/totales categorizados por unidad.
- ✅ **Inventario**: Control de stock e insumos clasificado por unidad de negocio.
- ✅ **Exportación de Datos**: Reportes y exportación en formato tabular para integración con herramientas de analítica.
