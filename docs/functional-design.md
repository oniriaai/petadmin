# Diseno Funcional Implementado (Bloque Inicial)

## 1. Objetivo del bloque

Implementar la base ejecutable del sistema con el flujo principal exigido por cliente:
Login -> seleccionar unidad (Kinderdog/Pethijos) -> Dashboard con pestañas.

## 2. Flujo de usuario implementado

1. Usuario abre frontend.
2. Selecciona unidad de negocio (Kinderdog o Pethijos).
3. Ingresa usuario/contrasena.
4. Frontend llama `POST /api/v1/auth/login`.
5. Si autentica, carga dashboard segmentado por unidad.
6. Usuario navega por pestañas requeridas.

## 3. Pestañas implementadas en UI

1. Nuevo
2. Control de Reservas
3. Perfil del Cliente
4. Animales
5. Disponibilidad
6. Transporte
7. Gestion Administrativa
8. Informes y Graficos
9. Herramientas
10. Configuracion
11. Guia de Uso

En este bloque son contenedores funcionales de navegacion listos para implementar CRUDs y procesos completos.

## 4. Endpoints implementados en backend

1. `GET /api/v1/health`: disponibilidad de API.
2. `POST /api/v1/auth/login`: login por unidad de negocio con credenciales semilla.
3. `GET /api/v1/dashboard/summary`: payload inicial de dashboard diario.
4. `GET /api/v1/reservations`: listado inicial de reservas (actualmente vacio).

## 5. Reglas de negocio aplicadas en esta fase

1. Separacion de acceso por unidad de negocio desde login.
2. Restriccion de usuarios autogestionados (no hay alta de usuarios en MVP inicial).
3. Dashboard central como punto de entrada operativo.

## 6. Reglas confirmadas para siguientes bloques

1. Inventario funcional entra en MVP.
2. RRHH/permisos avanzados pasa a fase posterior.
3. Impuestos Ecuador deben ser configurables.
4. Exportaciones CSV/Excel para carga manual en Power BI.

## 7. Criterio de completitud de este bloque

1. Proyecto creado en ruta pedida.
2. Backend y frontend con estructura ejecutable.
3. Flujo Login -> Unidad -> Dashboard visible.
4. README y documentacion tecnica publicados.
