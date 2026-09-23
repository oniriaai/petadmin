# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing web application: React 18, Vite, TypeScript, Tailwind CSS, and Lucide Icons in `frontend/`; Node.js 20, Express, TypeScript, Prisma, and PostgreSQL in `backend/`. The system is a modular monolith with Docker-based local deployment.

## Users

Primary users are administrators and front-desk or operations staff at pet-care businesses. They use the system during the workday to manage reservations, check-ins and check-outs, grooming appointments, clients, pets, room capacity, transportation, and payments.

The product has three confirmed operational roles:

- `admin`: global access with consolidated reporting and a business-unit workspace selector.
- `kinderdog`: access focused on daycare operations and shared management workflows.
- `pethijos`: access focused on grooming operations and shared management workflows.

## Product Purpose

Pethijos Admin is a unified operational and financial system for two complementary pet-care businesses:

- **Kinderdog**: daycare stays, room capacity, attendance, recurring plans, and transportation.
- **Pethijos**: grooming services, scheduled appointments, service workflow, and direct collection.

Shared client and pet records connect both businesses while preserving operational and accounting separation. Success means staff can run daily service workflows from one system with accurate permissions, capacity controls, customer and pet history, and unit-specific financial traceability.

## Positioning

The product combines daycare and grooming operations in one pet-care-specific system rather than treating them as generic booking or CRM workflows. Its meaningfully different mechanism is a shared client/pet core with contextual modules, physical daycare capacity validation, grooming workflow states, role-based access, and strictly segregated financial records for each business unit.

## Operating Context

Staff operate the system in a live front-desk and back-office environment:

- Daycare operators monitor room occupancy, admit pets only when physical capacity allows, track active stays, manage recurring plans, coordinate transport, and complete check-out.
- Grooming operators schedule appointments with service duration and pricing, move pets through the grooming workflow, and complete delivery and payment.
- Administrators review consolidated operations and finance or narrow the workspace to Kinderdog or Pethijos.
- Shared workflows include client/tutor records, pet profiles, vaccines, photos, alerts, reservations, transactions, reports, tools, and configuration.

## Capabilities and Constraints

Confirmed capabilities include:

- JWT authentication and role-based route and navigation protection.
- Contextual navigation by role and active business unit.
- Unified client/tutor and pet records with history, vaccines, alerts, and photos.
- Kinderdog room capacity, occupancy, attendance, check-in/check-out, recurring plans, and transport.
- Pethijos service catalog, duration-aware appointments, Kanban-style service states, and direct collection.
- Financial records, accounts payable, inventory, reporting, exports, and daily dashboard summaries.
- Independent financial attribution to `KINDERDOG` and `PETHIJOS`, including combined-service scenarios.

Durable constraints and terminology:

- Preserve the Spanish-language interface.
- Preserve the Pethijos and Kinderdog business-unit split.
- Preserve role-based permissions and real operational data boundaries.
- Capacity limits for physical daycare rooms must be enforced, not merely displayed.
- Financial activity must remain traceable to the correct business unit.
- Do not invent testimonials, customer logos, performance metrics, pricing, legal claims, or other evidence not present in the repository.

## Brand Commitments

The confirmed product and business names are **Pethijos** and **Kinderdog**. Existing product terminology includes “Perrhijos” for pets and Spanish operational labels such as “Guardería,” “Peluquería,” “Tutor,” “Cupos,” and “Gestión Financiera.” No additional visual, typographic, or asset direction has been confirmed in this product record.

## Evidence on Hand

Product and workflow evidence is documented in:

- `README.md`
- `frontend/README.md`
- `docs/functional-design.md`
- `docs/alcance.md`
- `docs/traceability-matrix.md`
- `frontend/src/`
- `backend/src/`

The repository contains working frontend and backend implementations, API modules, seeded operational roles, and automated tests. No testimonials, customer proof, pricing evidence, or approved external brand asset set is established here; future work must not fabricate them.

## Product Principles

- Make daily pet-care operations faster and safer at the point of work.
- Keep shared client and pet context unified across services.
- Make physical capacity, workflow state, permissions, and financial ownership explicit.
- Prefer domain-specific workflows over generic booking abstractions.
- Preserve traceability across every operational and financial action.
