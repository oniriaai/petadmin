# Recordatorios a tutores

Argos Suite envía recordatorios a los tutores por **WhatsApp** o por **correo**, solos o a mano, y
deja constancia de cada envío. Es el módulo de producto `recordatorios` ("Recordatorios
automáticos"), que se contrata aparte porque cada mensaje de WhatsApp tiene un costo.

Los mensajes salen **a nombre de Argos Suite**: un único número de WhatsApp y un único dominio
de correo, los de la plataforma. El texto nombra primero al negocio ("te escribimos de …"),
porque el tutor conoce al negocio y no al software, y se firma "Enviado con Argos Suite". La
voz, los colores y el logo son los de `BRAND.md`.

## Qué se recuerda

| Tipo | De dónde sale | Envío automático |
| --- | --- | --- |
| Cita | Reservas `PENDIENTE`, `CONFIRMADA` o `PROGRAMADA` de la unidad | El día anterior |
| Vacuna | `nextDue` de la última dosis de cada vacuna | Con los días de aviso de la unidad |
| Preventivo | `nextDue` del último preventivo de cada tipo | Con los días de aviso |
| Control | `followUpDate` de una consulta sin visita posterior | Con los días de aviso |
| Laboratorio | Órdenes sin resultado | Nunca: solo a mano |

Reglas que conviene conocer:

- **Nada se encola.** La lista se calcula de los registros en cada consulta, igual que la de la
  clínica: una cita cancelada o una dosis aplicada dejan de aparecer sin más.
- **Las reservas de un plan recurrente no se recuerdan.** Una mascota que viene a diario no
  debe generar un mensaje diario.
- **Lo ya vencido no se envía solo.** Encender el envío automático no escribe a todos los
  tutores con una vacuna atrasada; eso queda para enviarlo a mano.
- **Las vacunas las recuerda una sola unidad**: la clínica si el negocio la tiene (y entonces
  ofrece la cita); si no, la primera unidad del negocio, que solo puede pedir el carnet al día.
- **Horario**: el envío automático solo actúa entre las 08:00 y las 20:00 de la zona horaria de
  la unidad.
- **Sin repeticiones**: cada envío automático se reserva antes en `reminder_messages` bajo la
  clave única `(daycareId, dedupeKey)`. Reprogramar una cita cambia la clave y se recuerda de
  nuevo. Un envío fallido se reintenta hasta tres veces.
- **Tope diario** por negocio (`REMINDERS_DAILY_CAP`, 500 por defecto), como fusible de costo.

## Qué canal recibe cada tutor

1. Si el tutor pidió **no recibir recordatorios**, no se le envía nada, ni eligiendo canal a mano.
2. Su canal preferido (ficha del tutor), o el canal por defecto de la unidad si no eligió.
3. Si le falta el dato de ese canal, el otro canal activo de la unidad.
4. Si no hay ninguno, el envío queda registrado como **Omitido** con el motivo.

Para WhatsApp se usa el campo WhatsApp del tutor y, si está vacío, el teléfono. Los números se
normalizan al formato internacional (`0991234567` → `593991234567`); el prefijo por defecto es
`DEFAULT_COUNTRY_CODE`.

La unidad decide en **Configuración** si envía sola, qué canales usa, cuál es el de por defecto,
los días de aviso y el teléfono y correo de contacto que aparecen en el mensaje. El envío
automático nace **apagado**.

## Requisitos

Para que un recordatorio llegue de verdad a un tutor tienen que cumplirse los tres niveles. Lo
que falte no rompe nada: el canal queda sin usar y el envío consta como **Omitido** o **No se
envió**, con el motivo.

### De la plataforma (el proveedor, una sola vez)

| Requisito | Para qué | Dónde se configura |
| --- | --- | --- |
| Cuenta de Meta Business verificada, con una app de WhatsApp Business | Enviar por WhatsApp | Meta Business Manager |
| Un número de teléfono para Argos Suite, que no esté en uso en la app de WhatsApp | Remitente único de todos los negocios | Meta Business Manager |
| Las seis plantillas de este documento, aprobadas por Meta | Un negocio solo puede iniciar una conversación con una plantilla aprobada | Meta Business Manager |
| Token permanente de usuario del sistema con `whatsapp_business_messaging` | Autenticar cada envío | `WHATSAPP_ACCESS_TOKEN` |
| Identificador del número en la Cloud API | Indicar desde qué número se envía | `WHATSAPP_PHONE_NUMBER_ID` |
| Método de pago en la cuenta de WhatsApp Business | Meta cobra cada mensaje de plantilla | Meta Business Manager |
| Servicio de correo transaccional con acceso SMTP | Enviar por correo | `SMTP_URL` |
| Dominio de envío con SPF y DKIM (y, recomendado, DMARC) | Que el correo no acabe en spam | DNS del dominio |
| Dirección remitente en ese dominio | Remitente único de todos los negocios | `MAIL_FROM` |
| Dirección pública del sitio | Que el correo muestre el logo | `PUBLIC_SITE_URL` en el backend |
| Un cron que ejecute el job **cada hora** | Envío automático | Cron del host (ver "El job") |
| Salida HTTPS hacia `graph.facebook.com` y hacia el servidor SMTP | Que el backend y el job alcancen a los proveedores | Red del host |

Variables de entorno, todas opcionales para arrancar. Van en el servicio `backend` (envíos a
mano) **y** en el servicio `reminders` (envío automático); `docker-compose.prod.yml` ya las pasa
a los dos.

| Variable | Obligatoria para | Por defecto |
| --- | --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | — |
| `WHATSAPP_ACCESS_TOKEN` | WhatsApp | — |
| `WHATSAPP_API_VERSION` | — | `v23.0`; conviene fijarla a la versión vigente de la Graph API |
| `SMTP_URL` | Correo | — |
| `MAIL_FROM` | Correo | — |
| `PUBLIC_SITE_URL` | Logo en el correo | Sin ella, el nombre va en texto |
| `DEFAULT_COUNTRY_CODE` | — | `593` (Ecuador) |
| `REMINDERS_DAILY_CAP` | — | `500` envíos por negocio cada 24 horas |

Un canal cuenta como configurado solo con **sus dos** variables. El token y la URL de SMTP son
secretos: no van al repositorio ni a los logs.

### Del negocio (cada guardería, peluquería o clínica)

1. Tener contratado el módulo **Recordatorios automáticos** (`recordatorios`). Lo activa el
   proveedor desde la consola de plataforma; no viene habilitado por defecto.
2. En **Configuración**, por cada unidad: elegir los canales y el canal por defecto, y escribir
   el **teléfono** y el **correo de contacto**. Sin ellos el mensaje dice "por nuestros canales de
   siempre", y las respuestas a un correo no tienen a dónde ir.
3. Para el envío automático, además, marcar **Enviar automáticamente** en esa unidad y ajustar
   los días de aviso. Sin marcarlo solo sale lo que se envíe a mano desde **Avisos a tutores**.
4. Que la zona horaria de la unidad sea la correcta: decide qué día es "mañana" y el horario
   en que se envía.

Cualquier rol operativo de la unidad puede enviar; no hace falta un permiso aparte. La
configuración es solo del administrador.

### Del tutor y sus registros

- Un **WhatsApp o teléfono** válido para WhatsApp, o un **correo** válido para correo. Los
  números sin código de país se toman como del país por defecto.
- Estar **activo** y no haber pedido **No enviar recordatorios** en su ficha.
- Para una cita: una reserva con fecha y hora, en estado `PENDIENTE`, `CONFIRMADA` o
  `PROGRAMADA`, que no venga de un plan recurrente.
- Para una vacuna o un preventivo: la **próxima dosis** (`nextDue`) registrada. Para un control:
  la fecha de control en la consulta.
- La mascota activa y no fallecida.

### Legales y de uso

- El negocio debe contar con el **consentimiento del tutor** para escribirle por estos medios;
  WhatsApp lo exige en sus políticas y la normativa de protección de datos también. La ficha del
  tutor es donde se registra que no quiere recibirlos.
- Las plantillas son de categoría **Utility**: recordatorios de un servicio ya contratado. No se
  usan para promociones.

## Puesta en marcha

Sin credenciales, fuera de producción los canales son **simulados**: el mensaje se escribe en el
log del servidor y se registra como enviado. Así funcionan el stack de desarrollo y la CI. En
producción, un canal sin credenciales simplemente no está disponible. La demo pública corre con
`NODE_ENV=production` y solo tiene correo: ahí WhatsApp no está disponible y los tutores sembrados
reciben en la bandeja de pruebas de Resend (`docs/demo-hosting.md`).

Para comprobar una instalación: `GET /reminders/channels` debe responder `live` en cada canal
configurado, y un envío a mano a un tutor de prueba debe llegar y quedar como **Enviado** en la
pestaña Enviados.

### WhatsApp (Meta Cloud API)

1. Crear la cuenta en Meta Business, la app de WhatsApp y registrar el número de Argos Suite.
2. Dar de alta las seis plantillas de abajo, categoría **Utility**, idioma **Spanish (`es`)**,
   con el cuerpo y el pie exactos. Meta las revisa antes de permitir su uso.
3. Generar un token permanente de usuario del sistema con `whatsapp_business_messaging`.
4. Definir `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN` (y `WHATSAPP_API_VERSION` si
   hace falta fijar otra versión de la Graph API).

Un negocio solo puede iniciar una conversación con una plantilla aprobada, por eso el texto no
es editable desde la aplicación: cambiarlo es cambiar `templates.ts` **y** la plantilla en Meta.
`tests/reminders-module.ts` comprueba que cada cuerpo use `{{1}}…{{n}}` en orden.

### Correo (SMTP con Resend)

El código habla SMTP y sirve con cualquier proveedor; el elegido es [Resend](https://resend.com).
El plan gratuito (3.000 correos al mes, 100 al día) alcanza para desarrollo y los primeros
clientes.

1. Crear la cuenta en Resend.
2. **Dominio**: en *Domains → Add Domain*, añadir `avisos.oniriasolutions.com`. Es un
   **subdominio** dedicado al envío, no el dominio raíz, para aislar su reputación. Resend
   muestra los registros de SPF y DKIM que hay que crear; el DNS de `oniriasolutions.com` está
   en **Cloudflare**, y ahí se crean en modo **DNS only** (nube gris, sin proxy). Añadir además
   un registro DMARC en `_dmarc.avisos`. Esperar a que el dominio figure como verificado.
3. **API key**: en *API Keys*, crear una con permiso **Sending access** limitada a ese dominio.
   Es la contraseña SMTP; se muestra una sola vez.
4. Definir las variables en el host (servicios `backend` y `reminders`):

   ```bash
   SMTP_URL=smtps://resend:LA_API_KEY@smtp.resend.com:465
   MAIL_FROM=Argos Suite <recordatorios@avisos.oniriasolutions.com>
   ```

   La dirección `recordatorios@` no necesita buzón: nadie le escribe, porque las respuestas van
   al correo de contacto de cada unidad (`Reply-To`).

   El usuario SMTP es siempre `resend`. El puerto 465 es TLS implícito (`smtps://`); con 587
   sería `smtp://` y STARTTLS.
5. Definir `PUBLIC_SITE_URL` en el backend para que el correo muestre el logo
   (`/brand/argos-suite-lockup.png`, servido por el frontend). Sin ella, el nombre va en texto.
6. Comprobarlo sin tocar ningún dato: envía un recordatorio de muestra a la dirección que digas.

   ```bash
   cd backend
   SMTP_URL=... MAIL_FROM=... npm run mail:test -- tu@correo.com
   ```

Antes de tener un dominio verificado, Resend solo deja enviar desde `onboarding@resend.dev` y
solo a la dirección de la propia cuenta. Sirve para una primera prueba con `mail:test`, no para
escribir a tutores.

Resend ofrece webhooks de entrega y rebote en todos los planes. Hoy no se usan: "Enviado" sigue
significando que el proveedor aceptó el mensaje (ver "Lo que todavía no hace").

Las respuestas a un correo llegan al **correo de contacto** de la unidad (`Reply-To`).

### El job

En producción el envío automático no corre dentro del proceso web. Se invoca **cada hora** desde
el cron del host:

```bash
docker compose -f docker-compose.prod.yml run --rm reminders
```

Sale con código distinto de cero si algún envío falla. En desarrollo corre dentro del proceso
web cada hora (`RUN_SCHEDULER_IN_PROCESS`); a mano, `npm run job:reminders`.

## Plantillas de WhatsApp

### `argos_recordatorio_cita`

Cita, reserva o consulta del día siguiente (las tres unidades).

**Cuerpo**

```text
Hola {{1}}, te escribimos de {{2}}. Te recordamos la {{3}} de {{4}} el {{5}} a las {{6}}. Si necesitas cambiarla, escríbenos {{7}}.
```

**Pie**

```text
Enviado con Argos Suite. Este número no recibe respuestas.
```

| Variable | Contenido | Ejemplo |
| --- | --- | --- |
| `{{1}}` | tutor | Ana |
| `{{2}}` | negocio | Peluquería Canina Luna |
| `{{3}}` | servicio | cita de peluquería |
| `{{4}}` | mascota | Max |
| `{{5}}` | fecha | miércoles 7 de octubre |
| `{{6}}` | hora | 10:00 |
| `{{7}}` | contacto | al 099 123 4567 |

Vista previa: Hola Ana, te escribimos de Peluquería Canina Luna. Te recordamos la cita de peluquería de Max el miércoles 7 de octubre a las 10:00. Si necesitas cambiarla, escríbenos al 099 123 4567.

### `argos_recordatorio_vacuna`

Refuerzo de vacuna, cuando el negocio tiene clínica.

**Cuerpo**

```text
Hola {{1}}, te escribimos de {{2}}. {{3}} tiene pendiente el refuerzo de {{4}}, previsto para el {{5}}. Para agendar su cita, escríbenos {{6}}.
```

**Pie**

```text
Enviado con Argos Suite. Este número no recibe respuestas.
```

| Variable | Contenido | Ejemplo |
| --- | --- | --- |
| `{{1}}` | tutor | Ana |
| `{{2}}` | negocio | Clínica Veterinaria Sur |
| `{{3}}` | mascota | Max |
| `{{4}}` | vacuna | Antirrábica |
| `{{5}}` | fecha | 12 de octubre |
| `{{6}}` | contacto | al 099 123 4567 |

Vista previa: Hola Ana, te escribimos de Clínica Veterinaria Sur. Max tiene pendiente el refuerzo de Antirrábica, previsto para el 12 de octubre. Para agendar su cita, escríbenos al 099 123 4567.

### `argos_aviso_vacuna`

Vacuna por renovar, cuando el negocio no tiene clínica.

**Cuerpo**

```text
Hola {{1}}, te escribimos de {{2}}. Según nuestra ficha, {{3}} tiene pendiente renovar la vacuna {{4}}, prevista para el {{5}}. Cuando la tenga al día, cuéntanos {{6}} y actualizamos su ficha.
```

**Pie**

```text
Enviado con Argos Suite. Este número no recibe respuestas.
```

| Variable | Contenido | Ejemplo |
| --- | --- | --- |
| `{{1}}` | tutor | Ana |
| `{{2}}` | negocio | Guardería Patitas |
| `{{3}}` | mascota | Max |
| `{{4}}` | vacuna | Antirrábica |
| `{{5}}` | fecha | 12 de octubre |
| `{{6}}` | contacto | al 099 123 4567 |

Vista previa: Hola Ana, te escribimos de Guardería Patitas. Según nuestra ficha, Max tiene pendiente renovar la vacuna Antirrábica, prevista para el 12 de octubre. Cuando la tenga al día, cuéntanos al 099 123 4567 y actualizamos su ficha.

### `argos_recordatorio_preventivo`

Próxima dosis de un preventivo.

**Cuerpo**

```text
Hola {{1}}, te escribimos de {{2}}. {{3}} tiene pendiente su próxima dosis de {{4}}, prevista para el {{5}}. Para agendar su cita, escríbenos {{6}}.
```

**Pie**

```text
Enviado con Argos Suite. Este número no recibe respuestas.
```

| Variable | Contenido | Ejemplo |
| --- | --- | --- |
| `{{1}}` | tutor | Ana |
| `{{2}}` | negocio | Clínica Veterinaria Sur |
| `{{3}}` | mascota | Max |
| `{{4}}` | producto | Bravecto |
| `{{5}}` | fecha | 12 de octubre |
| `{{6}}` | contacto | al 099 123 4567 |

Vista previa: Hola Ana, te escribimos de Clínica Veterinaria Sur. Max tiene pendiente su próxima dosis de Bravecto, prevista para el 12 de octubre. Para agendar su cita, escríbenos al 099 123 4567.

### `argos_recordatorio_control`

Control pendiente de agendar.

**Cuerpo**

```text
Hola {{1}}, te escribimos de {{2}}. {{3}} tiene un control pendiente, previsto para el {{4}}. Para agendar su cita, escríbenos {{5}}.
```

**Pie**

```text
Enviado con Argos Suite. Este número no recibe respuestas.
```

| Variable | Contenido | Ejemplo |
| --- | --- | --- |
| `{{1}}` | tutor | Ana |
| `{{2}}` | negocio | Clínica Veterinaria Sur |
| `{{3}}` | mascota | Max |
| `{{4}}` | fecha | 12 de octubre |
| `{{5}}` | contacto | al 099 123 4567 |

Vista previa: Hola Ana, te escribimos de Clínica Veterinaria Sur. Max tiene un control pendiente, previsto para el 12 de octubre. Para agendar su cita, escríbenos al 099 123 4567.

### `argos_aviso_laboratorio`

Resultado de laboratorio que aún no llega (solo envío manual).

**Cuerpo**

```text
Hola {{1}}, te escribimos de {{2}}. Seguimos a la espera del resultado de {{3}} de {{4}}. Te avisaremos en cuanto llegue.
```

**Pie**

```text
Enviado con Argos Suite. Este número no recibe respuestas.
```

| Variable | Contenido | Ejemplo |
| --- | --- | --- |
| `{{1}}` | tutor | Ana |
| `{{2}}` | negocio | Clínica Veterinaria Sur |
| `{{3}}` | examen | hemograma |
| `{{4}}` | mascota | Max |

Vista previa: Hola Ana, te escribimos de Clínica Veterinaria Sur. Seguimos a la espera del resultado de hemograma de Max. Te avisaremos en cuanto llegue.

## Lo que todavía no hace

- **Confirmación de entrega y de lectura.** "Enviado" significa que el proveedor aceptó el
  mensaje; saber si llegó necesita un webhook público que aún no existe.
- **Respuestas del tutor.** El número no recibe respuestas; el mensaje indica cómo escribir al
  negocio.
- **Aviso de "mascota lista"** en peluquería y confirmación al agendar.
- **Un número de WhatsApp por negocio.**
