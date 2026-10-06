# Argos Suite: pricing proposal

Draft, revised 6 October 2026 for the Recordatorios automáticos module. All prices in USD,
before IVA (15%), per tenant (one business).

**What changed in this revision:** Recordatorios is priced as an add-on ($15 with 500 WhatsApp
messages a month) and is now included in Integral, which goes from $79/$99 to $89/$109. Single-unit
plans keep their prices. A WhatsApp overage rate is added, and reminders are taken off the list of
gaps.

## What the price is built on

From the repository:

- **Market is Ecuador.** `BRAND.md` positions the product for Ecuadorian daycares, groomers and
  clinics; the default timezone is `America/Guayaquil` and the UI formats money as `es-EC` / USD.
  So USD is the local currency, no FX layer needed.
- **The sellable units already exist.** `backend/src/platform/product-modules.ts` defines Núcleo
  (always on), Reservas y Agenda, the three units (Guardería, Peluquería, Veterinaria, each
  requiring Reservas) and five add-ons (Finanzas, Inventario, Informes, Contratos y Alertas,
  Recordatorios automáticos). The vendor console already toggles these per tenant, and the API
  enforces them.
- **There are no seat, location or volume limits in code.** Users per tenant are unlimited and
  nothing counts appointments or pets. Pricing per seat would need new enforcement; pricing per
  business unit and module needs none.
- **Remaining gaps versus local competitors** (`BRAND.md`, "Claims the brand does not make"): no
  SRI electronic invoicing and no pet-owner app.

### How reminders cost money

From `docs/recordatorios.md` and `modules/recordatorios/send.service.ts`:

- Every WhatsApp reminder goes out from **one Argos Suite number**, so **the vendor pays Meta for
  every message**, for every tenant. Email goes through one platform domain (Resend), which costs
  next to nothing per message.
- Messages are Utility templates. Meta charges **$0.0113 per Utility message** in "Rest of Latin
  America", which includes Ecuador (per-message billing from 1 October 2026).
- Reminders cover next-day appointments, vaccines, preventives and follow-up visits. Recurring
  daycare stays are never reminded, so a daily guest doesn't trigger a daily message.
- The only limit in code is `REMINDERS_DAILY_CAP`: 500 sends per tenant per 24 hours, one global
  setting. It's a fuse against a runaway bill, not a plan quota. At that cap, one tenant could
  cost about **$170 a month** in WhatsApp fees.

Typical usage is far lower. A groomer with 300 appointments a month sends about 300 reminders
($3.40). A clinic with 300 appointments plus 200 vaccine and follow-up reminders sends about 500
($5.65).

## Competitor anchors

| Product | Focus | Price (USD/month) | Notes |
| --- | --- | --- | --- |
| Pegazoo (Ecuador) | Vet | 21.40 (1 user) to 43.00 (3 to 5 users) | Annual ~17% cheaper; SRI invoicing and SMS reminders are add-ons |
| GVET (LatAm) | Vet | 20 (Plus) / 25 (Gold) per member | SRI invoicing in Gold; 3 months free trial |
| Wakyma Vets (Ecuador) | Vet | 49 flat | Unlimited users, SRI invoicing, WhatsApp, owner app |
| MoeGo (US) | Grooming | 49 / 99 / 159 | Per van or location; 200 to 900 SMS included, overage billed |
| Gingr (US) | Daycare + grooming | 105 (Spa) / 145 (Play) / 155 (Stay) | Stay tier bundles daycare + grooming |

Takeaways: a single-unit vet clinic in Ecuador pays **$20 to $49**. Nobody local sells daycare +
grooming + vet in one system with separate books; the nearest equivalent is US software at
**$105 to $155**, priced for US businesses. Message-based features are sold with an included
quota and overage (MoeGo, AgendaPro).

## Proposed plans

Every plan includes Núcleo + Reservas y Agenda, unlimited users, unlimited clients and pets,
and support by WhatsApp/email.

| Plan | What's in it | Monthly | Annual (2 months free) |
| --- | --- | --- | --- |
| **Inicial** | 1 unit (Guardería or Peluquería) | **$29** | $290 |
| **Inicial Veterinaria** | Veterinaria unit | **$39** | $390 |
| **Negocio** | 1 unit + Finanzas, Inventario, Informes, Contratos y Alertas | **$49** ($59 with Veterinaria) | $490 ($590) |
| **Integral** ⭐ | 2 units + all add-ons, **Recordatorios included** | **$89** | $890 |
| **Integral 3** | All 3 units + all add-ons, **Recordatorios included** | **$109** | $1,090 |

À la carte, for tenants on Inicial or Negocio who want one extra piece:

| Add-on | Monthly |
| --- | --- |
| Recordatorios automáticos | $15, with 500 WhatsApp messages and unlimited email |
| Finanzas | $12 |
| Inventario | $9 |
| Informes y Exportación | $9 |
| Contratos y Alertas | $7 |
| Extra business unit | $25 ($35 for Veterinaria) |

The other four add-ons bought separately total $37, so Negocio ($49 = $29 + $20) is the obvious
upgrade.

**WhatsApp beyond the included 500** (in the add-on or in Integral): $2.50 per extra block of 100
messages, billed the following month. Email has no limit.

## Why these numbers

- **Inicial at $29** sits between Pegazoo/GVET and Wakyma, and well below MoeGo's US entry.
  It's the "try it on one unit" price for a small groomer or daycare.
- **Veterinaria at $39/$59.** With reminders, a clinic on Negocio Veterinaria + Recordatorios pays
  $74, versus Wakyma's $49 with SRI invoicing. That's acceptable only if the clinic also runs
  grooming or daycare, which is Integral's job. For a clinic alone, the fallback is to sell
  Recordatorios at $10 to vet-only tenants until SRI invoicing ships.
- **Recordatorios at $15** is priced on cost and value. 500 messages cost the vendor about $5.65,
  so the add-on keeps a margin of about 60% at full use and more for most tenants. For a groomer,
  avoiding one or two no-shows a month pays for it.
- **Overage at $0.025 a message** is about 2.2 times Meta's rate. It covers the vendor's cost and
  stops a large tenant from turning a flat fee into a loss.
- **Integral is the plan to sell, and reminders make it stronger.** The brand's core message is
  "one record for each pet across clinic, grooming and daycare". A vaccine reminder that books
  the clinic visit, for a pet that also comes to grooming, is that message in practice. Bundling
  Recordatorios adds $10 to the price ($89 against $79 + $15 = $94 à la carte) and keeps the two-
  and three-unit plans at roughly 60 to 70% of the US benchmark.
- **Unlimited users** matches the code (no seat counting) and removes the main friction of
  per-member pricing (GVET, Pegazoo). It also suits front desks where staff share shifts.
- **Annual = 10 months** is the regional norm (AgendaPro, Pegazoo) and helps cash flow. The
  WhatsApp quota stays monthly on annual plans.

## Launch levers

- **Precio fundador**: first 20 tenants get 30% off for 12 months, with the price locked. The
  discount doesn't apply to WhatsApp overage, which is cost-driven.
- **Free onboarding and data migration** for annual plans (Wakyma gives migration free, so a
  paid one would be a disadvantage). One-time setup fee of $99 on monthly plans, waived for
  founders.
- **30-day free trial** on Integral, set up from the vendor console (all modules toggled on).
  Reminders stay on email only during the trial, so a trial costs nothing in WhatsApp fees.

## What to revisit once these ship

| Feature | Effect on price |
| --- | --- |
| SRI electronic invoicing | Raise Negocio/Integral by ~$10, or sell as a $15 add-on. It's the most-requested feature in local vet tools |
| A per-tenant WhatsApp sender | Lets a tenant pay Meta directly; Recordatorios could then drop to $9 with no quota |
| Multiple locations (sedes) | Price per location; today a tenant is one business |

## What this needs in the product

The plans themselves need nothing new: each one is a preset of product modules the console
already toggles. Reminders need two things before the quota and overage can be billed:

- **A monthly count of WhatsApp sends per tenant.** `reminder_messages` already records each send
  with its channel and status, so this can be a report or a console view, with no new tracking.
- **A per-tenant cap**, if a monthly quota should stop sending rather than bill overage. Today the
  only cap is the global daily fuse of 500.

**Shipped since this revision** (`docs/suscripciones.md`): the five plans as presets, a public
pricing section and self-service signup with payment through PayPhone, the 30-day trial, the
founder price, and a recorded plan and billing period per tenant. Two things here differ from the
proposal: the trial needs no vendor setup, and the $99 setup fee is not charged. À la carte
add-ons, the WhatsApp quota and overage are still set up by hand from the console.

## Sources

- Gingr: https://toolradar.com/tools/gingr/pricing (verified Sept 2026)
- MoeGo: https://toolradar.com/tools/moego/pricing
- Pegazoo: https://www.pegazoo.ec/precios-software-veterinario
- Wakyma Vets Ecuador: https://wakymavets.com/ec/
- GVET: https://www.comparasoftware.ec/gvet-software-veterinario
- AgendaPro: https://agendapro.com/planes
- WhatsApp Business rates by country: https://sleekflow.io/en-us/blog/whatsapp-business-price
