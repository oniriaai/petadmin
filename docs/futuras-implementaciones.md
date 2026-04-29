# Futuras Implementaciones para Cumplir 100% Requerimientos Cliente

## Objetivo

Este documento detalla el backlog de implementacion pendiente para alcanzar todos los requerimientos funcionales y operativos del cliente en Pethijos.

## Principios de entrega

1. Priorizacion por valor operativo diario.
2. Separacion por unidad de negocio: Kinderdog y Pethijos.
3. Datos maestros compartidos: clientes, mascotas, proveedores, veterinarios.
4. Finanzas y reportes segmentados por unidad de negocio.
5. Trazabilidad requisito -> modulo -> endpoint -> pantalla.

## Fase 1 - Persistencia y Base de Datos Analitica

1. Implementar modelo PostgreSQL completo con migraciones.
2. Crear entidades base:
   - business_units
   - users (solo owner inicial por unidad)
   - clients
   - pets
   - providers
   - veterinarians
   - rooms
   - reservations
   - expenses
   - purchases
   - payments
   - incomes
   - inventory_items
   - inventory_movements
3. Definir llaves y restricciones de integridad.
4. Agregar vistas para analitica diaria/mensual/anual.
5. Crear semillas iniciales de catalogos (servicios, medios de pago, estados, categorias).

## Fase 2 - Modulo Nuevo

1. Formularios completos para:
   - Reserva
   - Cliente
   - Entrada
   - Salida
   - Animal
   - Proveedor
   - Veterinario
   - Gasto
2. Regla de relacion:
   - Cliente puede tener 0..N animales.
   - Reserva se asocia a cliente y 1..N mascotas.
3. Alta rapida de cliente+mascota en un solo flujo.

## Fase 3 - Control de Reservas

1. Nueva reserva completa con:
   - Cliente
   - Mascotas
   - Habitacion
   - Forma de pago
   - Entrada/salida + transporte
   - Descuento
   - Adelantos
   - Concepto
   - Etiqueta
   - Notas
2. Calculo financiero reserva:
   - Antes de descuento
   - Base
   - IVA
   - Total
   - Pendiente
3. Acciones de salida:
   - Hacer salida
   - Salida y facturar
   - Salida y cobrar en tienda
4. Planning en calendario:
   - Vista dia/semana
   - Bloques por hora
   - Cliente, dueno y servicio
5. Planes recurrentes guarderia:
   - Definir dias por semana
   - Generar reservas por rango mensual

## Fase 4 - Perfil del Cliente y Animales

1. Portal de clientes con filtros y estado activo/inactivo.
2. Perfil del dueno con datos principales y de respaldo.
3. Historial de reservas por cliente y por mascota.
4. Portal animales con:
   - Raza
   - Color
   - Microchip
   - Variedad
   - Sexo
   - Estado
5. Ficha de salud mascota en formato hibrido:
   - Campos estructurados en tabla
   - Adjuntos PDF en expediente

## Fase 5 - Disponibilidad y Transporte

1. Ocupacion guarderia por horario.
2. Ocupacion peluqueria por horario/servicio.
3. Transporte:
   - Pestanas recogidas y entregas
   - Ordenamiento de primero a ultimo
   - Cupos por dia para vehiculo unico
   - Bandera requiere_transporte por reserva

## Fase 6 - Gestion Administrativa Completa

1. Proveedores (CRUD y estado).
2. Gastos administrativos (CRUD, factura, IVA, fechas y estado).
3. Compras:
   - Tipos (producto/servicio)
   - Categorias
   - Subtotal/IVA/Total
   - Documento de compra
   - Estado pendiente/parcial/pagada
4. Pagos:
   - Parciales y recurrentes
   - Forma de pago
   - Referencia
   - Usuario que registra
   - Observaciones
5. Conexion compras-gastos-pagos:
   - Compra/Gasto = documento por pagar
   - Pago = aplicacion parcial o total
   - Saldo = total - pagos aplicados
6. Ingresos:
   - Con reserva
   - Sin reserva (caja/tienda/otros)

## Fase 7 - Inventario (MVP Completo)

1. Catalogo de insumos y productos.
2. Entradas por compras.
3. Salidas por consumo/ajuste.
4. Stock actual por item.
5. Kardex basico de movimientos.
6. Alertas por stock minimo.

## Fase 8 - Informes y Graficos

1. Dashboard del dia:
   - Reservas de hoy
   - Entradas y salidas
   - Alertas
   - Ocupacion
   - Ingresos del dia
2. Reportes administrativos:
   - Compras por periodo/proveedor/categoria
   - Compras pendientes
   - Pagos realizados/pendientes/por proveedor/forma
   - Gastos administrativos
   - Compras vs pagos
   - Resumen mensual administrativo
3. Informes financieros:
   - Ingresos por periodo/servicio/cliente/reserva
   - Gastos por categoria/proveedor/fijo-variable
   - Resultado financiero
   - Facturacion (cobrado, pendiente, pagado, impagado)
4. KPIs:
   - Ticket promedio
   - Ingreso promedio por cliente
   - Ingreso promedio por reserva
   - Costo promedio por servicio
   - Costo operativo diario
   - Punto de equilibrio
   - Crecimiento de ingresos
   - Variacion mensual/anual
5. Rentabilidad:
   - Clientes rentables
   - Servicios y productos rentables

## Fase 9 - Importar y Exportar (Excel y Power BI)

1. Importacion clientes desde Excel/CSV.
2. Exportacion clientes, mascotas, reservas, compras, pagos, ingresos, gastos.
3. Exportacion consolidada mensual para carga manual en Power BI.
4. Diccionario de datos para BI.
5. Plantilla Power BI inicial con medidas base.

## Fase 10 - Herramientas

1. Estimador de planes mensuales.
2. Estimador de ventas.
3. Tareas operativas (paseos, comandos, juegos, limpieza).
4. Avisos y alertas conductuales/salud con criticidad (alta/media/baja).
5. Registro de progreso, socializacion y estado emocional.

## Fase 11 - Documentacion y Contratos

1. Modulo documentos:
   - Ficha completa
   - Historial de salud
   - Consentimientos
   - Evaluacion inicial
   - Reportes y seguimientos
   - Incidentes
   - Historial de servicio
   - Descargables PDF
2. Modulo contratos:
   - Lista y estados (pendiente/activo/vencido)
   - Asociacion perrhijo/tutor
   - Fechas inicio/fin
   - Adjuntos y terminos firmados

## Fase 12 - Configuracion

1. Parametros fiscales Ecuador configurables (IVA y reglas).
2. Idioma preferido.
3. Recordatorios por dia/entrada/salida.
4. Recordatorios vacunas/revisiones/servicios recurrentes.
5. Aviso de ocupacion completa.
6. Integraciones futuras WhatsApp e internas.

## Fase 13 - Fase Posterior (no MVP)

1. RRHH completo:
   - Empleados
   - Contratos
   - Estado laboral
2. Control de accesos avanzado:
   - Usuarios
   - Roles
   - Permisos granulares
3. Firma digital de contratos.

## Riesgos y mitigaciones

1. Ambiguedad en contratos y flujo legal.
   - Mitigacion: workshop de reglas con cliente antes de build legal.
2. Complejidad en recurrencias de guarderia.
   - Mitigacion: motor de recurrencia simple semanal con pruebas de calendario.
3. Calidad de datos para BI.
   - Mitigacion: validaciones y catalogos normalizados desde fase 1.

## Criterios de finalizacion del proyecto

1. Todas las pestañas requeridas operativas.
2. Flujos criticos completos: nueva reserva, entrada, salida, cobro.
3. Gestion administrativa completa con conciliacion de saldos.
4. Inventario funcional en produccion.
5. Reportes y KPIs visibles y exportables.
6. Importar/exportar Excel y plantilla Power BI usable.
7. Guia de uso in-app y documentacion tecnica final entregadas.
