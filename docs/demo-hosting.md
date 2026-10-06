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
| `argos-demo-api` | `PUBLIC_SITE_URL` | La misma URL: de ahí toma el logo el correo de un recordatorio |
| `argos-demo-api` | `SMTP_URL` | `smtps://resend:API_KEY@smtp.resend.com:465`, con una API key de Resend **solo para la demo** |
| `argos-demo-api` | `MAIL_FROM` | `Argos Suite <recordatorios@avisos.oniriasolutions.com>` |
| `argos-demo` | `VITE_API_URL` | La URL de la API seguida de `/api/v1` |
| `argos-demo` | `VITE_SITE_URL` | Vacía: así la demo queda fuera de los buscadores |

`CORS_ORIGINS` y `VITE_API_URL` dependen de las URLs que Render asigne, que solo se conocen
tras crear los servicios: si el nombre ya está ocupado añade un sufijo, así que cópialas del panel en lugar de
suponerlas. Si no coinciden con lo
que pusiste, corrígelas y vuelve a desplegar: la API lee `CORS_ORIGINS` al arrancar y el frontend
incrusta `VITE_API_URL` al compilar, así que un cambio en esta última exige un *Manual Deploy* del
sitio estático.

`JWT_SECRET`, `SUPERADMIN_PASSWORD` y las cinco `DEMO_PASSWORD_*` los genera Render. Todas se
consultan en *Environment* del servicio de la API (ver "Cuentas de la demo").

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
   | Secreto | `DEMO_ADMIN_PASSWORD` | El valor de `DEMO_PASSWORD_ADMIN_GLOBAL` en Render: la comprobación tras el despliegue inicia sesión con él |
   | Variable | `DEMO_API_URL` | La URL de la API seguida de `/api/v1`, igual que `VITE_API_URL` |
   | Variable | `DEMO_SITE_URL` | La URL del sitio estático, sin barra final, igual que `CORS_ORIGINS` |

3. En Render, sincroniza el Blueprint para que se aplique el cambio de `render.yaml`, o pon
   *Auto-Deploy* en *Off* a mano en los dos servicios. Mientras siga activo, cada push se
   despliega dos veces y una de ellas sin esperar a CI.

Hasta que existan los cinco valores, el workflow falla en su primer paso diciendo cuál falta,
antes de desplegar nada.

### A mano

- **Redesplegar**: *Actions → Deploy demo → Run workflow*. Reconstruye los dos servicios desde
  `main` y repite las comprobaciones.
- **Volver atrás**: en Render, *Deploys → Rollback* sobre el deploy anterior. No deshace
  migraciones. El siguiente push a `main` vuelve a desplegar lo último.

---

## Cuentas de la demo

| Usuario | Contraseña (variable en Render) | Qué enseña |
|---|---|---|
| `admin_global` | `DEMO_PASSWORD_ADMIN_GLOBAL` | Las tres unidades, finanzas, inventario e informes |
| `guarderia_admin` | `DEMO_PASSWORD_GUARDERIA_ADMIN` | Guardería: control del día, estancias y planes |
| `peluqueria_admin` | `DEMO_PASSWORD_PELUQUERIA_ADMIN` | Peluquería: agenda y tablero del salón |
| `vet_admin` | `DEMO_PASSWORD_VET_ADMIN` | Clínica: sala de espera, historias, hospitalización y laboratorio |
| `demo_admin` | `DEMO_PASSWORD_DEMO_ADMIN` | Una segunda guardería con casi todos los módulos desactivados |

**Las contraseñas no están en este repositorio**, que es público. Las genera Render y se leen en
*Dashboard → argos-demo-api → Environment*. Las de desarrollo (`admin123` y compañía) no valen
aquí: con `NODE_ENV=production` el seed se niega a ejecutarse si falta alguna de las cinco, y la
API no arranca.

- **Compartirlas**: dáselas a quien vaya a ver la demo por un canal privado. Quien las tenga
  puede entrar y cambiar datos, así que trátalas como una invitación, no como un secreto fuerte.
- **Cambiarlas**: edita la variable en Render y redespliega. El seed actualiza la cuenta al
  arrancar. Si cambias la de `admin_global`, actualiza también el secreto `DEMO_ADMIN_PASSWORD`
  en GitHub.
- **En un servicio creado antes de este cambio**, sincroniza el Blueprint para que Render cree
  las cinco variables. Hazlo **antes** de desplegar este cambio: sin ellas la API no arranca.

**La demo envía recordatorios por correo de verdad, y solo por correo.** `principal` tiene el
módulo y la API tiene las credenciales de Resend, así que **Avisos a tutores** envía. Tres cosas
lo mantienen inofensivo aunque las contraseñas circulen:

- Los tutores sembrados tienen como correo la bandeja de pruebas de Resend
  (`delivered+nombre.apellido@resend.dev`): el mensaje se acepta y se descarta, sin rebotes que
  dañen la reputación del dominio. El envío se ve en el panel de Resend.
- `REMINDERS_DAILY_CAP` está en 50, por si alguien con acceso cambia el correo de un tutor por uno real.
  El reinicio diario devuelve los correos sembrados.
- La API key es exclusiva de la demo. Si alguien abusa, se revoca sin afectar a producción.

Para enseñarlo en una presentación, pon tu propio correo en la ficha de un tutor y envíale su
recordatorio. **No añadas las credenciales de WhatsApp**: los teléfonos sembrados son inventados
y pueden ser de alguien. Sin ellas, WhatsApp aparece como no conectado y todo sale por correo.

Si las variables de correo ya existían en un servicio creado antes de este cambio, Render no las
pide de nuevo: añádelas a mano en *Environment* de `argos-demo-api`.

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
