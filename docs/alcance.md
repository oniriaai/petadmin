Análisis del Alcance Real
Lo que REALMENTE necesitan (crítico para operar):
Módulo Compartido (Base de Datos Unificada)

✅ Clientes y Mascotas (CRUD completo)
✅ Sistema de etiquetas para categorizar animales
✅ Subida de imágenes (clientes + mascotas)

Kinderdog (Guardería)

✅ Planes de guardería (2,3,4,5 días/semana por N meses)
✅ Reservas con planes asignados
✅ Check-in/Check-out simple
✅ Capacidad física del local (habitaciones)
✅ Registro de ingresos
✅ Gastos y Compras (separados de Pethijos)
✅ Reportes financieros y estadísticos con gráficos
⚠️ Transporte (deseable pero no bloqueante)

Pethijos (Peluquería)

✅ Citas individuales (sin planes)
✅ Registro de ingresos
✅ Gastos y Compras (separados de Kinderdog)
✅ Reportes financieros y estadísticos con gráficos

Admin

✅ Usuarios y roles
✅ Dashboard consolidado (ambos negocios)
✅ Reportes comparativos Kinderdog vs Pethijos
❌ Contratos (opcional, post-MVP)
❌ Tareas y alertas (opcional)


Nueva Propuesta de Fases
FASE 1: MVP Funcional Completo (8-10 semanas)
Este ES el sistema operativo mínimo viable:
Core Compartido:

Clientes (CRUD: nombre, cédula, teléfono, email, dirección, WhatsApp, estado)
Mascotas (CRUD: nombre, especie, raza, sexo, fecha nacimiento, microchip, foto, estado)
Sistema de etiquetas (crear etiquetas, asignar N:M a mascotas)
Subida de imágenes (avatares clientes + fotos mascotas) → B2
Autenticación JWT con roles: admin, recepcion, guarderia, peluqueria

Kinderdog - Guardería:

Planes de guardería (tabla: nombre, días_semana [2,3,4,5], precio_mensual, activo)
Contratación de planes por cliente (tabla: cliente_id, plan_id, fecha_inicio, fecha_fin, meses_contratados, estado)
Reservas diarias (vinculadas a plan o sin plan, check-in/out, habitación asignada)
Habitaciones (nombre, capacidad física, ocupación actual)
Validación de capacidad al hacer reserva
Ingresos (registro manual: concepto, monto, fecha, forma_pago)
Gastos (categoría, monto, proveedor_nombre [texto simple], fecha)
Compras (descripción, cantidad, precio, proveedor_nombre, fecha)

Pethijos - Peluquería:

Citas individuales (cliente, mascota, fecha_hora, servicio, precio, estado)
Check-in/completado simple
Ingresos (registro manual)
Gastos (separados de Kinderdog)
Compras (separadas de Kinderdog)

Reportes (EL CORAZÓN DEL SISTEMA):

Dashboard Kinderdog:

Gráfico de ingresos vs gastos (últimos 6 meses, barras)
Indicador de ocupación promedio (%)
Tabla top 10 clientes por frecuencia
Flujo de animales (gráfico de línea: entradas por semana)


Dashboard Pethijos:

Gráfico de ingresos vs gastos (últimos 6 meses)
Citas completadas por mes (barras)
Servicios más solicitados (pie chart)


Dashboard Admin Consolidado:

Ingresos totales (Kinderdog + Pethijos) vs gastos totales
Rentabilidad por negocio (comparativa)
Flujo de caja mensual (línea temporal)
Exportar datos a Excel (tabla cruda, sin Polars aún)



Estimación real: 120-150 horas de desarrollo

FASE 2: Optimizaciones y Transporte (Post-MVP, 3-4 semanas)

Sistema de Transporte (recogidas/entregas, capacidad, vinculación con reservas)
Facturación formal con PDF (actualmente solo registros de ingresos simples)
Proveedores (tabla normalizada, no solo texto)
Mejoras en reportes (filtros avanzados, más gráficos)

Costo adicional: $450-550

FASE 3: Automatización y Contratos (Futuro)

Contratos digitales
Tareas y alertas automáticas
Recordatorios por WhatsApp/Email
Sistema de inventario


Alcance Detallado del MVP (Para Contrato)
Módulos Incluidos:
1. Gestión de Clientes y Mascotas

CRUD completo de clientes (datos personales, contacto, estado)
CRUD completo de mascotas (datos básicos, foto, microchip, etiquetas)
Sistema de etiquetas personalizables (N:M con mascotas)
Subida de imágenes (máx 5MB por archivo)
Búsqueda y filtros (por nombre, cédula, etiqueta, estado)

2. Kinderdog - Guardería

Catálogo de planes (2, 3, 4, 5 días/semana con precios)
Contratación de planes por cliente (duración en meses)
Reservas de guardería (vinculadas o no a plan contratado)
Gestión de habitaciones (capacidad, estado)
Check-in/Check-out con registro de hora
Validación automática de capacidad
Registro de ingresos (manual, con concepto y forma de pago)
Registro de gastos (categoría, monto, descripción, fecha)
Registro de compras (descripción, cantidad, precio unitario, total)

3. Pethijos - Peluquería

Agenda de citas (fecha/hora, cliente, mascota única)
Registro de servicios realizados
Check-in/completado
Registro de ingresos (separado de Kinderdog)
Registro de gastos (separado de Kinderdog)
Registro de compras (separado de Kinderdog)

4. Reportes y Estadísticas

Dashboard Kinderdog:

Gráfico de barras: Ingresos vs Gastos (últimos 6 meses)
Indicador numérico: Ocupación promedio mensual (%)
Gráfico de línea: Flujo de animales por semana
Tabla: Top 10 clientes por frecuencia de reservas


Dashboard Pethijos:

Gráfico de barras: Ingresos vs Gastos (últimos 6 meses)
Gráfico de barras: Citas completadas por mes
Gráfico circular: Distribución de servicios


Dashboard Admin (consolidado):

KPIs: Ingreso total, Gasto total, Margen (ambos negocios)
Gráfico comparativo: Kinderdog vs Pethijos (rentabilidad)
Gráfico de línea: Flujo de caja mensual
Exportación a Excel de datos tabulares



5. Administración

Gestión de usuarios (crear, editar, desactivar)
Asignación de roles (admin, recepcion, guarderia, peluqueria)
Autenticación con JWT (access + refresh token)
Control de acceso por rol

Límites Explícitos del MVP:
NO incluido en Fase 1:

❌ Sistema de Transporte (Fase 2)
❌ Facturación con PDF (solo registros de ingresos simples)
❌ Proveedores normalizados (se manejan como texto)
❌ Contratos digitales (Fase 3)
❌ Tareas y alertas automáticas (Fase 3)
❌ Notificaciones por email/WhatsApp (Fase 3)
❌ Inventario de productos (futuro)
❌ Pagos parciales (solo pagos completos)
❌ Certificados veterinarios (futuro)
❌ Datos médicos detallados (futuro)


Cronograma de Entrega
Duración total: 9-10 semanas
Semana 1-2: Setup e Infraestructura

Configuración de repositorios (Git)
Setup base de datos PostgreSQL
Configuración Backblaze B2
Esqueleto FastAPI + Next.js
Sistema de autenticación JWT
Entregable: Demo de login funcional

Semana 3-4: Core + Kinderdog Base

CRUD Clientes y Mascotas completo
Sistema de etiquetas
Subida de imágenes
Planes de guardería
Reservas básicas (sin check-in/out aún)
Entregable: Gestión de clientes/mascotas + crear reservas

Semana 5-6: Kinderdog Completo

Check-in/Check-out
Habitaciones y validación de capacidad
Ingresos, Gastos, Compras (Kinderdog)
Dashboard Kinderdog (sin gráficos aún)
Pago hito 2: $360 (30%)
Entregable: Kinderdog operativo

Semana 7-8: Pethijos

Citas de peluquería
Ingresos, Gastos, Compras (Pethijos)
Dashboard Pethijos (sin gráficos)
Entregable: Pethijos operativo

Semana 9-10: Reportes y Gráficos

Implementación de gráficos (Chart.js o Recharts)
Dashboard Admin consolidado
Exportación a Excel
Pruebas finales y ajustes
Pago hito 3: $360 (30%)
Entregable: Sistema completo con reportes gráficos
