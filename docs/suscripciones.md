# Alta en línea y suscripciones

Un negocio puede darse de alta solo desde la página pública: elige un plan, paga con tarjeta en
PayPhone (o empieza la prueba gratuita) y entra a su espacio sin que el proveedor intervenga.
Este documento reúne las reglas, lo que hace falta para ponerlo en producción y lo que queda
pendiente. Los precios y su justificación están en `docs/argos-suite-pricing-proposal.md`.

El código vive en `backend/src/modules/suscripciones/` y el transporte hacia PayPhone en
`backend/src/core/payments/payphone.ts`.

## Reglas

- **Un plan es un preajuste.** Cada plan (`plans.ts`) es un precio y la combinación de unidades y
  módulos de producto que la consola ya sabe activar. Contratarlo escribe esas unidades y esos
  módulos; a partir de ahí el negocio se rige por sus entitlements como cualquier otro.
- **El precio lo pone el servidor.** El navegador envía el plan, las unidades y el periodo, nunca
  un importe. El cobro confirmado por PayPhone tiene que coincidir con lo presupuestado; si no, se
  reversa y no se crea nada.
- **Nada existe hasta que se demuestra algo.** Antes del pago confirmado (alta de pago) o del
  correo verificado (prueba) solo hay un `SignupIntent`. La guardería, su administrador y su
  suscripción se crean en una sola transacción.
- **Una sesión, una vez.** La primera confirmación devuelve la sesión del nuevo administrador.
  Repetirla (recargar la página de retorno, reenviar el correo) responde que el espacio ya
  existe y no entrega otra sesión.
- **Una guardería sin suscripción la gestiona el proveedor.** Las creadas desde la consola no
  tienen fila en `subscriptions`: no se les cobra, no se les avisa y no se suspenden solas.
- **La suspensión por impago no es `Daycare.isActive`.** Una guardería desactivada no puede
  iniciar sesión, y entonces tampoco podría pagar. Con la suscripción en `SUSPENDED` la sesión
  sigue siendo válida y todos los módulos responden **402** `SUBSCRIPTION_INACTIVE` salvo
  `billing`, que es donde se paga. El estado viaja con el del usuario (`core/tenancy/principal.ts`),
  así que escribirlo exige `invalidatePrincipalsForDaycare`.
- **La tarjeta se guarda solo con consentimiento**, marcado por quien paga en cada pago, y se
  puede quitar en cualquier momento desde Suscripción. Lo que se guarda es el token de PayPhone,
  cifrado; el número de la tarjeta nunca pasa por Argos Suite.

## Planes

| Plan | Unidades | Módulos además de Reservas | Mensual | Anual |
| --- | --- | --- | --- | --- |
| Inicial | 1: Guardería o Peluquería | — | $29 | $290 |
| Inicial Veterinaria | Veterinaria | — | $39 | $390 |
| Negocio | 1, cualquiera | Finanzas, Inventario, Informes, Contratos y Alertas | $49 ($59 con Veterinaria) | $490 ($590) |
| Integral | 2, cualesquiera | Los anteriores y Recordatorios | $89 | $890 |
| Integral 3 | Las 3 | Los anteriores y Recordatorios | $109 | $1.090 |

Precios antes de IVA; al cobrar se suma `BILLING_VAT_PERCENT` (15 por defecto).
`tests/billing-plans.ts` fija estos importes: cambiar uno exige cambiarlo ahí también.

Los módulos sueltos de la propuesta (Recordatorios a $15, una unidad adicional…) no se venden en
línea. Se activan desde la consola, y el precio de la suscripción se ajusta a mano.

## Los tres caminos

**Alta de pago.** `POST /signup/intents` valida, reserva el identificador, calcula el importe y
pide a PayPhone la página de pago. PayPhone devuelve el navegador a `/registro/resultado` y esa
página llama a `POST /signup/confirm`, que confirma el cobro con PayPhone y crea la guardería.
PayPhone reversa por su cuenta un pago que no se confirma en cinco minutos, así que quien no
vuelve no fue cobrado y no hay nada que limpiar.

**Prueba gratuita.** El mismo formulario sin pago. Se envía un enlace al correo (vale 48 horas) y
`POST /signup/verify` crea la guardería con las tres unidades y todos los módulos durante 30
días. Una prueba por correo y por RUC o cédula. Durante la prueba los recordatorios salen solo
por correo: cada WhatsApp lo paga la plataforma. Al terminar, la suscripción queda suspendida
hasta que el administrador elige y paga un plan; las unidades y módulos se ajustan entonces a lo
que ese plan incluye. Un plan que deje fuera una unidad con usuarios activos se rechaza antes de
cobrar.

**Pago desde dentro.** `/suscripcion` (solo `admin`) muestra el plan, los pagos y la tarjeta, y
permite pagar: el primer plan de una prueba, una renovación vencida, o la siguiente renovación
desde 15 días antes de que venza.

## Renovaciones

`npm run job:billing` (cada hora en producción; dentro del proceso web en desarrollo) recorre las
suscripciones:

| Situación | Qué hace |
| --- | --- |
| Prueba a 7 días y a 1 día de terminar | Correo de aviso |
| Prueba terminada | `SUSPENDED` y correo |
| Plan sin tarjeta, a 5 días de vencer | Correo para renovar desde la cuenta |
| Plan vencido con tarjeta guardada | La cobra. Aprobado: nuevo periodo y recibo |
| Cobro rechazado, o vencido sin tarjeta | `PAST_DUE` y correo. Conserva el acceso 7 días |
| En mora con tarjeta | Reintenta a los 1, 3 y 5 días del vencimiento |
| En mora 7 días | `SUSPENDED` y correo |

Cada cobro se reserva en la base de datos antes de hacerse (`subscription_payments.dedupeKey`),
de modo que dos ejecuciones a la vez no cobran dos veces. El periodo nuevo empieza donde
terminaba el anterior; el de una guardería suspendida, el día en que paga.

El proveedor puede corregir a mano desde la API: `PATCH /billing/tenants/:daycareId` con
`status`, `trialEndsAt` o `currentPeriodEnd` (solo `superadmin`; queda en la auditoría).

## Precio fundador

Los primeros `FOUNDER_SLOTS` negocios (20) que pagan reciben 30% menos durante 12 meses. La plaza
se asigna con el primer pago aprobado y se cuenta también la de quien está pagando en ese
momento, para no prometer una de más. En un plan anual cubre el primer año; en uno mensual, las
doce primeras cuotas. El precio de lista queda guardado en la suscripción y no cambia aunque
cambie el catálogo.

## Puesta en producción

1. **Cuenta de comercio en PayPhone** y, en PayPhone Developers, una aplicación de tipo **WEB**
   con el dominio del sitio y la URL de respuesta `https://<sitio>/registro/resultado`. El botón
   de pagos solo funciona desde el dominio registrado.
2. **Variables** (`.env.example`): `PAYPHONE_TOKEN`, `PAYPHONE_STORE_ID`,
   `BILLING_ENCRYPTION_KEY` y `PUBLIC_SITE_URL`. Con `PAYPHONE_TOKEN` definido el backend no
   arranca en producción sin las dos últimas.
3. **Correo configurado** (`SMTP_URL`, `MAIL_FROM`): sin él no hay prueba gratuita ni avisos.
4. **El job** cada hora desde el cron del host:
   `docker compose -f docker-compose.prod.yml run --rm billing`.
5. **Tokenización**, cuando el botón ya esté cobrando en producción: PayPhone la aprueba aparte,
   exige un botón activo y retiene el 10% del saldo generado con tokens durante seis meses.
   Hasta entonces no llega ningún token, ninguna tarjeta se guarda y todas las renovaciones se
   pagan desde la cuenta tras el aviso por correo. Con la aprobación, añade `PAYPHONE_CARD_KEY`.

Sin `PAYPHONE_TOKEN`, fuera de producción la pasarela es **simulada**: todo cobro se aprueba y
nada sale del proceso, salvo el documento `0000000000` y el token `sim-decline`, que se
rechazan. Así funcionan el entorno de desarrollo, CI y `test:signup`.

## Por comprobar con credenciales de prueba de PayPhone

La documentación pública no deja cerrados estos puntos y el código toma la lectura más probable:

- La longitud máxima de `clientTransactionId` (se envían 16 caracteres).
- Si el token de la tarjeta llega solo como `ctoken` en la URL de retorno o también en la
  respuesta de Confirm (se aceptan ambos).
- El cifrado del nombre del titular para cobrar con token: "AES-256-CBC sin vector de
  inicialización" se implementa con un vector de ceros y salida en base64.
- La ruta y el cuerpo de la API de reverso (`/api/Reverse` con `id`).

## Fuera de alcance

- La cuota de 500 WhatsApp al mes y el cobro del excedente.
- La factura electrónica del SRI por cada cobro: el recibo es un correo.
- Cambiar de plan con la suscripción ya pagada, y cancelarla desde la cuenta.
- Unas condiciones del servicio y una política de privacidad publicadas. El formulario pide
  aceptar la contratación y el uso de los datos, pero no enlaza a ningún texto legal.
