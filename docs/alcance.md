# Alcance del Sistema Modular Pethijos & Kinderdog

El sistema se estructura como un **Modular Monolith** enfocado en la operación de dos unidades de negocio con flujos especializados, soportadas por un núcleo de datos maestros compartidos.

---

## 1. Módulo Core Compartido (Datos Maestros Unificados)

- ✅ **Clientes / Tutores (CRUD completo)**: Cédula, teléfono, WhatsApp, email, dirección, notas y estado activo.
- ✅ **Mascotas / Perrhijos (CRUD completo)**: Nombre, especie, raza, sexo, fecha de nacimiento, microchip, notas médicas, alergias, foto y estado.
- ✅ **Almacenamiento de Imágenes y Documentos**: Carga directa a Backblaze B2 mediante URLs presignadas sin sobrecargar la API.
- ✅ **Autenticación y Control de Acceso**: JWT con roles `admin`, `kinderdog` y `pethijos`, con aislamiento estricto por unidad de negocio.

---

## 2. Módulo de Guardería (Kinderdog)

Centrado en estancias físicas prolongadas (día completo o medio día) y ocupación de espacios:

- ✅ **Salas y Capacidad Física**: Nombre, tipo de sala y capacidad máxima de perrhijos.
- ✅ **Semáforo de Cupos en Vivo**: Monitoreo en tiempo real de cupos ocupados, cupos libres y porcentaje de saturación por sala.
- ✅ **Control de Asistencia (Check-In / Check-Out)**:
  - Check-in con validación estricta de cupo disponible en sala (bloqueo automático ante sobrecupo).
  - Check-out con registro de cobro contable independiente para `KINDERDOG`.
- ✅ **Planes Recurrentes de Guardería**: Suscripciones por días semanales (2, 3, 4, 5 días) con generación automática de estancias para los próximos 30 días mediante scheduler diario.
- ✅ **Rutas de Transporte**: Control de perrhijos con servicio de transporte, segmentado en ruta de recogida (mañana) y ruta de entrega (tarde).
- ✅ **Finanzas de Guardería**: Registro de ingresos, gastos y compras separados estrictamente de Peluquería.

---

## 3. Módulo de Peluquería (Pethijos)

Centrado en citas y turnos individuales por servicio de estética:

- ✅ **Catálogo de Servicios de Estética**: Servicios predefinidos (Baño básico, Corte higiénico, Peluquería integral de raza, Deslanado profundo, Corte de uñas spa, Baño medicado) con tiempos estimados de atención en minutos y tarifas base.
- ✅ **Agenda de Citas por Turnos**: Agendamiento ágil por fecha, servicio y duración estimada (`endTime = startTime + durationMinutes`), sin exigir salas de guardería.
- ✅ **Tablero Kanban de Flujo de Atención**:
  - `Agendadas`: Próximas citas del día.
  - `En Salón`: Mascota recepcionada en el local.
  - `En Baño / Corte`: Proceso activo de estética.
  - `Listo para Entrega`: Mascota lista esperando al tutor.
  - `Entregadas / Cobradas`: Confirmación de entrega.
- ✅ **Cobro Directo e Independiente**: Registro de ingreso contable acreditado exclusivamente a `PETHIJOS`. Admite anticipo al agendar y cobro del saldo al entregar.
- ✅ **Finanzas de Peluquería**: Registro de ingresos y gastos separados estrictamente de Kinderdog.

---

## 4. Módulo de Administración y Finanzas

- ✅ **Usuarios y Multi-Tenancy**: Control de roles y conmutación de contexto.
- ✅ **Dashboard Consolidado**: Resumen diario de ingresos totales (Kinderdog + Pethijos), ocupación promedio y flujo de perrhijos.
- ✅ **Gestión Contable Segregada**:
  - Dos cobros separados por unidad cuando una mascota recibe servicios de guardería y peluquería el mismo día.
  - Cuentas por pagar (`Payables`) y pagos parciales/totales categorizados por unidad.
- ✅ **Inventario**: Control de stock e insumos clasificado por unidad de negocio.
- ✅ **Exportación de Datos**: Reportes y exportación en formato tabular para integración con herramientas de analítica.
