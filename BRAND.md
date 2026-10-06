---
name: Argos Suite
description: Business management software for pet daycares, grooming salons and veterinary clinics in Ecuador.
colors:
  marmol: "#faf8f5"
  surface: "#ffffff"
  tinta: "#1c1917"
  tinta-ink-on-dark: "#fafaf9"
  tinta-muted-on-dark: "#a8a29e"
  piedra: "#57534e"
  piedra-clara: "#d6d3d1"
  piedra-sutil: "#e7e5e4"
  piedra-hover: "#f5f5f4"
  azul-egeo: "#1d4ed8"
  azul-egeo-hondo: "#1e3a8a"
  azul-foco: "#2563eb"
  terracota-50: "#fff7ed"
  terracota-100: "#ffedd5"
  terracota-200: "#fed7aa"
  terracota-500: "#ea580c"
  terracota-600: "#c2410c"
  terracota-700: "#9a3412"
  terracota-800: "#7c2d12"
  terracota-900: "#431407"
  purpura-50: "#faf5ff"
  purpura-100: "#f3e8ff"
  purpura-200: "#e9d5ff"
  purpura-500: "#a855f7"
  purpura-600: "#9333ea"
  purpura-700: "#7e22ce"
  purpura-800: "#6b21a8"
  purpura-900: "#581c87"
  olivo-50: "#f7fee7"
  olivo-100: "#ecfccb"
  olivo-200: "#d9f99d"
  olivo-500: "#84cc16"
  olivo-600: "#65a30d"
  olivo-700: "#4d7c0f"
  olivo-800: "#3f6212"
  olivo-900: "#365314"
  oro: "#ca8a04"
  indigo-consola: "#6366f1"
  indigo-consola-hondo: "#4f46e5"
  peligro: "#b91c1c"
typography:
  wordmark:
    fontFamily: "Cinzel, 'Times New Roman', serif"
    fontWeight: 700
    letterSpacing: "0.1em"
  display:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 400
    lineHeight: 1.1
  headline:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum' 1"
  label:
    fontFamily: "Inter, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.05em"
rounded:
  md: "8px"
  lg: "12px"
  full: "9999px"
components:
  button-primary:
    backgroundColor: "{colors.azul-egeo}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.azul-egeo-hondo}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.piedra}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.piedra-hover}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  shell:
    backgroundColor: "{colors.tinta}"
    textColor: "{colors.tinta-ink-on-dark}"
  badge-guarderia:
    backgroundColor: "{colors.terracota-50}"
    textColor: "{colors.terracota-800}"
    rounded: "{rounded.full}"
  badge-peluqueria:
    backgroundColor: "{colors.purpura-50}"
    textColor: "{colors.purpura-700}"
    rounded: "{rounded.full}"
  badge-veterinaria:
    backgroundColor: "{colors.olivo-50}"
    textColor: "{colors.olivo-800}"
    rounded: "{rounded.full}"
---

# Brand identity: Argos Suite

This file is the source of truth for branding this repository as **Argos Suite**. The frontmatter holds machine-readable tokens; the sections below explain how to apply them. `PRODUCT.md` stays the source of truth for what the product does.

Decided on 4 Oct 2026, and extended the same day for the veterinary unit (Argos Veterinaria), which shipped in PR #14. The full rationale lives in the project's rebranding guide; this file keeps only what an implementer needs.

## Name and architecture

| Level | Name | Where it appears |
| --- | --- | --- |
| Master brand | Argos | The short name people say; social handles |
| Product | Argos Suite | Login screen, browser title, user guide, website, contracts, invoices |
| Descriptor | Argos Suite · Gestión de guarderías, peluquerías y veterinarias | Login screen, website header |
| Business units | Argos Guardería, Argos Peluquería, Argos Veterinaria | Pricing pages, unit selector, unit badges |
| Modules | Argos Finanzas, Argos Inventario, Argos Informes, Argos Contratos | Pricing pages, module badges |
| Tenant brands | Each customer's own name | Inside the app shell, which already shows the tenant's name |

- Write "Argos Suite" with a normal A everywhere in text. The Greek lambda (Λ) belongs only to the drawn logo.
- A tenant's brand is never the product's. Do not rename the `DAYCARE` / `GROOMING` / `VETERINARY` identifiers.
- Keep the interface vocabulary: "Mascotas" for pets, "Tutor", "Cupos", "Guardería", "Peluquería", and "Veterinaria" for the third unit.
- **Argos Veterinaria** is the third business unit (`VETERINARY`, role `veterinary`, module `veterinaria`), next to Guardería and Peluquería, with its own books. It covers the consultation agenda and waiting room, the clinical record and patient history, vaccines and preventive care, prescriptions and pharmacy, hospitalization, procedures with consent, laboratory and imaging, and collection when the visit closes.

**The story.** Argos, Odysseus's dog, waited 20 years and was the only one to recognize him when he came home. Argus, the hundred-eyed watchman, never stopped watching. Argos Suite watches over the business and keeps every record faithfully, so owners can spend their time with the animals. With the veterinary unit, that faithful record follows each pet from the clinic to the groomer and the daycare.

## Positioning

Argos Suite is business management software for pet daycares, grooming salons and veterinary clinics in Ecuador. The buyer is the owner or administrator. It puts reservations, capacity, grooming, clinical records, staff, finances, inventory and reports in one place, with each business unit's books kept apart.

The veterinary unit adds one message: **one record for each pet across the clinic, the grooming salon and the daycare.** It speaks most to businesses that run a clinic alongside grooming or boarding. Lead with management, not medicine: Argos Suite runs the clinic as a business, from the agenda and the clinical record to the pharmacy and the bill, with its books kept apart from grooming and daycare.

| Level | Spanish copy |
| --- | --- |
| Tagline | Cuidamos tu negocio, para que tú cuides de ellos. |
| Brand line | Todo tu negocio, a la vista y en buenas manos. |
| Veterinary line | Una sola ficha para cada mascota: de la consulta a la peluquería y la guardería. |
| Elevator pitch | Argos Suite acompaña a las guarderías, peluquerías y veterinarias de mascotas de Ecuador para que administren su negocio con tranquilidad. Reservas, cupos, citas, fichas clínicas, personal, cobros e inventario en un solo lugar, con las cuentas de cada unidad por separado. Tú dedicas tu tiempo a las mascotas; nosotros te ayudamos con el resto. Contratas solo los módulos que usas. |

Do not claim what has not shipped: SRI electronic invoicing, automatic reminders (the clinic still sends them by hand from its own WhatsApp), a printable vaccination card or file attachments on lab results and consents. Do not give medical advice in product copy, or invent customer numbers, testimonials, time savings or prices (see `PRODUCT.md`).

## Voice

Warm and close: a trusted colleague who loves animals and knows the business. Neutral Latin American Spanish, **tú** in the product, **usted** in contracts and invoices with the same warmth.

- **Cercana:** use the person's name and the pet's name; offer help.
- **Cálida:** notice good moments; thank people for their work.
- **Clara:** every message says what happened and what to do next.
- **Honesta:** no invented figures or promises.
- In the clinic, warmth never softens facts: diagnoses, doses and dates are written plainly and exactly.
- Not cutesy: no baby talk, at most one exclamation mark, an emoji only in a celebration and never in an error. Never word the "hundred eyes" as surveillance of staff or clients.

| Moment | Write | Avoid |
| --- | --- | --- |
| Welcome | ¡Hola, Ana! Hoy tienes 8 mascotas en guardería y 5 citas en peluquería. | Bienvenido al sistema. |
| Capacity error | La Sala Grande ya está completa (12 de 12). ¿La ubicamos en otra sala o esperamos una salida? | Error: capacidad excedida. |
| Grooming done | ¡Luna quedó lista! Avísale a su tutora que ya puede pasar por ella. | Servicio terminado con éxito. |
| Empty state | Hoy todavía no hay citas. ¿Agendamos la primera? | No hay datos. |
| Vaccine due | La vacuna antirrábica de Max vence el 12 de octubre. ¿Le agendamos la cita? | Alerta: vacuna vencida. |
| Consultation saved | Listo, la consulta de Toby quedó en su ficha. Su tutor puede verla cuando la necesite. | Registro guardado. |
| Module not bought | Este módulo aún no está en tu plan. Escríbenos y te ayudamos a activarlo. | Acceso denegado (403). |

Names and numbers in these examples are illustrative; real copy reads them from data.

## Logo

The logo is the Vasija de figuras negras: Argos the hound in Tinta on a terracotta disc, like black-figure vase painting.

| Mark | What it is | Use it for | Minimum size |
| --- | --- | --- | --- |
| Lockup | The disc beside a ΛRGOS wordmark, SUITE below, meander band underneath | Login screen, sidebar, website, contracts, invoices | 120 px wide |
| Mark | The disc and hound alone | Avatars, signage, merchandise, tight headers | 48 px |
| Small mark | The hound enlarged inside the disc, eye dropped | Favicon, app icon, collapsed sidebar | 16 px |

- The logo's colors are fixed: Terracota disc, SUITE and meander; Tinta hound. The wordmark is Tinta on light backgrounds (`color`) and Mármol on the dark shell and the platform console (`on-dark`).
- The logo does not take a unit's color, and no second meander goes beside it. A unit's color shows in the interface around it.
- One-color printing uses `mono-black` or `mono-white`, with the hound cut out of the disc.
- Keep clear space around the logo at least as tall as the Λ. The lockup file carries less than that, so the layout supplies it.
- Do not redraw the hound, stretch or rotate the lockup, or add shadows or gradients.
- Assets live under `frontend/src/assets/brand/` (SVG, PDF, PNG exports and the script that builds them); the favicon set is at the root of `frontend/public/`. In the app, use `Lockup` and `Mark` from `src/components/brand/Logo.tsx`.

## Colors

Warm marble and black-figure ink, with Aegean blue as the brand color and one accent per business unit.

### Primary
- **Azul Egeo** (#1d4ed8): primary buttons, links, focus, the meander band. 6.7 : 1 on white. Hover is **Azul Egeo hondo** (#1e3a8a).

### Business units
- **Terracota** (Guardería): 500 #ea580c for fills, bars and the vase disc; 600 #c2410c and darker for text (4.9 : 1 on Mármol). Replaces the amber `daycare` ramp.
- **Púrpura de Tiro** (Peluquería): 500 #a855f7 for fills; 600 #9333ea and darker for text (5.1 : 1 on Mármol). Replaces the violet `grooming` ramp.
- **Verde Olivo** (Veterinaria): the olive tree of Athena, and a calm green that reads as health. 500 #84cc16 and 600 #65a30d for fills only; 700 #4d7c0f and darker for text (4.7 : 1 on Mármol, 5.0 : 1 on white). Replaces the teal `veterinary` ramp the unit shipped with, which sat too close to Azul Egeo and read as cool next to the warm palette. Keep it apart from success green: olive marks the unit, never a status.

### Neutral
- **Mármol** (#faf8f5): page canvas. Surfaces and cards stay white.
- **Tinta** (#1c1917): body text, headings, wordmark, and the app shell. 16.5 : 1 on Mármol.
- **Piedra** (#57534e): secondary text. 7.2 : 1 on Mármol.
- **Piedra clara** (#d6d3d1) and **Piedra sutil** (#e7e5e4): borders and dividers, never text.
- On the Tinta shell: text #fafaf9 (16.7 : 1), muted text #a8a29e (6.9 : 1).

### Accent and special
- **Oro** (#ca8a04): decorative only, such as the meander on the dark shell (6.0 : 1 on Tinta). Never text on light backgrounds.
- **Índigo consola** (#6366f1): the vendor console only, via `[data-theme="platform"]`, so it never looks like a tenant screen. Unchanged.
- Danger red (#b91c1c) and success green are unchanged.

### Named rules
**The Text Shade Rule.** A unit's 500 shade is never text on a light background. Text starts at 600 for terracotta and purple, and at 700 for olive, whose 600 is only 2.9 : 1.
**The One Unit Rule.** A screen shows one unit color. The consolidated admin view stays neutral, with small terracotta, purple and olive badges.
**The Warm Neutral Rule.** Stone grays replace slate and gray everywhere, so screens match the marble and ink of the logo.
**The Brand-Not-UI Rule.** Black-figure styling (Tinta on terracotta) is for signage and merchandise, not for app screens.

Contrast ratios are WCAG 2 values computed from the hex codes.

## Typography

**Wordmark font:** Cinzel, all caps, 600 to 700.
**Headline font:** Marcellus, 400.
**Interface font:** Inter, 400 to 600.

**Character:** inscriptional, carved-stone capitals and flared headlines carry the Greek look; Inter keeps dense daily screens plain and readable. All three are free on Google Fonts and cover Spanish accents (á é í ó ú ñ ¿ ¡); Inter also includes Λ.

### Hierarchy
- **Wordmark** (Cinzel 700, letter spacing 0.1em): logo, signage, website section openers.
- **Display** (Marcellus 400, 36 px, line height 1.1): login headline, website hero.
- **Headline** (Marcellus 400, 24 px, line height 1.2): page titles (`.page-title`).
- **Body** (Inter 400, 14 px, line height 1.5): all interface text, tables, forms.
- **Label** (Inter 600, 12 px, letter spacing 0.05em, uppercase): table headers, small labels.

### Named rules
**The 20 Pixel Rule.** Cinzel and Marcellus only at 20 px and up; never in tables, forms or Kanban cards.
**The Tabular Rule.** Use `font-variant-numeric: tabular-nums` wherever money, times or capacity line up.
**The Self-Host Rule.** Ship the font files with the frontend; the front desk should not wait on a third-party request.

## Shapes

Keep the current shape language: 8 px radius (`rounded-lg`) for buttons and inputs, 12 px (`rounded-xl`) for cards and the logo tile, fully rounded badges. The meander is drawn as an SVG shape (divider or border), never built from text characters.

## Do's and Don'ts

- **Do** read colors from tokens (`bg-canvas`, `text-ink`, `bg-action`, `daycare-*`, `grooming-*`, `veterinary-*`), never raw Tailwind palette classes.
- **Do** keep the vendor console visibly different from tenant screens.
- **Do** write every error, empty state and confirmation in the warm voice above.
- **Don't** put the Λ, Cinzel or Marcellus in running text or small UI.
- **Don't** mix unit colors (terracotta, purple, olive) in one component.
- **Don't** use clinical imagery (syringes, crosses, pills) in the logo or app chrome; the hound stays the only mark.
- **Don't** reuse the paw emoji or the Lucide PawPrint as the brand mark once the Sello griego exists.

## Implementation map

Every in-app change lives in a handful of files. Token **names** stay the same, so components do not change; only values do.

### CSS variables (`frontend/src/styles.css`, `:root`)

| Variable | Current | New |
| --- | --- | --- |
| `--color-canvas` | #f8fafc | #faf8f5 |
| `--color-surface` | #ffffff | #ffffff |
| `--color-raised` | #ffffff | #ffffff |
| `--color-shell` | #111827 | #1c1917 |
| `--color-shell-ink` | #f9fafb | #fafaf9 |
| `--color-shell-muted` | #9ca3af | #a8a29e |
| `--color-ink` | #0f172a | #1c1917 |
| `--color-muted` | #475569 | #57534e |
| `--color-border` | #cbd5e1 | #d6d3d1 |
| `--color-border-subtle` | #e2e8f0 | #e7e5e4 |
| `--color-action` | #1d4ed8 | #1d4ed8 |
| `--color-action-hover` | #1e40af | #1e3a8a |
| `--color-focus` | #2563eb | #2563eb |
| `--shadow-raised`, `--shadow-overlay` | `rgb(15 23 42 / …)` | `rgb(28 25 23 / …)` |

Leave `[data-theme="platform"]` as it is.

### Tailwind ramps (`frontend/tailwind.config.js`)

| Key | 50 | 100 | 200 | 500 | 600 | 700 | 800 | 900 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `daycare` | #fff7ed | #ffedd5 | #fed7aa | #ea580c | #c2410c | #9a3412 | #7c2d12 | #431407 |
| `grooming` | #faf5ff | #f3e8ff | #e9d5ff | #a855f7 | #9333ea | #7e22ce | #6b21a8 | #581c87 |
| `veterinary` | #f7fee7 | #ecfccb | #d9f99d | #84cc16 | #65a30d | #4d7c0f | #3f6212 | #365314 |

The ramps add a 200 shade because `ConsultaInpatientPanels.tsx` already uses `border-veterinary-200`, which the current config does not define, so that border renders with no color today.

### Everything else

| Touchpoint | Change | File |
| --- | --- | --- |
| Product name | "Argos Suite" everywhere | `frontend/src/pages/Login.tsx`, `frontend/src/components/layout/AppShell.tsx`, `frontend/src/pages/GuidePage.tsx`, `README.md`, `PRODUCT.md`, `CLAUDE.md` |
| Browser title and favicon | "Argos Suite"; Sello griego replaces the paw emoji | `frontend/index.html` |
| Login screen | Lockup, descriptor, Marcellus headline, warm welcome line | `frontend/src/pages/Login.tsx` |
| Fonts | Self-host Cinzel, Marcellus, Inter; body font becomes Inter | `frontend/src/styles.css` and new font files |
| Component classes | `gray-*` utilities in `.sidebar-link`, `.input:disabled`, `.label`, `.card`, `.page-title`, `.table-*` become stone or tokens; `#f1f5f9` hovers become #f5f5f4 | `frontend/src/styles.css` |
| Raw palette classes | `text-blue-*`, `bg-amber-*`, `text-violet-*`, `text-indigo-*` in pages become `action`, `daycare`, `grooming` tokens | `frontend/src/pages/`, `frontend/src/components/` |
| Veterinaria unit | Swap the teal `veterinary` ramp for Verde Olivo; check the unit's active sidebar item, calendar legend and inpatient panel | `frontend/tailwind.config.js`, `frontend/src/components/layout/Sidebar.tsx`, `frontend/src/components/operational/UnifiedCalendarView.tsx`, `frontend/src/pages/veterinaria/` |
| Interface copy | Errors, empty states, confirmations and greetings in the warm voice | `frontend/src/` |

Check that `npm run lint`, `npm run typecheck` and the frontend tests pass after the change, and re-check contrast for any new color pairing.

## Open items

- Name availability: SENADI registration, .com and .ec domains, social handles. Not checked yet.
- Final logo artwork and asset exports from a designer.
- Pricing per module; nothing in the repository sets it. The pricing proposal covers the veterinary unit separately.
