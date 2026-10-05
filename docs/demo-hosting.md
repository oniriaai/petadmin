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

Las dos últimas dependen de las URLs que Render asigne, que solo se conocen tras crear los
servicios (normalmente `https://argos-demo.onrender.com` y
`https://argos-demo-api.onrender.com`, salvo que el nombre esté ocupado). Si no coinciden con lo
que pusiste, corrígelas y vuelve a desplegar: la API lee `CORS_ORIGINS` al arrancar y el frontend
incrusta `VITE_API_URL` al compilar, así que un cambio en esta última exige un *Manual Deploy* del
sitio estático.

`JWT_SECRET` y `SUPERADMIN_PASSWORD` los genera Render. La contraseña del superadmin se consulta
en *Environment* del servicio de la API.

### 4. Comprobación

`https://<api>/api/v1/health` debe responder `200` con `migrations.pending: 0`. Después, entra en
el sitio estático con cualquiera de las cuentas de abajo.

---

## Cuentas de la demo

| Usuario | Contraseña | Qué enseña |
|---|---|---|
| `admin_global` | `admin123` | Las tres unidades, finanzas, inventario e informes |
| `kinderdog_admin` | `kinderdog123` | Guardería: control del día, estancias y planes |
| `pethijos_admin` | `pethijos123` | Peluquería: agenda y tablero del salón |
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

**No actives `SEED_DEMO_RESET` sobre una base de datos con datos de un cliente.** Borra todas las
filas de `daycare_pethijos`, que en algunas instalaciones es el negocio real.

---

## Antes de una presentación

Abre la URL un par de minutos antes. La primera petición despierta la API y la base de datos; a
partir de ahí responde con normalidad mientras haya tráfico.
