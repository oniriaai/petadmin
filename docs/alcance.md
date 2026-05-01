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
