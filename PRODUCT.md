# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing web application: React 18, Vite, TypeScript, Tailwind CSS, and Lucide Icons in `frontend/`; Node.js 20, Express, TypeScript, Prisma, and PostgreSQL in `backend/`. The system is a modular monolith with Docker-based local deployment.

## Users

The product has two distinct audiences.

**Tenant users** are administrators and front-desk or operations staff at pet-care businesses. They use the system during the workday to manage reservations, check-ins and check-outs, grooming appointments, veterinary consultations and inpatients, clients, pets, room capacity, transportation, and payments. Each of them belongs to exactly one daycare and sees only that daycare's data.

**The vendor** operates the platform itself: creating daycare accounts, enabling the modules each one bought, provisioning their first users, and reviewing an audit trail of those actions. This is a separate workspace, not an elevated view of a tenant's.

Confirmed roles:

- `superadmin`: the vendor. Belongs to no daycare, cannot be assigned by any daycare, and has full data access across tenants. Operates from a dedicated console.
- `admin`: global access **within one daycare**, with consolidated reporting and a business-unit workspace selector.
- `daycare`: access focused on daycare operations and shared management workflows, within one daycare.
- `grooming`: access focused on grooming operations and shared management workflows, within one daycare.
- `veterinary`: access focused on the veterinary clinic (agenda, clinical records, pharmacy, ward, laboratory) and shared management workflows, within one daycare.

## Product Purpose

Pethijos Admin is a unified operational and financial system for pet-care businesses, sold to daycares as a multi-tenant product. Each customer daycare is a tenant that operates up to three complementary business units:

- **Guardería** (`DAYCARE`): daycare stays, room capacity, attendance, recurring plans, and transportation.
- **Peluquería** (`GROOMING`): grooming services, scheduled appointments, service workflow, and direct collection.
- **Veterinaria** (`VETERINARY`): consultations with a clinical record, preventive care, prescriptions and pharmacy, hospitalization, procedures with consent, laboratory, and collection when the visit closes.

Shared client and pet records connect the units within a tenant while preserving operational and accounting separation. Success means staff can run daily service workflows from one system with accurate permissions, capacity controls, customer and pet history, and unit-specific financial traceability — and that the vendor can onboard a new daycare, sell it a subset of the product, and have that subset be what it actually receives.

## Positioning

The product combines daycare, grooming and veterinary operations in one pet-care-specific system rather than treating them as generic booking or CRM workflows. Its meaningfully different mechanism is a shared client/pet core with contextual modules, physical daycare capacity validation, grooming workflow states, role-based access, and strictly segregated financial records for each business unit.

It is sold as coarse **product modules** rather than per-feature flags: Reservas y Agenda, Guardería, Peluquería, Veterinaria, Gestión Financiera, Inventario, Informes y Exportación, and Contratos y Alertas, over a Núcleo every tenant gets. A daycare that only grooms buys Reservas and Peluquería and never sees the rest.

## Operating Context

Staff operate the system in a live front-desk and back-office environment:

- Daycare operators monitor room occupancy, admit pets only when physical capacity allows, track active stays, manage recurring plans, coordinate transport, and complete check-out.
- Grooming operators schedule appointments with service duration and pricing, move pets through the grooming workflow, and complete delivery and payment.
- Clinic staff run the day's agenda and waiting room, write the clinical record, prescribe and dispense, look after inpatients from a treatment sheet, and close each visit with its charges.
- Administrators review consolidated operations and finance or narrow the workspace to Guardería, Peluquería or Veterinaria.
- Shared workflows include client/tutor records, pet profiles, vaccines, photos, alerts, reservations, transactions, reports, tools, and configuration.
- The vendor works in a separate console: registering a daycare with its units and purchased modules, creating its first administrator, toggling modules later, and reading the audit trail. When the vendor enters a tenant's workspace to support it, a non-dismissible banner says so, because otherwise nothing would distinguish them from that tenant's own administrator.

## Capabilities and Constraints

Confirmed capabilities include:

- JWT authentication and role-based route and navigation protection, with account state checked on every request: deactivating a user or suspending a daycare takes effect on their next request rather than when the token expires.
- Contextual navigation by role and active business unit.
- Unified client/tutor and pet records with history, vaccines, alerts, and photos.
- Guardería room capacity, occupancy, attendance, check-in/check-out, recurring plans, and transport.
- Peluquería service catalog, duration-aware appointments, Kanban-style service states, and direct collection.
- Financial records, accounts payable, inventory with low-stock warnings and stock movements, contracts, reporting, exports, and daily dashboard summaries.
- Per-daycare operational settings: default VAT and timezone per business unit.
- Independent financial attribution to `DAYCARE` and `GROOMING`, including combined-service scenarios.
- Tenant isolation: every operational record belongs to one daycare, and a request for another tenant's record reads as absent rather than forbidden.
- Per-tenant module entitlements enforced at the API, not only hidden in the interface; a module a daycare did not buy answers 403 `MODULE_DISABLED`.
- A vendor console for daycare onboarding, module entitlement, user provisioning, and audit.
- Daycare-side staff administration: an `admin` lists, provisions and deactivates its own users and resets their passwords, without the vendor. Part of the core, not a sellable module.
- Usernames unique per daycare rather than globally, so two clients can both have a `recepcion`. Login takes an optional daycare identifier and asks for it only when a username is ambiguous.
- Tenant offboarding: the vendor exports everything one daycare owns as a workbook, and can then permanently delete it — gated behind retyping the daycare's identifier and behind the daycare already being deactivated, with its files removed from object storage and the audit record outliving the tenant.
- Operational hardening carried by the product rather than the deployment: a CORS allowlist, login throttling keyed by IP and username, per-tenant limits on object-storage operations, a refusal to boot in production with a default signing secret, structured logs carrying the tenant, and bounded list endpoints.

Durable constraints and terminology:

- Preserve the Spanish-language interface.
- Preserve the two-slot business-unit split. The slots are identified generically as `DAYCARE` and
  `GROOMING` (renamed from `KINDERDOG`/`PETHIJOS` so the product can be sold to other daycares) and are
  labelled "Guardería" and "Peluquería" in the interface. The split itself — separate operations and
  strictly segregated accounting per slot — is unchanged.
- Preserve role-based permissions and real operational data boundaries.
- Preserve tenant isolation. Data belongs to a daycare, not to the installation; `superadmin` is the only role that crosses that boundary, no daycare user may hold it, and the database enforces that with a CHECK constraint rather than trusting application code.
- Module entitlements are a product boundary, not a UI preference: hiding a module in the interface without refusing it at the API does not count as implementing it.
- Tenant isolation is enforced in application code and backstopped by a Prisma-level guard that fails loudly in development and CI when a query inside a tenant user's request omits the tenant filter. Writes are part of that boundary, not just reads: an id arriving in a request body is never proof of tenancy.
- Accounting entries generated by completing a stay or an appointment are written regardless of whether the tenant bought Gestión Financiera. Ledger integrity is not a purchasable feature; only access to the financial API and interface is.
- Capacity limits for physical daycare rooms must be enforced, not merely displayed.
- Financial activity must remain traceable to the correct business unit.
- Do not invent testimonials, customer logos, performance metrics, pricing, legal claims, or other evidence not present in the repository.

## Brand Commitments

The confirmed product and business names are **Pethijos** and **Kinderdog**, which name the original operating business — now the first tenant, seeded under the slug `pethijos`. They are brand names, not identifiers: the business-unit slots are `DAYCARE` and `GROOMING` in code so the system can be sold to other daycares, and the interface labels them “Guardería” and “Peluquería.” Existing product terminology includes “Perrhijos” for pets and Spanish operational labels such as “Tutor,” “Cupos,” and “Gestión Financiera.” No additional visual, typographic, or asset direction has been confirmed in this product record.

## Evidence on Hand

Product and workflow evidence is documented in:

- `README.md`
- `backend/README.md`
- `frontend/README.md`
- `docs/functional-design.md`
- `docs/alcance.md`
- `docs/adding-a-module.md`
- `frontend/src/`
- `backend/src/`

The repository contains working frontend and backend implementations, API modules, seeded operational roles, and automated tests. No testimonials, customer proof, pricing evidence, or approved external brand asset set is established here; future work must not fabricate them.

## Product Principles

- Make daily pet-care operations faster and safer at the point of work.
- Keep shared client and pet context unified across services.
- Make physical capacity, workflow state, permissions, and financial ownership explicit.
- Prefer domain-specific workflows over generic booking abstractions.
- Preserve traceability across every operational and financial action.
