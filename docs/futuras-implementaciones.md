# Futuras Implementaciones y Roadmap Tecnológico

## Estado Actual: Base Modular Consolidada

Con la reestructuración hacia una **Arquitectura Modular (Modular Monolith)**, los dos pilares operativos primarios se encuentran plenamente funcionales y verificados:

- ✅ **Módulo de Guardería**: Salas con cálculo de ocupación y cupos en tiempo real, validación estricta contra sobrecupo, check-in/out, planes recurrentes con scheduler automático y transporte.
- ✅ **Módulo de Peluquería**: Catálogo de servicios con duraciones estimadas, citas por franja horaria, tablero kanban de estados de atención y cobro directo.
- ✅ **Módulo de Veterinaria (fases 1 a 3)**: Tercera unidad de negocio (`VETERINARY`) con su rol, agenda de consultas, sala de espera, historia clínica y cobro al cerrar; vacunas y preventivos con lote, recetas imprimibles y farmacia sobre el inventario con libro de controlados; hospitalización con hoja de tratamiento, cirugías con consentimiento firmado, laboratorio e imagen.
- ✅ **Core Compartido**: Tutores y perrhijos con historial médico, vacunas y fotos en Backblaze B2.
- ✅ **Finanzas Segregadas**: Cobros e ingresos independientes por unidad contable (`DAYCARE` y `GROOMING`).
- ✅ **Multi-Inquilino**: Cada guardería cliente es un inquilino con sus propios datos y usuarios.
  Un registro de otra guardería responde `404 Not Found` (no se confirma que exista) y un módulo no
  contratado, `403 Forbidden` con `code: "MODULE_DISABLED"`.
- ✅ **Contratación por Módulos**: Siete módulos vendibles sobre un núcleo común, aplicados en el
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

## Roadmap para Siguientes Fases

### Clínica Veterinaria: fases restantes
1. **Recordatorios e informes clínicos**: vacunas y controles por vencer, consultas por tipo y veterinario, ingresos por categoría y exportación al dar de baja una guardería.
2. **Archivos adjuntos**: subir el informe o la imagen de un resultado y el consentimiento firmado escaneado.

### Fase 1: Automatización y Recordatorios de Citas
1. **Notificaciones WhatsApp**:
   - Confirmación automática al agendar cita de peluquería o plan de guardería.
   - Recordatorio automático 24 horas y 2 horas antes de la cita.
   - Notificación al tutor cuando la mascota pasa al estado `LISTO` en peluquería.
2. **Alertas Sanitarias y Vacunas**:
   - Aviso visual en ficha de la mascota cuando una vacuna está por vencer o vencida.

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
