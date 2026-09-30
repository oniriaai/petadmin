-- Per-unit default VAT.
--
-- The rate was hard-coded as 15 in three places (reservations.router.ts, peluqueria.router.ts,
-- appointments.service.ts) and the settings screen pretended to edit it. The default below keeps
-- existing rows behaving exactly as they did.
ALTER TABLE "business_unit_settings"
  ADD COLUMN "vatPercent" DOUBLE PRECISION NOT NULL DEFAULT 15;
