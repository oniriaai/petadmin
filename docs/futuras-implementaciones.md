# Futuras Implementaciones y Roadmap Tecnológico

## Estado Actual: Base Modular Consolidada

Con la reestructuración hacia una **Arquitectura Modular (Modular Monolith)**, los tres pilares operativos se encuentran funcionales y cubiertos por pruebas automáticas:

- ✅ **Módulo de Guardería**: Salas con cálculo de ocupación y cupos en tiempo real, validación estricta contra sobrecupo, check-in/out, planes recurrentes con scheduler automático y transporte.
- ✅ **Módulo de Peluquería**: Catálogo de servicios con duraciones estimadas, citas por franja horaria, tablero kanban de estados de atención y cobro directo.
- ✅ **Módulo de Veterinaria**: Tercera unidad de negocio (`VETERINARY`) con su rol, agenda de consultas, sala de espera, historia clínica y cobro al cerrar; vacunas y preventivos con lote, recetas imprimibles y farmacia sobre el inventario con libro de controlados; hospitalización con hoja de tratamiento, cirugías con consentimiento firmado, laboratorio e imagen; recordatorios calculados, informe clínico y exportación de la historia clínica.
- ✅ **Core Compartido**: Tutores y perrhijos con historial médico, vacunas y fotos en Backblaze B2.
- ✅ **Finanzas Segregadas**: Cobros e ingresos independientes por unidad contable (`DAYCARE`, `GROOMING` y `VETERINARY`).
- ✅ **Multi-Inquilino**: Cada guardería cliente es un inquilino con sus propios datos y usuarios.
  Un registro de otra guardería responde `404 Not Found` (no se confirma que exista) y un módulo no
  contratado, `403 Forbidden` con `code: "MODULE_DISABLED"`.
- ✅ **Contratación por Módulos**: Ocho módulos vendibles sobre un núcleo común, aplicados en el
  registro de módulos del backend y reflejados en la navegación del frontend.
- ✅ **Consola de Plataforma**: Alta de guarderías, activación de módulos, provisión de usuarios y
  auditoría, con el rol `superadmin` que ninguna guardería puede asignar.

---

## Deuda Saldada

La deuda que quedaba tras el trabajo de plataforma está resuelta:

- **`ConfiguracionPage` ya no es una simulación**: lee y escribe `/settings`, con IVA y zona horaria
  por (guardería, unidad). El IVA configurado se aplica de verdad a reservas y citas nuevas, donde
  antes había un `15` escrito a mano en tres sitios. El selector de idioma se eliminó en vez de
  persistirse: la interfaz es solo en español y nada lo consumía.
- **`access.businessUnits` ya se aplica**: el gate rechaza un módulo que no sirve a la unidad
  acotada, con `code: "WRONG_BUSINESS_UNIT"`. Solo afecta a un rol que abarca ambas unidades; pedir
  ocupación de Guardería estando en Peluquería devolvía datos de Guardería e ignoraba la cabecera.
- **El planificador ya es idempotente**: comprueba la ocurrencia por su clave única antes de validar
  conflictos, porque la reserva que él mismo creó ayer solapa la franja de hoy. Una reejecución
  limpia informa `failed: 0` y las estadísticas incluyen un desglose de motivos.
- **`inventario` y `cumplimiento` ya tienen interfaz**: pantalla de inventario con aviso de stock
  mínimo y movimientos, y pestaña de contratos junto a la de alertas.

---

## Deuda Técnica Abierta: Clínica Veterinaria

Lo que el módulo `veterinaria` dejó sin resolver al cerrar sus cuatro fases. Nada de esto impide
operar una clínica; todo es algo que alguien encontrará tarde o temprano y conviene que lo
encuentre aquí primero.

### Funcionalidad incompleta

- **Archivos adjuntos sin terminar.** Existen las columnas `vet_lab_orders.resultFilePath`,
  `vet_consents.filePath` y `pet_documents.vetVisitId`, pero la API no acepta un archivo para un
  resultado ni para un consentimiento, y ninguna pantalla sube nada. `POST
  /veterinaria/visits/:id/documents` sí acepta un `filePath`, como texto libre: **no se valida
  contra el prefijo de almacenamiento del inquilino** y no tiene interfaz. Falta también
  `buildPetDocumentKey` en `core/storage/object-keys.ts`. Antes de exponer ese endpoint en una
  pantalla hay que resolver la clave en el servidor, como hacen las fotos.
- **Sin carnet de vacunación imprimible.** Las vacunas salen en la historia clínica impresa, con
  lote y refuerzo; el carnet aparte que preveía el plan no se hizo.
- **Los procedimientos no se cobran solos.** Una cirugía no genera cargo: el veterinario lo añade
  desde el catálogo. Olvidarlo es posible y nada lo avisa.
- **El consentimiento de anestesia no lo exige nada.** Solo `CIRUGIA` y `EUTANASIA` bloquean el
  inicio de un procedimiento, y el consentimiento debe estar en la misma consulta: uno firmado
  en una consulta previa no cuenta.
- **Los textos de consentimiento viven en el frontend** (`ConsultaInpatientPanels.tsx`). Son
  editables al redactar, pero una clínica no puede guardar sus propias plantillas.
- **Los recordatorios se envían a mano.** El enlace de WhatsApp usa el número tal como está
  guardado, solo dígitos: sin código de país puede abrir el chat equivocado o ninguno.
- **El rol `veterinary` no ve el informe clínico.** Es solo del `admin`; en una clínica donde el
  veterinario es también quien la administra, necesita un usuario `admin`.
- **La semilla no crea registros clínicos.** `pethijos` recibe la unidad, el usuario, las salas,
  un veterinario y el catálogo, pero ninguna consulta de ejemplo: las pantallas arrancan vacías.

### Modelo de datos

- **El stock no se lleva por lote.** `inventory_items` tiene un único nivel; el lote y la
  caducidad se anotan en cada entrada. Por eso la lista de caducidades es aproximada (muestra
  lotes recibidos de artículos que aún tienen stock, no qué lote queda en la estantería) y el
  lote del libro de controlados es el que se teclea al dispensar.
- **Sin historial de cambios en la historia clínica.** Corregir un resultado de laboratorio
  sobrescribe el anterior; una dosis firmada no se puede corregir ni anular; una consulta cerrada
  no admite adenda. La hora de una dosis administrada es el momento en que se registra: no se
  puede anotar después una dosis dada antes.
- **La estancia hospitalaria no es una reserva.** El aforo de la sala se calcula solo sobre
  `vet_hospitalizations`. La reserva de la consulta conserva su franja original, así que ni el
  calendario de Operaciones ni la pantalla de Salas muestran al paciente ingresado, y una reserva
  hecha por `/reservations` sobre esa misma sala no cuenta contra las jaulas.
- **Estados y tipos son texto libre en la base de datos**, sin `CHECK` ni enum, como en el resto
  del sistema. La validación está solo en los esquemas zod del módulo.

### Consistencia

- **El bloqueo del paciente fallecido no es uniforme.** Crear una reserva, una cita o una
  consulta responde `409`; el check-in responde `400`. `PUT /reservations/:id` no lo comprueba al
  cambiar las mascotas de una reserva existente. Un plan recurrente con una mascota fallecida
  falla en cada ejecución del planificador hasta que alguien lo edita o lo desactiva.
- **La hora es la del servidor, no la de la unidad.** La agenda "del día" y los días de estancia
  no usan la zona horaria configurada en `/settings`.
- **Veterinario y sala ocupados se comprueban antes de escribir, sin bloqueo.** Dos consultas
  creadas a la vez para el mismo veterinario pueden solaparse. El ingreso hospitalario sí bloquea
  la fila de la sala.
- **Farmacia no exige el módulo `inventario`, pero recibir stock sí.** Una clínica sin
  `inventario` puede dispensar y no tiene pantalla donde dar entrada a lo que dispensa.

### Rendimiento

- **`GET /veterinaria/reminders` no pagina.** Lee hasta dos años de vacunas y preventivos del
  inquilino en cada petición, los combina en memoria y devuelve como mucho 500. El Dashboard lo
  llama en cada carga.
- **El informe suma en memoria** todos los cargos de las consultas cerradas en el periodo.
  "Facturado" es antes de descuentos e IVA y "cobrado" son pagos reales: no se concilian entre sí.
- **La exportación carga toda la historia clínica en memoria** y no incluye signos vitales,
  indicaciones y dosis de hospitalización, cargos por consulta ni el lote de las vacunas.

### Pruebas y verificación

- **Ninguna pantalla de la clínica se ha recorrido en un navegador.** El frontend solo prueba que
  la navegación aparece y desaparece con el módulo; las trece pantallas no tienen pruebas propias.
- **`test:veterinaria` deja datos en `pethijos` en cada ejecución**: un tutor, sus pacientes (uno
  fallecido) y las consultas cerradas, que la API se niega a eliminar por diseño.
- **La concurrencia se prueba en serie.** El doble cierre, la doble dispensación y la doble firma
  de una dosis se verifican con dos peticiones consecutivas, no simultáneas.
- **Las pruebas nuevas añaden `any`**: el lint del backend pasó de 67 a 70 avisos.

### Código

- **`ConsultaPage.tsx` roza las mil líneas** y `veterinaria.router.ts` las quinientas, con un
  manejador casi idéntico por ruta.
- **Los tipos del frontend se mantienen a mano** (`pages/veterinaria/api.ts`) y los cuerpos de las
  peticiones son `Record<string, unknown>`: un cambio en un esquema zod del backend no rompe la
  compilación del frontend.
- **La impresión depende de `print:hidden`** repartido por las pantallas y en `AppShell`. No hay
  hoja de estilos de impresión: márgenes y saltos de página quedan a criterio del navegador.
- **`CLAUDE.md` no está versionado.** Recoge las tres unidades y el rol `veterinary`, pero solo en
  la copia local.

---

## Roadmap para Siguientes Fases

### Clínica Veterinaria: pendientes
1. **Archivos adjuntos**: subir el informe o la imagen de un resultado y el consentimiento firmado escaneado.
2. **Envío automático de recordatorios**: hoy la clínica los envía desde su propio WhatsApp con el mensaje ya redactado.
3. **Stock por lote**: para que caducidades y libro de controlados sean exactos.
4. **Carnet de vacunación imprimible** y plantillas de consentimiento propias de cada clínica.

El resto de limitaciones conocidas está en "Deuda Técnica Abierta", más arriba.

### Fase 1: Automatización y Recordatorios de Citas
1. **Notificaciones WhatsApp**:
   - Confirmación automática al agendar cita de peluquería o plan de guardería.
   - Recordatorio automático 24 horas y 2 horas antes de la cita.
   - Notificación al tutor cuando la mascota pasa al estado `LISTO` en peluquería.
2. **Alertas Sanitarias y Vacunas**:
   - Aviso visual en ficha de la mascota cuando una vacuna está por vencer o vencida. La clínica ya lo tiene en `/veterinaria/recordatorios`; falta en la ficha del núcleo, para guarderías sin el módulo `veterinaria`.

### Fase 2: Facturación Electrónica y Tributación (Ecuador)
1. **Emisión de Comprobantes Electrónicos**:
   - Integración con web services del SRI para facturación electrónica (Facturas, Retenciones y Notas de Crédito).
   - Firma electrónica con archivo `.p12`.
   - Generación de RIDE (PDF) y envío automático del XML al correo del tutor.
2. **Configuración Fiscal Multi-Unidad**:
   - Asignación de puntos de emisión y secuenciales diferenciados por guardería y por unidad de negocio.

### Fase 3: Analítica Avanzada y Business Intelligence
1. **Plantilla Oficial de Power BI**:
   - Modelo semántico optimizado con medidas DAX para CAC (Costo de Adquisición de Cliente), LTV (Lifetime Value del Perrhijo) y Churn de planes de guardería.
   - Conector directo o sincronización programada vía script de exportación.
2. **Previsiones de Ocupación e Ingresos**:
   - Proyección de ingresos recurrentes mensuales basados en suscripciones activas.
   - Estimación de demanda de turnos de peluquería según días de la semana y temporada.

### Fase 4: Portal del Tutor (PWA / Autoservicio)
1. **Acceso Web para Clientes**:
   - Visualización del carnet de vacunación digital del perrhijo.
   - Solicitud de turnos de peluquería según disponibilidad en vivo.
   - Seguimiento del estado de su mascota durante la estancia en guardería o sesión de estética (con fotos subidas por el personal).

### Fase 5: Contratos Digitales de Guardería
1. **Generación y Firma Digital**:
   - Plantilla de términos y condiciones para estancia de guardería.
   - Firma digital o manuscrita en pantalla (tablet) al contratar un plan recurrente.
   - Almacenamiento seguro del PDF firmado en Backblaze B2 vinculado al expediente del cliente.
