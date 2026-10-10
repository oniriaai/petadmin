# Backend — API Modular Multi-Inquilino

API Express con TypeScript y Prisma ORM estructurada como un **Modular Monolith** por dominios
verticales. Concentra autenticación, aislamiento entre guarderías, contratación de módulos, lógica
de guardería y peluquería, persistencia en PostgreSQL y URLs firmadas para Backblaze B2.

---

## Requisitos

- Node.js 20+
- npm
- PostgreSQL 16
- Docker y Docker Compose (recomendado)

---

## Estructura

```text
backend/src/
├── core/                                # Capacidades y contratos transversales
│   ├── clients/                        # Router público de tutores
│   ├── pets/                           # Router público de mascotas
│   ├── storage/object-keys.ts          # Construcción y validación de claves de objeto B2
│   ├── storage/bulk-delete.ts          # Borrado del prefijo completo de un inquilino
│   ├── tenancy/scope.ts                # Resolución del inquilino de cada petición
│   ├── tenancy/guard.ts                # Red de seguridad: falla si un `where` no filtra inquilino
│   ├── tenancy/principal.ts            # Estado vivo de la cuenta (activa / guardería activa)
│   ├── tenancy/unit-settings.ts        # Ajustes por (guardería, unidad)
│   ├── tenancy/local-time.ts           # El día de una unidad en su zona horaria
│   └── modules.ts                      # Superficie pública del Core
│
├── platform/                            # Composición y control de acceso
│   ├── module-registry.ts              # Único punto de montaje de módulos
│   ├── module.ts                       # Contrato `BackendModule`
│   ├── product-modules.ts              # Catálogo de módulos vendibles
│   └── module-access.ts                # Entitlements por guardería + middleware del gate
│
├── modules/                             # Slices de negocio
│   ├── admin/                           # Usuarios administrados por la propia guardería
│   ├── operaciones/                     # Salas y check-in/check-out
│   ├── reservas/                        # Reservas y planes recurrentes
│   ├── guarderia/                       # Ocupación en vivo, aforo y transporte
│   ├── peluqueria/                      # Catálogo, agenda y flujo de atención
│   └── platform-admin/                  # Consola del proveedor (/platform) y baja de inquilinos
│
├── middleware/auth.ts                   # JWT, roles, unidades, versión de token, estado de cuenta
├── middleware/security.ts               # CORS por lista blanca, límites de peticiones, helmet
├── middleware/observability.ts          # Registro estructurado, request-id, manejador de errores
├── jobs/                                # Entradas de un solo uso (planes recurrentes)
├── utils/pagination.ts                  # Convención de paginación y tope de filas
├── routes/                              # Routers en migración (finanzas, informes, etc.)
├── lib/s3.ts                            # Cliente S3 para Backblaze B2
├── db.ts                                # PrismaClient + extensión del guard de inquilino
└── main.ts                              # Bootstrap de Express
```

---

## Registro de módulos y control de acceso

`src/platform/module-registry.ts` es el **único** punto de composición. `registerBackendModules()`
monta cada módulo así:

```ts
app.use(`${prefix}${basePath}`, requireAuth, requireModuleAccess(module), module.router);
```

El gate es **hermano** del router, nunca un envoltorio: el router que exporta el módulo sigue
siendo exactamente el objeto que se monta.

`requireModuleAccess` decide en este orden, y el orden importa:

1. Sin sesión → **401**.
2. `role === "superadmin"` → **permitido**. Va antes del control de rol a propósito: ningún módulo
   lista `superadmin` en `access.roles` (ahí se enumeran roles de inquilino), así que comprobar el
   rol primero dejaría a la plataforma fuera del producto que administra.
3. Rol no permitido → **403** sin código.
4. Módulo de producto `core` → permitido.
5. Unidad de negocio que el módulo no sirve → **403** con `{ code: "WRONG_BUSINESS_UNIT" }`.
   Solo muerde para un rol que abarca varias unidades y que ha acotado con `X-Business-Unit`:
   pedir la ocupación de Guardería estando en Peluquería devolvía datos de Guardería e ignoraba
   la cabecera en silencio.
6. Módulo no contratado por la guardería → **403** con
   `{ code: "MODULE_DISABLED", module }`.
7. Falta un permiso que la petición necesita → **403** con
   `{ code: "PERMISSION_DENIED", permission }`. Va al final para que un módulo no contratado se
   siga anunciando como tal, y se comprueba también en los módulos `core`.

### Permisos por usuario

El rol abre módulos; el permiso decide qué puede hacer **una persona** dentro de ellos. El catálogo
es fijo y vive en `src/core/tenancy/permissions.ts`; cada usuario guarda la lista que se le
concedió (`users.permissions`).

| Permiso | Abre |
|---|---|
| `finanzas.read` | `GET` de `incomes`, `payables` y `providers`; `/reports/{incomes,expenses,kpis}`; `/dashboard/financial/*`; los ingresos de `/dashboard/summary` |
| `finanzas.write` | Crear, editar y eliminar cobros, cuentas por pagar, pagos y proveedores. Implica `finanzas.read` |
| `inventario.read` | `GET` de artículos y movimientos |
| `inventario.write` | Crear, editar y dar de baja artículos y registrar movimientos. Implica `inventario.read` |
| `datos.export` | `/export/*`. Las hojas de ingresos y gastos piden además `finanzas.read` |
| `registros.delete` | `DELETE` de un tutor, mascota, reserva, plan, sala, cita de peluquería o consulta |

- `admin` y `superadmin` tienen todos, diga lo que diga su fila. Un usuario nuevo nace con
  `inventario.read` y nada más.
- Las reglas se declaran en el registro (`permissions` de cada `BackendModule`), por verbo y por
  ruta dentro del módulo; ningún router las comprueba. `tests/permissions.ts` fija el mapa completo.
- No están detrás de un permiso `/reports/transport` (la ruta del día es trabajo de sala), las
  líneas de una consulta abierta, ni el cobro o el movimiento de stock que deja cerrar una estancia
  o dispensar una receta: esos se registran siempre, los haga quien los haga.
- `requireAuth` relee rol y permisos en cada petición. Conceder o retirar un permiso vale en la
  petición siguiente, y un token emitido con un rol que el usuario ya no tiene se rechaza con
  **401**: degradar a un administrador no puede esperar doce horas.

El módulo `auth` es el único `public: true`: se monta sin `requireAuth` porque es de donde sale la
sesión. `GET /auth/me` aplica `requireAuth` por su cuenta.

`validateBackendModules()` se ejecuta al arrancar y en `test:architecture`. Falla si hay ids o
paths duplicados, si algún módulo que no sea `auth` se declara público, o si **un módulo backend no
pertenece a ningún módulo de producto** — esa última invariante es lo que impide que un módulo nuevo
quede montado sin control.

Los entitlements se leen con una caché en memoria de 30 s (`module-access.ts`). La consola llama a
`invalidate(daycareId)` en cada escritura, así que un cambio de contratación se nota en la petición
siguiente, sin esperar al TTL.

---

## Aislamiento entre guarderías

Todo `where` de datos operativos deriva su inquilino de `src/core/tenancy/scope.ts`, nunca del
cuerpo de la petición:

| Helper | Uso |
|---|---|
| `resolveDaycareScope(req)` | `{ mode: "single", daycareId }` o `{ mode: "all" }` (solo superadmin sin fijar) |
| `buildScopeWhere(req)` | Fragmento de inquilino **y** unidad de negocio. Sustituye al antiguo `buildBusinessUnitWhere` |
| `buildDaycareWhere(req)` | Solo el fragmento de inquilino |
| `buildChildScopeWhere(req, rel)` | Para modelos que heredan el inquilino por su padre |
| `getRequiredDaycareId(req)` | Escrituras. Un superadmin **debe** fijar con `X-Daycare-Id` o recibe 400 |
| `assertRecordAccess(req, row)` | Comprobación posterior: inquilino **y** unidad |

`buildBusinessUnitWhere` fue **eliminado**, no marcado como obsoleto: un helper que filtra por
unidad pero no por inquilino lee entre guarderías, y dejarlo importable invita justo a ese fallo.

### Red de seguridad (`core/tenancy/guard.ts`)

Los helpers de arriba son el mecanismo; esto es el respaldo. El cliente Prisma de `db.ts` lleva una
extensión que **lanza** cuando, dentro de la petición de un usuario de inquilino, una consulta a un
modelo con dueño no filtra por inquilino.

| Exención | Motivo |
|---|---|
| Fuera del contexto de una petición | El planificador, el seed y los scripts cruzan inquilinos a propósito |
| `role === "superadmin"` | Sus lecturas sin fijar abarcan todos los inquilinos por diseño |
| `update` / `delete` singulares | Prisma exige que su `where` seleccione una fila única, así que no admiten `daycareId`. El patrón del código es `findFirst` acotado + `assertRecordAccess` + escritura por id |
| `withVerifiedScope(motivo, fn)` | Consulta acotada a través de un padre ya verificado (p. ej. `room.id` salido de un `findMany` acotado). Obliga a declarar por qué es segura |

Para un modelo hijo (`Payment`, `PetVaccination`, `PetDocument`, `ReservationPet`,
`InventoryMovement`) cuenta tanto el filtro por la relación (`{ payable: { daycareId } }`, lo que
construye `buildChildScopeWhere`) como por su clave ajena (`{ payableId }`), porque un hijo solo es
alcanzable a través de su padre. En un modelo **con dueño** la clave ajena no cuenta: aceptarla
habría aceptado `{ id: { in: petIds }, clientId }` con un `clientId` venido del cuerpo de la
petición, que es exactamente la consulta que permitía agendar contra el cliente de otra guardería.

Lanza en desarrollo y CI; en producción solo advierte, porque un falso positivo no debe tumbar la
pantalla de un cliente. Al activarla encontró cuatro fallos reales de aislamiento (cliente, sala,
escrituras masivas y `GET /export/clients`, que no filtraba nada en absoluto).

### Sesión y suspensión

`requireAuth` no se conforma con que el token sea válido: relee el estado de la cuenta y de su
guardería en cada petición, a través de una caché corta que la consola invalida al escribir.

| Situación | Respuesta |
|---|---|
| Token ausente, caducado o mal firmado | **401** |
| Versión de token anterior a la tenancy (`tv`) | **401** |
| El usuario ya no existe, o su `daycareId` no coincide con el del token | **401** |
| Usuario desactivado | **403** con `{ code: "USER_INACTIVE" }` |
| Guardería desactivada | **403** con `{ code: "DAYCARE_INACTIVE" }` |

La diferencia importa: un 401 significa "vuelve a entrar" y un 403 con código significa que volver
a entrar no servirá. Antes `isActive` solo se comprobaba en `/auth/login` y `/auth/me`, así que
desactivar a un usuario —o suspender a un inquilino que no paga— no surtía efecto hasta que
caducaba su token, hasta 12 horas después.

### Cabeceras

| Cabecera | Quién | Efecto |
|---|---|---|
| `Authorization: Bearer <jwt>` | Todos | Sesión. Los tokens llevan `tv` (versión); uno anterior a la tenancy recibe 401 limpio |
| `X-Business-Unit: DAYCARE\|GROOMING\|VETERINARY` | `admin` y `superadmin` | Acota la vista a una unidad. Sin ella, consolidado |
| `X-Daycare-Id: <id>` | `superadmin` | Fija el inquilino. Un usuario de guardería solo puede enviar el suyo (403 en otro caso) |
| `X-Request-Id: <id>` | Opcional, entrante | Se acepta el de la pasarela para que una traza abarque proxy y API; si no viene se genera. Siempre se devuelve |

### 404 frente a 403

- **404** al pedir un registro de otro inquilino: confirmar que existe ya sería una fuga.
- **403** al pedir un módulo no contratado, con `code: "MODULE_DISABLED"`.
- **403** al pedir un módulo que el rol no alcanza, **sin** ese código.

---

## Endpoints

### Configuración (`/api/v1/settings`, solo `admin`)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/settings` | Datos de la guardería (solo lectura) y una entrada por unidad contratada |
| `PUT` | `/settings/:businessUnit` | IVA por defecto, zona horaria y recordatorios (`reminders`) de esa unidad |

El IVA configurado es el que usan las reservas y citas nuevas que no indiquen otro; antes estaba
escrito a mano como `15` en tres sitios. La zona horaria se valida contra el runtime, porque una
zona inexistente desplazaría en silencio cada ocurrencia que genera el planificador.

`reminders` se envía entero: `{ auto, channels, defaultChannel, leadDays, contactPhone,
contactEmail }`. El canal por defecto debe ser uno de los activos y los días de aviso van de 1 a
30. `auto` nace en `false`. La respuesta lo incluye siempre, también para una unidad sin fila.

### Autenticación (`/api/v1/auth`, público)

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/auth/login` | Emite el JWT. Comprueba que la guardería esté activa y que el rol y el inquilino sean coherentes. Cuerpo: `{ username, password, businessUnit?, daycare? }` |
| `GET` | `/auth/me` | Sesión según el servidor: `{ user, daycare, enabledModules, units, fullAccess }`. Es lo que permite que el frontend filtre la navegación sin confiar en `localStorage` |

`daycare` es el identificador (slug) de la guardería y **solo** es necesario cuando el usuario
existe en varias: los nombres de usuario son únicos por guardería, no globalmente. Un nombre único
en toda la instalación entra sin él, así que nadie tiene que aprender un identificador que no
necesita. Cuando es ambiguo la respuesta es **400** con `{ code: "DAYCARE_REQUIRED" }` y la pantalla
de login revela el campo. Un `daycare` desconocido responde **401**, igual que una contraseña
incorrecta: no confirma qué guarderías existen.

Para un superadmin, `/auth/me` depende de si hay inquilino fijado: sin fijar informa alcance total;
fijado informa los entitlements **reales de ese inquilino**, para ver lo mismo que sus usuarios.
`fullAccess` sigue siendo `true` en ambos casos, porque el gate no lo restringe de verdad.

### Usuarios de la guardería (`/api/v1/users`, solo `admin`)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/users` | Personal de la propia guardería. Nunca incluye `passwordHash` |
| `POST` | `/users` | Provisiona personal: `{ username, password, name, role, permissions? }`. Sin `permissions`, el mínimo por defecto |
| `PATCH` | `/users/:id` | Renombrar, cambiar rol, restablecer contraseña, activar/desactivar y **reemplazar** la lista de `permissions` |

Forma parte del **Núcleo**, no es un módulo vendible: que una guardería administre a su propio
personal no es una función que se venda o se retenga. Sin esto, la consola del proveedor era la
única vía y cada alta, baja u olvido de contraseña en cualquier cliente era un ticket de soporte.

No reimplementa nada: reutiliza `provisionUser` y `updateUser` de la consola, así que hereda que la
unidad se derive del rol, que el rol deba caber en una unidad contratada y que no se pueda dejar la
guardería sin administrador activo. La guardería sale **siempre** de `getRequiredDaycareId(req)`,
nunca de la ruta ni del cuerpo, y `superadmin` no está en el esquema de roles asignables.

Un administrador tampoco puede desactivarse ni degradarse a sí mismo: **409** con
`{ code: "SELF_DEMOTION" }`. Se estaría bloqueando a sí mismo a mitad de petición, y el control del
último administrador no distingue entre "otro" y "yo".

### Consola de plataforma (`/api/v1/platform`, solo `superadmin`)

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/platform/overview` | Conteos de guarderías, usuarios y módulos habilitados |
| `GET` | `/platform/modules` | Catálogo de módulos vendibles, unidades y roles asignables |
| `GET` | `/platform/daycares` | Listado con conteo de usuarios y módulos |
| `POST` | `/platform/daycares` | Crea guardería + entitlements + ajustes por unidad + su primer administrador |
| `GET` | `/platform/daycares/:id` | Detalle con matriz de módulos, usuarios y auditoría |
| `PATCH` | `/platform/daycares/:id` | Nombre, razón social, zona horaria, unidades, activación |
| `GET` | `/platform/daycares/:id/modules` | Matriz de contratación |
| `PUT` | `/platform/daycares/:id/modules` | Alta/baja masiva de módulos |
| `POST` | `/platform/daycares/:id/users` | Provisiona un usuario de la guardería |
| `PATCH` | `/platform/daycares/:id/users/:userId` | Activar/desactivar, renombrar, cambiar rol o contraseña |
| `POST` | `/platform/daycares/:id/refresh` | Invalida la caché de entitlements a mano |
| `GET` | `/platform/daycares/:id/export` | Libro de Excel con todo lo que posee el inquilino |
| `DELETE` | `/platform/daycares/:id` | Elimina el inquilino de forma permanente. Cuerpo: `{ confirm: "<slug>" }` |
| `GET` | `/platform/audit` | Registro de auditoría |

Garantías del módulo:

- El rol de un usuario determina su unidad (`admin` → `GLOBAL`, `daycare` → `DAYCARE`,
  `grooming` → `GROOMING`); no se acepta del cuerpo de la petición, y debe caber en una unidad que
  la guardería haya contratado.
- `superadmin` no existe en el esquema de roles asignables, así que no se puede pedir.
- Las dependencias entre módulos se validan sobre el **estado resultante**, no sobre el cambio: se
  rechaza tanto habilitar `guarderia` sin `reservas` como quitar `reservas` con `guarderia` activo.
- Un usuario solo se edita a través de su propia guardería (404 en caso contrario).
- No se puede desactivar al último administrador activo ni quitar una unidad con usuarios activos.
- Toda escritura queda auditada; las contraseñas nunca llegan al registro.

#### Baja de un inquilino

Ya existe endpoint para eliminar una guardería, pero sigue sin estar a una petición de distancia.
Es la única acción irreversible de la consola, así que tiene dos salvaguardas:

1. Hay que **repetir el identificador** exacto de la guardería en `{ confirm }`. Un id pegado en la
   fila equivocada no la satisface.
2. La guardería **debe estar ya desactivada**. "Cortarles el acceso" y "destruir sus datos" quedan
   así como dos decisiones tomadas en dos momentos distintos.

`GET /platform/daycares/:id/export` entrega antes un libro con la guardería, sus usuarios, tutores,
mascotas, salas, reservas, cobros, cuentas por pagar e inventario. Sin hashes de
contraseña: no son datos que el cliente necesite y entregarlos es entregar algo que se puede romper
sin prisa.

El borrado va en **una sola transacción y en orden**: varias tablas se referencian entre sí
(`check_in_outs` apunta a reservas, mascotas, tutores, salas y usuarios; `incomes` a reservas) y
`users.daycareId` es `onDelete: Restrict`, así que la fila de la guardería no puede caer antes que
sus usuarios. La respuesta informa del recuento por tabla.

Los archivos se borran **después y fuera** de la transacción. El almacenamiento de objetos no puede
participar en una transacción de base de datos, así que uno de los dos va primero: va la base de
datos, porque el prefijo (`daycares/{id}/`) se deriva del id y un fallo al borrar archivos se
informa y se puede repetir. El orden contrario arriesgaría destruir los archivos de un inquilino que
sigue vivo. Se borran todas las versiones y marcadores de borrado, no solo la versión actual: el
bucket tiene versionado, y "hemos borrado sus datos" no debería significar "se pueden recuperar".

La línea de auditoría **sobrevive** al inquilino: `PlatformAuditLog.daycareId` es una columna sin
clave ajena precisamente para que el registro de una eliminación dure más que lo eliminado.

### Módulo de Guardería (`/api/v1/guarderia`)
*Roles `admin` y `daycare`. Requiere el módulo de producto `guarderia`.*

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/guarderia/occupancy` | Ocupación en tiempo real por sala |
| `GET` | `/guarderia/attendance/today` | Reservas esperadas y check-ins activos |
| `POST` | `/guarderia/attendance/check-in` | Check-in validando el aforo físico |
| `POST` | `/guarderia/attendance/check-out` | Salida con cobro contable opcional para `DAYCARE` |
| `GET` | `/guarderia/transport` | Recogidas y entregas del día |

### Módulo de Peluquería (`/api/v1/peluqueria`)
*Roles `admin` y `grooming`. Requiere el módulo de producto `peluqueria`.*

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/peluqueria/services` | Catálogo con duración estimada y tarifa base |
| `GET` | `/peluqueria/appointments` | Citas con filtros por fecha, estado y búsqueda |
| `GET` | `/peluqueria/appointments/:id` | Detalle y pagos registrados |
| `POST` | `/peluqueria/appointments` | Agenda una cita (`endTime = startTime + durationMinutes`), con anticipo opcional |
| `PATCH` | `/peluqueria/appointments/:id/status` | `PENDIENTE` → `RECEPCIONADA` → `EN_PROCESO` → `LISTO` → `COMPLETADA` → `CANCELADA` |
| `POST` | `/peluqueria/appointments/:id/complete` | Completa y registra el cobro para `GROOMING` |
| `DELETE` | `/peluqueria/appointments/:id` | Cancela la cita |

### Módulo de Veterinaria (`/api/v1/veterinaria`)
*Roles `admin` y `veterinary`, unidad `VETERINARY`. Requiere el módulo de producto `veterinaria`.*

Cada consulta es una reserva de la unidad `VETERINARY` (ocupa agenda y sala, y de ella cuelgan los
cobros) más su registro clínico, uno a uno. Una consulta `CERRADA` queda congelada.

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/veterinaria/services` | Catálogo de servicios de la clínica (`?includeInactive=true`) |
| `POST` `PUT` `DELETE` | `/veterinaria/services[/:id]` | Alta, edición y baja lógica. Solo `admin` |
| `GET` | `/veterinaria/staff` | Veterinarios de planta y externos |
| `POST` `PUT` `DELETE` | `/veterinaria/staff[/:id]` | Alta, edición y baja lógica, con vínculo opcional a un usuario. Solo `admin` |
| `GET` | `/veterinaria/visits` | Agenda con filtros `date`, `from`/`to`, `veterinarianId`, `status`, `petId`, `search`; paginable |
| `POST` | `/veterinaria/visits` | Agenda una consulta; sin `startTime` entra a sala de espera. Rechaza con 409 un veterinario o una sala ya ocupados, salvo `triage: URGENCIA` |
| `GET` | `/veterinaria/visits/:id` | Detalle: paciente, signos vitales, diagnósticos, cargos y cobros |
| `PATCH` | `/veterinaria/visits/:id` | Registro clínico (motivo, anamnesis, examen, valoración, plan, control) |
| `PATCH` | `/veterinaria/visits/:id/status` | `PROGRAMADA` → `EN_ESPERA` → `EN_CONSULTA`, o `CANCELADA` / `NO_ASISTIO` (liberan el hueco) |
| `DELETE` | `/veterinaria/visits/:id` | Elimina una consulta no cerrada |
| `POST` `DELETE` | `/veterinaria/visits/:id/vitals[/:childId]` | Tomas de signos vitales; el peso se refleja en la ficha |
| `POST` `DELETE` | `/veterinaria/visits/:id/diagnoses[/:childId]` | Diagnósticos presuntivos o definitivos |
| `POST` `DELETE` | `/veterinaria/visits/:id/charges[/:childId]` | Cargos del catálogo o libres |
| `POST` | `/veterinaria/visits/:id/documents` | Adjunta un documento del paciente a la consulta |
| `POST` | `/veterinaria/visits/:id/close` | Cierra, calcula IVA y total, y registra el cobro para `VETERINARY` |
| `POST` | `/veterinaria/visits/:id/payments` | Abono sobre el saldo de una consulta cerrada |
| `GET` | `/veterinaria/patients/:petId/history` | Historia clínica: consultas, diagnósticos, signos vitales, vacunas y documentos |
| `PATCH` | `/veterinaria/patients/:petId` | Datos clínicos del paciente: grupo sanguíneo, alergias, condiciones crónicas, fallecimiento |
| `POST` `DELETE` | `/veterinaria/visits/:id/vaccinations[/:childId]` | Vacuna aplicada en la consulta, con lote, laboratorio y refuerzo |
| `POST` | `/veterinaria/visits/:id/preventives` | Desparasitación u otro preventivo aplicado en la consulta |
| `POST` `DELETE` | `/veterinaria/patients/:petId/preventives[/:childId]` | Preventivo sin consulta detrás (aplicado fuera o antes de llevar registro) |
| `POST` `DELETE` | `/veterinaria/visits/:id/prescriptions[/:childId]` | Receta con sus medicamentos; no se elimina si ya se dispensó algo |
| `GET` | `/veterinaria/prescriptions/:id` | Receta con paciente, tutor y prescriptor, para imprimir |
| `POST` | `/veterinaria/prescription-items/:itemId/dispense` | Dispensa una línea **una sola vez**: descuenta stock (409 si no alcanza) y, con `unitPrice`, añade el cargo a la consulta abierta |
| `GET` | `/veterinaria/pharmacy/items` | Stock de la unidad `VETERINARY`, para el selector de dispensación |
| `GET` | `/veterinaria/pharmacy/queue` | Líneas recetadas en los últimos 30 días sin dispensar; paginable |
| `GET` | `/veterinaria/pharmacy/controlled-log` | Libro de controlados: dispensaciones de artículos marcados `isControlled` (`from`, `to`); paginable |
| `GET` | `/veterinaria/pharmacy/expiring` | Lotes recibidos que caducan en 90 días o ya caducaron |
| `GET` | `/veterinaria/hospitalizations` | Ingresos (`status`: `INGRESADO` por defecto, `ALTA`, `ALL`) con sus indicaciones y la próxima dosis de cada una; paginable |
| `GET` | `/veterinaria/hospitalizations/wards` | Salas de tipo `hospital` con su aforo y ocupación |
| `GET` | `/veterinaria/hospitalizations/:id` | Un ingreso, también para la hoja de alta |
| `POST` | `/veterinaria/visits/:id/hospitalizations` | Ingresa al paciente: sala de hospitalización con cupo (409 si está completa o el paciente ya está ingresado) |
| `POST` | `/veterinaria/hospitalizations/:id/discharge` | Alta **una sola vez**: suspende las indicaciones y, con tarifa diaria, añade los días de estancia como cargo de la consulta |
| `POST` | `/veterinaria/hospitalizations/:id/vitals` `/orders` | Signos vitales en sala; nueva indicación (`everyHours` opcional) |
| `POST` | `/veterinaria/treatment-orders/:orderId/doses` `/stop` | Firma una dosis (administrada u omitida con motivo; 409 si ese horario ya se firmó); suspende la indicación |
| `POST` `DELETE` | `/veterinaria/visits/:id/procedures[/:childId]` | Cirugía, procedimiento o eutanasia; solo se elimina si no se inició |
| `PATCH` `POST` | `/veterinaria/procedures/:id` `/start` `/finish` | Edita, inicia y finaliza. Una cirugía o eutanasia **no inicia sin consentimiento firmado** del mismo tipo; finalizar una eutanasia registra el fallecimiento |
| `POST` `DELETE` | `/veterinaria/visits/:id/lab-orders[/:childId]` | Orden de laboratorio o imagen; solo se elimina mientras está `SOLICITADO` |
| `GET` | `/veterinaria/lab-orders` | Órdenes (`status`: `PENDIENTE`, `RESULTADO`…, `kind`, `petId`); paginable |
| `PATCH` `POST` | `/veterinaria/lab-orders/:id/status` `/result` | Marca en proceso; registra o corrige el resultado (resumen y valores), **aunque la consulta ya esté cerrada** |
| `POST` `DELETE` | `/veterinaria/visits/:id/consents[/:childId]` | Consentimiento del tutor; firmado no se elimina |
| `GET` `POST` | `/veterinaria/consents/:id` `/sign` | Consentimiento para imprimir; registra la firma una sola vez |
| `GET` | `/veterinaria/reminders` | Recordatorios calculados (`kind`, `days`): refuerzos y preventivos por vencer, controles sin consulta posterior y exámenes sin resultado. Arreglo simple con tope: se combina en memoria y no se pagina |
| `GET` | `/veterinaria/reports/summary` | Solo admin. Consultas por tipo y veterinario, facturación por categoría, cobrado, diagnósticos frecuentes y hospitalización (`from`, `to`; últimos 30 días por defecto) |

Una consulta no se cierra, cancela ni elimina mientras su paciente siga ingresado o tenga un
procedimiento en curso. Una mascota registrada como fallecida no admite reservas, citas de
peluquería, check-in ni nuevas ocurrencias de un plan recurrente, y tampoco puede añadirse a una
reserva existente: todas responden `409`. El planificador omite el plan y lo cuenta en
`skippedDeceased`, no como fallo.

La agenda de un día (`date=YYYY-MM-DD`, en la clínica y en peluquería) es el día de la zona horaria
de la unidad, no el del servidor (`core/tenancy/local-time.ts`). La disponibilidad de veterinario y
sala se comprueba con la fila bloqueada, así que dos reservas simultáneas del mismo hueco no pasan
las dos.

El stock se mueve a través de `core/inventory/stock.ts`, compartido con `/inventory`: movimiento y
nivel se escriben en una sola transacción. `/inventory/items` acepta `isControlled`, y una entrada
acepta `lotNumber` y `expiresAt`.

---

## Protecciones de borde

`src/middleware/security.ts`. Nada de esto existía: `cors()` reflejaba cualquier origen y no había
límite de peticiones, así que `/auth/login` admitía intentos ilimitados contra nombres de usuario
que entonces eran únicos a nivel global, y `/storage/upload-url` firmaba URLs mientras alguien
siguiera pidiéndolas, a costa del dueño del bucket.

| Protección | Detalle |
|---|---|
| CORS | Lista blanca desde `CORS_ORIGINS`, no reflejo del origen recibido. Una petición **sin** `Origin` se permite: la cabecera es una protección del navegador, y rechazar su ausencia rompería a cualquier cliente que no lo sea |
| `/auth/login` | 10 intentos por 10 min, por IP **y** usuario. Los aciertos no cuentan. Las dos mitades importan: la IP frena recorrer una lista de cuentas, el usuario frena un intento distribuido contra una cuenta conocida |
| `/storage/*` | 60 por minuto **por guardería**, no por IP: cada operación cuesta dinero en el proveedor y el límite debe recaer sobre el inquilino, que además no puede agotar el de otro |
| Global | 600 por minuto, suficientemente holgado para que el uso normal no lo alcance |
| `helmet` | Cabeceras de endurecimiento, y `x-powered-by` desactivado |

`assertSecureConfig()` corre **antes** de montar nada y se niega a arrancar en producción si falta
`JWT_SECRET`, si conserva el valor de ejemplo `change_me`, si tiene menos de 32 caracteres, o si
faltan `CORS_ORIGINS` o `DATABASE_URL`. Antes el secreto caía a `"change_me"` en dos sitios, así que
un despliegue que olvidara definirlo firmaba y aceptaba tokens con una clave pública: cualquiera
podía emitirse un token de superadmin.

Detrás de un proxy inverso hace falta `TRUST_PROXY` (normalmente `1`), o `req.ip` será el del proxy
y todos los límites por IP compartirán un contador. Es explícito a propósito: confiar en la cabecera
cuando nada la limpia permite falsear la propia dirección.

---

## Paginación

`src/utils/pagination.ts`. Los listados aceptan `?page` y `?pageSize` (tope **200**) y devuelven
`{ items, total, page, pageSize, pageCount }`.

**Sin parámetros de paginación devuelven el array de siempre**, acotado. Esto no es compatibilidad
por inercia: tres formularios del frontend (`CheckInOutForm`, `NuevaReservaModal`,
`RecurringPlanForm`) cargan la lista completa en un `<select>`, y un selector truncado en silencio
es peor que una consulta lenta —el cliente que buscas simplemente no está y nada lo dice—.
`X-Total-Count` viaja en ambas formas, así que un cliente siempre puede detectar que no recibió
todo.

Se aceptan también `skip`/`take`/`offset`/`limit`, porque `check-in-out` ya se publicó con esos
nombres.

Dos excepciones deliberadas:

- **`/inventory/items` no pagina**, solo está acotado. Su filtro `lowStock` compara dos columnas
  (`currentStock <= minStock`), algo que Prisma no puede expresar en un `where`, así que se aplica
  en JS; filtrar después de tomar una página daría una página corta y un total que no concuerda.
- **`/export/*` no pagina**: una exportación debe contener todo, y truncarla en silencio sería peor
  que tardar.

El histórico de check-in/out ordena con `nulls: "last"`. Postgres coloca los `NULL` **primero** en
orden descendente, y una fila creada desde una reserva no tiene `checkInTime` hasta que la mascota
llega: la primera página del histórico eran visitas que nunca ocurrieron y la más reciente real era
inalcanzable.

---

## Observabilidad

`src/middleware/observability.ts`. Atender a varias guarderías desde una sola instalación significa
que la primera pregunta de cualquier incidencia es *de qué inquilino*, y `console.log` no podía
responderla.

- Cada petición lleva un `x-request-id`; cada línea autenticada lleva `daycareId`, `userId`,
  `username` y `role`. El `Authorization`, las cookies y las contraseñas se eliminan del registro.
- Un error no controlado responde **500** con el `requestId` incluido —lo único que hace rastreable
  un reporte de "falló sobre las 3"— y **nunca** con el texto del error.
- Con `SENTRY_DSN` definido, los errores se reportan etiquetados por inquilino. Sin él no se envía
  nada.

| Endpoint | Para qué |
|---|---|
| `GET /api/v1/health` | Base de datos **y** estado de migraciones (`applied` / `pending`). Responde **503** si quedan pendientes: un proceso corriendo contra un esquema sin migrar falla en las rutas reales mientras se declara sano. Incluye `commit`, el commit desplegado cuando el host lo expone (`RENDER_GIT_COMMIT`), o `null` |
| `GET /api/v1/ready` | Sonda barata para el orquestador |

---

## Planes recurrentes

La generación es idempotente sobre la clave única `(recurringPlanId, checkIn)`, así que repetirla es
inofensivo.

En desarrollo corre dentro del proceso web; en producción **no**. N réplicas lo ejecutarían N veces
y, más probable en la práctica, un redespliegue reinicia el temporizador de 24 h y podría no
ejecutarse nunca. Ahí se invoca como job de un solo uso:

```bash
npm run job:recurring-plans                   # local
docker compose -f docker-compose.prod.yml run --rm scheduler
```

`RUN_SCHEDULER_IN_PROCESS` fuerza cualquiera de los dos comportamientos. El job sale con código
distinto de cero si alguna ocurrencia falla.

### Recordatorios a tutores

`/reminders` (módulo de producto `recordatorios`) envía por WhatsApp o correo lo que cada unidad
tiene que recordar. `docs/recordatorios.md` explica las reglas y la puesta en marcha.

| Método | Ruta | Qué hace |
| --- | --- | --- |
| `GET` | `/reminders/due?days=&kind=` | Lo que hay que recordar en las unidades de la sesión, con el canal resuelto, el mensaje ya redactado y el último envío. Array desnudo |
| `POST` | `/reminders/send` | `{ sourceKey, channel? }`. Envía uno ahora. El destinatario sale de la ficha del tutor, nunca de la petición; una clave ajena o caducada es `404` |
| `GET` | `/reminders/log` | Registro de envíos, paginado |
| `GET` | `/reminders/channels` | Qué canales tiene la instalación: `live`, `simulated` o `null` |

La configuración por unidad viaja en `/settings` (`reminders`), y la preferencia de cada tutor
en `reminderChannel` de `/clients` (`WHATSAPP`, `EMAIL`, `NONE` o `null` para seguir a la unidad).

Variables: `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN` para WhatsApp; `SMTP_URL` y
`MAIL_FROM` para correo; opcionales `WHATSAPP_API_VERSION`, `PUBLIC_SITE_URL`,
`DEFAULT_COUNTRY_CODE` y `REMINDERS_DAILY_CAP`. Sin las de un canal, fuera de producción ese
canal es simulado y en producción no está disponible. Los requisitos completos están en
`docs/recordatorios.md`.

El envío automático es un job, como el de planes recurrentes, pero **cada hora**:

```bash
npm run job:reminders                         # local
docker compose -f docker-compose.prod.yml run --rm reminders
```

El transporte está en `src/core/messaging/` (Cloud API de Meta y SMTP) y no sabe nada de
recordatorios; el texto de cada mensaje está en `src/modules/recordatorios/templates.ts`.

---

## Almacenamiento de objetos (Backblaze B2)

`src/core/storage/object-keys.ts` es el único sitio donde se decide la forma de una clave:

```
daycares/{daycareId}/pets/{mascota}_{tutor}/{timestamp}-{archivo}
```

- Todos los segmentos se sanean; ninguno puede ser `.` ni `..` ni contener separadores.
- `resolveObjectKey` rechaza travesías, segmentos vacíos y **URLs cuyo host no sea este bucket**.
  Importa el orden: el parser de URL normaliza `/../../x` a `/x` en silencio, así que lo que
  realmente protege es la comprobación de host. Sin `B2_ENDPOINT` configurado se rechaza cualquier URL.
- `POST /storage/remove` autoriza **contra la base de datos**: la clave debe estar referenciada por un
  `Pet.photoUrl` o un `PetDocument.filePath` **de la guardería que llama**. Autorizar por la forma
  de la clave no serviría, y así las claves antiguas sin prefijo siguen funcionando mientras que
  adivinar la de otro inquilino no logra nada.
- La referencia sola tampoco basta, porque es el propio inquilino quien la escribe: podría apuntar
  una foto o un documento suyo a la clave de otra guardería y luego "borrar su archivo". Por eso
  una clave bajo `daycares/{id}/` solo la borra esa guardería, y una clave antigua sin prefijo
  solo se borra si ninguna otra guardería la referencia. Además, `photoUrl` y el `filePath` de un
  documento de consulta se rechazan con `400` si nombran el prefijo de otra guardería.

---

## Migraciones

El historial vive en `prisma/migrations/` y se aplica con `prisma migrate deploy` (Docker ya lo
hace). `prisma db push` queda como salida de emergencia en desarrollo.

| Migración | Contenido |
|---|---|
| `20260901000000_baseline` | Esquema completo previo a la tenancy |
| `20260902000000_rename_business_units` | `KINDERDOG`→`DAYCARE`, `PETHIJOS`→`GROOMING` y sus roles |
| `20260903000000_add_daycare_tenancy` | `daycares`, `daycare_modules`, `platform_audit_logs`, `daycareId` con backfill, FKs, índices y el CHECK `users_superadmin_untenanted` |
| `20261004000000_veterinary_core` | Clínica veterinaria: `vet_services`, `vet_visits`, `vet_vitals`, `vet_diagnoses`, `vet_visit_charges`; matrícula, especialidad y usuario en `veterinarians`; datos clínicos en `pets`. Solo añade: la unidad `VETERINARY` y el rol `veterinary` son valores de texto y no necesitan migración |
| `20261005000000_veterinary_pharmacy` | `vet_preventives`, `vet_prescriptions`, `vet_prescription_items`; lote, laboratorio, veterinario y consulta en `pet_vaccinations`; `isControlled` en `inventory_items`; lote, caducidad y línea de receta en `inventory_movements`. Solo añade |
| `20261006000000_veterinary_inpatient` | `vet_hospitalizations`, `vet_treatment_orders`, `vet_treatment_administrations` (único por indicación y horario), `vet_procedures`, `vet_lab_orders`, `vet_lab_result_values`, `vet_consents`; `hospitalizationId` en `vet_vitals`. Solo añade |
| `20260904000000_add_unit_vat_percent` | `business_unit_settings.vatPercent`, con el valor por defecto que ya estaba escrito a mano |
| `20260905000000_drop_unused_backfill_tenant` | Elimina la guardería `daycare_pethijos` **solo si no posee ningún dato**. La migración de tenancy la inserta sin condiciones (correcto para adoptar una instalación de un solo inquilino), con lo que una base de datos **nueva** arrancaba con un inquilino que nadie creó, activo y con los siete módulos vendibles habilitados |
| `20260906000000_per_tenant_usernames` | `username` pasa a ser único por `(daycareId, username)`, más un índice **parcial** sobre `username` donde `daycareId IS NULL` para las cuentas de plataforma: Postgres considera los `NULL` distintos entre sí, así que el índice compuesto no las cubriría |

`prisma/legacy-migrations/` conserva tres migraciones anteriores al baseline. Están **fuera** de
`prisma/migrations/` a propósito: sus marcas de tiempo ordenan antes que el baseline, así que en una
base de datos nueva `migrate deploy` las ejecutaría primero y el baseline fallaría al recrear las
mismas tablas.

El índice parcial de `20260906000000_per_tenant_usernames` **no se puede expresar en
`schema.prisma`**, así que vive solo en el SQL de la migración. `migrate deploy` lo respeta; un
`prisma migrate dev` lo vería como deriva e intentaría eliminarlo, así que hay que volver a
declararlo si alguna vez se regenera el baseline.

---

## Scripts

```bash
# Desarrollo
npm run dev                  # tsx watch src/main.ts
npm run build                # Compila src; tsconfig.seed.json solo comprueba tipos (noEmit)
npm run build:seed           # Emite el seed a dist-seed/ para la imagen de producción
npm run start                # Ejecuta el build
npm run typecheck:aux        # Solo seed/scripts/tests

# Jobs
npm run job:recurring-plans  # Generación de planes recurrentes, un solo uso
npm run job:reminders        # Recordatorios automáticos a tutores, un solo uso (cada hora)
npm run job:billing          # Renovaciones, avisos y suspensiones de suscripciones (cada hora)
npm run mail:test -- a@b.com # Envía un recordatorio de muestra por el SMTP configurado

# Base de datos
npm run db:generate          # Prisma Client
npm run db:migrate           # migrate deploy
npm run db:migrate:dev       # migrate dev
npm run db:push              # Salida de emergencia; no usar con datos reales
npm run db:seed              # prisma/seed.ts
npm run db:setup             # migrate deploy + seed

# Pruebas
# Sin base de datos: registros, catálogo, gate, claves de objeto, guarda de
# configuración de producción, contrato del manejador de errores y de la paginación
npm run test:architecture

# E2E contra un backend levantado
npm run test:tenancy         # Aislamiento, MODULE_DISABLED, unidad de negocio y escritura cruzada
npm run test:platform        # Consola de plataforma
npm run test:users           # Usuarios por guardería y nombres de usuario por inquilino
npm run test:permissions     # Permisos por usuario: lo que el personal no alcanza y cómo se concede
npm run test:offboarding     # Exportación y eliminación de una guardería
npm run test:suspension      # Desactivación de usuarios y suspensión de inquilinos
npm run test:ratelimit       # Límite de inicios de sesión y lista blanca de CORS
npm run test:modular         # Guardería y Peluquería
npm run test:financial       # Transacciones y cuentas por pagar
npm run test:checkin         # Check-in / check-out
npm run test:settings        # Configuración por guardería y su efecto en el IVA
npm run test:scheduler       # Idempotencia del generador de planes recurrentes
npm run test:veterinaria     # La clínica veterinaria
npm run test:reminders       # Recordatorios: envío, canal del tutor e idempotencia
```

---

## Ejecución con Docker

```bash
docker compose up --build

# Las catorce suites; ejecuta `test:ratelimit` al final, porque agota el límite de inicios de
# sesión a propósito y throttlearía los logins que necesitan las demás.
for s in tenancy platform users permissions offboarding suspension modular financial checkin settings scheduler veterinaria reminders ratelimit; do
  docker exec argos-backend npm run "test:$s" || break
done
```

`docker-compose.yml` es un stack de **desarrollo** y no debe apuntarse nunca a datos de clientes:
monta el código, ejecuta `npm run dev`, publica el puerto de Postgres, incluye pgAdmin y siembra las
guarderías de demostración en cada arranque. Para producción está `docker-compose.prod.yml` con
`backend/Dockerfile`; las variables obligatorias y el porqué están en el
[README raíz](../README.md#despliegue-en-producción).
