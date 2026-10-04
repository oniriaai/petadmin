# Pruebas del backend

Dos clases de suite, y la diferencia importa para saber cuándo ejecutar cada una:

- **Arquitectura** (`tests/*.ts` sin `.e2e`): no necesitan base de datos ni servidor. Comprueban
  composición y contratos importando el código directamente, así que corren en cualquier sitio y son
  la primera cosa que debería fallar si algo se rompe.
- **End-to-end** (`tests/*.e2e.ts`): hablan HTTP contra un backend levantado en
  `http://localhost:3001/api/v1` sobre una base de datos sembrada.

---

## Arquitectura — `npm run test:architecture`

| Suite | Qué fija |
|---|---|
| `module-registry.ts` | Ids y paths únicos, rutas absolutas, y que los módulos especializados declaren sus roles y unidades |
| `product-modules.ts` | Catálogo de módulos vendibles: ids únicos, dependencias existentes, y que cada módulo backend lo reclame exactamente un módulo de producto |
| `module-access.ts` | Composición del montaje: `requireAuth` → gate de contratación → router, comparando por identidad de objeto |
| `reservas-module.ts`, `operaciones-module.ts`, `veterinaria-module.ts`, `platform-admin-module.ts` | Que la superficie pública de cada módulo sea la que el registro monta |
| `storage-keys.ts` | Construcción y resolución de claves de objeto: travesías, segmentos vacíos y URLs de otro bucket |
| `security-config.ts` | `assertSecureConfig()` rechaza arrancar en producción con `JWT_SECRET` ausente, de ejemplo o demasiado corto, y la lista blanca de CORS acepta y rechaza lo que debe |
| `observability.ts` | El manejador de errores devuelve el `requestId`, **no** el texto del error, y no vuelve a escribir sobre una respuesta ya enviada |
| `pagination.ts` | Array desnudo sin parámetros, tope de filas inviolable, y sobre el envoltorio: `pageCount`, valores basura y los nombres heredados `skip`/`take`/`offset`/`limit` |

La invariante que más sostiene el producto está aquí: **un módulo backend que no pertenezca a ningún
módulo de producto impide arrancar la aplicación**. Sin ella, un módulo nuevo se montaría sin
control y quedaría gratis para todas las guarderías.

---

## End-to-end

| Suite | Comando | Qué cubre |
|---|---|---|
| `tenant-isolation.e2e.ts` | `test:tenancy` | Listados acotados al propio inquilino; leer o escribir uno ajeno por id da **404**; un módulo no contratado da **403 MODULE_DISABLED**; `X-Daycare-Id` solo lo fija un superadmin; y que no se pueda agendar, reservar ni usar la sala **de otra guardería** |
| `platform-console.e2e.ts` | `test:platform` | Alta de guardería con entitlements y primer administrador, matriz de módulos validada sobre el estado resultante, provisión de usuarios, auditoría y el identificador único |
| `tenant-users.e2e.ts` | `test:users` | `/users`: la guardería administra su personal, restablece contraseñas, no alcanza a otra guardería, no puede pedir `superadmin` ni autodegradarse; y que **dos guarderías puedan tener el mismo nombre de usuario** |
| `offboarding.e2e.ts` | `test:offboarding` | Exportación del inquilino y su eliminación: las confirmaciones que la bloquean, el recuento por tabla, que no sobreviva ninguna fila y que la auditoría sí |
| `suspension.e2e.ts` | `test:suspension` | Desactivar un usuario o suspender un inquilino invalida los tokens **en la petición siguiente**, no al caducar |
| `rate-limit.e2e.ts` | `test:ratelimit` | Corte de intentos de login (por IP **y** usuario), lista blanca de CORS y cabeceras de `helmet` |
| `modular-domains.e2e.ts` | `test:modular` | Peluquería (catálogo con duraciones, agenda, estados del flujo, cobro para `GROOMING`) y Guardería (ocupación en vivo, aforo en el check-in, cobro para `DAYCARE`), con el aislamiento entre ambos roles |
| `veterinaria.e2e.ts` | `test:veterinaria` | La clínica: consulta desde la sala de espera hasta el cobro en `VETERINARY`, abonos, congelación al cerrar, doble reserva de veterinario y sala (salvo urgencias), vacunas y preventivos con lote, receta dispensada una sola vez con descuento de stock y libro de controlados, y que los demás roles y unidades no la alcancen |
| `financial.e2e.ts` | `test:financial` | `incomes` y `payables`: CRUD y pagos parciales y totales por unidad |
| `check-in-out.e2e.ts` | `test:checkin` | Check-in/check-out ad-hoc y ligado a reservas, histórico y ocupación |
| `settings.e2e.ts` | `test:settings` | Configuración por (guardería, unidad) y su efecto real en el IVA de una reserva nueva |
| `recurring-plans-idempotency.e2e.ts` | `test:scheduler` | Una segunda ejecución no crea nada ni informa fallos |

### Aisladas por diseño

`test:platform`, `test:users`, `test:offboarding` y `test:suspension` **crean y eliminan su propia
guardería**, así que no dependen de los inquilinos sembrados ni los alteran. Cada una limpia también
lo que haya dejado una ejecución interrumpida anterior, buscando por prefijo de identificador.

Donde una suite necesita tocar un inquilino sembrado (p. ej. para comprobar que un usuario repetido
se acepta en otra guardería), lo deshace en un `finally`: hay aserciones en `test:tenancy` que
cuentan lo que tiene la guardería `demo`, y dejar un registro de más las rompería.

### Orden

`test:ratelimit` va **al final**: agota el límite de inicios de sesión a propósito, y ejecutarla
antes throttlearía los logins que necesitan las demás.

### Una fragilidad conocida

`check-in-out.e2e.ts` reserva con horas relativas a *ahora* y no limpia su reserva. Una ejecución
completa termina en `COMPLETADA` y no molesta, pero una que falle a mitad deja una `ACTIVA` que
choca con la siguiente ejecución durante la hora siguiente. En CI no se nota, porque la base de
datos es nueva en cada ejecución.

---

## Ejecución

```bash
# Arquitectura: no necesita nada levantado
cd backend && npm run test:architecture

# E2E en Docker (recomendado)
for s in tenancy platform users offboarding suspension modular financial checkin settings scheduler veterinaria ratelimit; do
  docker exec pethijos-backend npm run "test:$s" || break
done

# E2E en local, con el backend ya corriendo
cd backend && npm run test:tenancy
```

`API_URL` y `SUPERADMIN_PASSWORD` se respetan si están definidas; por defecto apuntan al stack de
desarrollo.

---

## Prerrequisitos de las E2E

1. Backend corriendo en `http://localhost:3001`.
2. Esquema aplicado con `prisma migrate deploy` (**no** `prisma db push`: el proyecto tiene
   historial versionado, y una base creada con `db push` no lleva el registro de migraciones que
   `/api/v1/health` comprueba).
3. Seed ejecutado con los datos de demostración, que es el valor por defecto fuera de producción
   (`SEED_DEMO_DATA`). Las suites entran con las cuentas sembradas:

| Guardería | Usuario | Contraseña | Rol |
|---|---|---|---|
| `pethijos` | `admin_global` | `admin123` | `admin` |
| `pethijos` | `kinderdog_admin` | `kinderdog123` | `daycare` |
| `pethijos` | `pethijos_admin` | `pethijos123` | `grooming` |
| `pethijos` | `vet_admin` | `vet12345` | `veterinary` |
| `demo` | `demo_admin` | `demo123` | `admin` |
| — | `superadmin` | `superadmin123` | `superadmin` |

La guardería `demo` existe a propósito con módulos desactivados y **sin tutores**: una base de datos
de un solo inquilino oculta exactamente los fallos que el aislamiento y la contratación deben
evitar.
