# Demo pública sin coste

Una instancia de demostración alojada gratis, pensada para enseñar el producto y no para atender a
clientes. Nada de lo que hay aquí sustituye a `docker-compose.prod.yml`, que sigue siendo el
despliegue de producción.

| Pieza | Dónde | Límite del plan gratuito |
|---|---|---|
| API (`backend/Dockerfile`) | Render, servicio web | Se duerme tras 15 minutos sin tráfico; despertar tarda alrededor de un minuto |
| Frontend (build estático de Vite) | Render, sitio estático | Ninguno relevante |
| PostgreSQL | Neon | 0,5 GB; el cómputo se suspende a los 5 minutos y despierta solo con la siguiente conexión |
| Archivos | Backblaze B2 | Los primeros 10 GB son gratis |

La base de datos no está en Render a propósito: su Postgres gratuito se elimina 30 días después de
crearse.

Todo el despliegue está descrito en `render.yaml`, en la raíz del repositorio.

---

## Puesta en marcha

### 1. Base de datos en Neon

Crea un proyecto y copia la cadena de conexión **directa**, la que no lleva `-pooler` en el host.
`prisma migrate deploy` necesita una sesión y el endpoint con pool no se la da.

### 2. Bucket en B2

Un bucket y una clave de aplicación propios para la demo. No reutilices el de un cliente: lo que
suba un visitante acaba ahí.

Las fotos de las mascotas sembradas no dependen de este bucket; sus URLs públicas están en
`backend/prisma/seed-pet-photos.json`.

### 3. Blueprint en Render

*New → Blueprint*, elige este repositorio y la rama. Render lee `render.yaml` y pide los valores
marcados para introducir a mano:

| Servicio | Variable | Valor |
|---|---|---|
| `argos-demo-api` | `DATABASE_URL` | La cadena directa de Neon |
| `argos-demo-api` | `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT`, `B2_REGION` | Los del bucket de la demo |
| `argos-demo-api` | `CORS_ORIGINS` | La URL del sitio estático, sin barra final |
| `argos-demo` | `VITE_API_URL` | La URL de la API seguida de `/api/v1` |
| `argos-demo` | `VITE_SITE_URL` | Vacía: así la demo queda fuera de los buscadores |

`CORS_ORIGINS` y `VITE_API_URL` dependen de las URLs que Render asigne, que solo se conocen
tras crear los servicios: si el nombre ya está ocupado añade un sufijo, así que cópialas del panel en lugar de
suponerlas. Si no coinciden con lo
que pusiste, corrígelas y vuelve a desplegar: la API lee `CORS_ORIGINS` al arrancar y el frontend
incrusta `VITE_API_URL` al compilar, así que un cambio en esta última exige un *Manual Deploy* del
sitio estático.

`JWT_SECRET` y `SUPERADMIN_PASSWORD` los genera Render. La contraseña del superadmin se consulta
en *Environment* del servicio de la API.

### 4. Comprobación

`https://<api>/api/v1/health` debe responder `200` con `migrations.pending: 0`. Después, entra en
el sitio estático con cualquiera de las cuentas de abajo.

---

## Despliegue continuo

Render no despliega por su cuenta (`autoDeployTrigger: "off"` en `render.yaml`). Lo hace
`.github/workflows/deploy-demo.yml`:

1. Un push a `main` ejecuta CI completo.
2. Si pasa, el workflow compara ese commit con el que está sirviendo cada servicio y pide a
   Render, mediante su *deploy hook*, que construya exactamente ese commit. Un servicio cuyo
   código no cambió (`backend/` para la API, `frontend/` para el sitio) no se reconstruye.
3. Espera a que la API (`commit` en `/api/v1/health`) y el sitio (`/version.txt`) sirvan el
   commit nuevo.
4. Comprueba la demo en vivo: salud y migraciones, inicio de sesión con `admin_global`, que la
   API acepta por CORS el origen del sitio y que el bundle apunta a la URL de la API. Las dos
   últimas son configuración de Render y no código, así que se comprueban siempre.

Si algo falla, el run queda en rojo con el motivo. Un build que falla en Render se ve aquí como un
tiempo de espera agotado: el workflow no tiene clave de la API de Render, y el detalle está en el
registro del deploy.

### Configuración, una sola vez

1. En Render, en *Settings* de cada servicio, comprueba que la rama es `main` y copia la URL de
   *Deploy Hook*. Esa URL es una credencial: quien la tenga puede redesplegar el servicio.
2. En GitHub, *Settings → Secrets and variables → Actions*:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secreto | `RENDER_DEPLOY_HOOK_API` | El *deploy hook* de `argos-demo-api` |
   | Secreto | `RENDER_DEPLOY_HOOK_SITE` | El *deploy hook* de `argos-demo` |
   | Variable | `DEMO_API_URL` | La URL de la API seguida de `/api/v1`, igual que `VITE_API_URL` |
   | Variable | `DEMO_SITE_URL` | La URL del sitio estático, sin barra final, igual que `CORS_ORIGINS` |

3. En Render, sincroniza el Blueprint para que se aplique el cambio de `render.yaml`, o pon
   *Auto-Deploy* en *Off* a mano en los dos servicios. Mientras siga activo, cada push se
   despliega dos veces y una de ellas sin esperar a CI.

Hasta que existan los cuatro valores, el workflow falla en su primer paso diciendo cuál falta.

### A mano

- **Redesplegar**: *Actions → Deploy demo → Run workflow*. Reconstruye los dos servicios desde
  `main` y repite las comprobaciones.
- **Volver atrás**: en Render, *Deploys → Rollback* sobre el deploy anterior. No deshace
  migraciones. El siguiente push a `main` vuelve a desplegar lo último.

---

## Cuentas de la demo

| Usuario | Contraseña | Qué enseña |
|---|---|---|
| `admin_global` | `admin123` | Las tres unidades, finanzas, inventario e informes |
| `guarderia_admin` | `guarderia123` | Guardería: control del día, estancias y planes |
| `peluqueria_admin` | `peluqueria123` | Peluquería: agenda y tablero del salón |
| `vet_admin` | `vet12345` | Clínica: sala de espera, historias, hospitalización y laboratorio |
| `demo_admin` | `demo123` | Una segunda guardería con casi todos los módulos desactivados |

Son contraseñas públicas. Sirven para una demo y para nada más: cualquiera con la URL puede entrar
y cambiar datos.

---

## Reinicio diario

Los datos de la guardería principal están fechados respecto al día en que se sembraron: las
estancias en curso, el tablero del salón y la sala de espera son "de hoy". Con
`SEED_DEMO_RESET=daily`, la primera vez que el servicio arranca en un día local posterior
(`America/Guayaquil`) elimina esa guardería y la vuelve a sembrar. De paso deshace lo que haya
tocado un visitante.

- El reinicio ocurre **al arrancar**, no a medianoche. Como el servicio se duerme tras 15 minutos
  sin uso, en la práctica es el primer acceso del día, que tarda unos segundos más.
- Los archivos subidos por visitantes no se borran del bucket.
- La guardería `demo` y la cuenta de plataforma no se tocan.

**No actives `SEED_DEMO_RESET` sobre una base de datos con datos de un cliente.** Además de
`daycare_principal` borra todas las filas de `daycare_pethijos` (el id anterior de la demo), que en
algunas instalaciones es el negocio real.

---

## Antes de una presentación

Abre la URL un par de minutos antes. La primera petición despierta la API y la base de datos; a
partir de ahí responde con normalidad mientras haya tráfico.
