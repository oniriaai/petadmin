# Futuras Implementaciones y Roadmap Tecnológico

## Estado Actual: Base Modular Consolidada

Con la reestructuración hacia una **Arquitectura Modular (Modular Monolith)**, los dos pilares operativos primarios se encuentran plenamente funcionales y verificados:

- ✅ **Módulo de Guardería**: Salas con cálculo de ocupación y cupos en tiempo real, validación estricta contra sobrecupo, check-in/out, planes recurrentes con scheduler automático y transporte.
- ✅ **Módulo de Peluquería**: Catálogo de servicios con duraciones estimadas, citas por franja horaria, tablero kanban de estados de atención y cobro directo.
- ✅ **Core Compartido**: Tutores y perrhijos con historial médico, vacunas y fotos en Backblaze B2.
- ✅ **Finanzas Segregadas**: Cobros e ingresos independientes por unidad contable (`KINDERDOG` y `PETHIJOS`).
- ✅ **Aislamiento Multi-Tenancy**: Control de roles estricto con `403 Forbidden` entre dominios no autorizados.

---

## Roadmap para Siguientes Fases

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
   - Asignación de puntos de emisión y secuenciales diferenciados para Kinderdog y Pethijos.

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
