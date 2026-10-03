-- Removes the backfilled `daycare_pethijos` tenant when it owns nothing.
--
-- 20260903000000_add_daycare_tenancy inserts that row unconditionally, which was right for its
-- purpose: it adopted the data of the then-single-tenant installation. On a FRESH database it
-- is wrong — a brand-new production install came up with a tenant nobody created, named
-- "Pethijos", active, with all seven sellable modules enabled and no users. Three problems
-- follow: the vendor console lists a phantom customer, the `pethijos` slug is taken so a real
-- client cannot have it, and provisioning a user into it (it looks legitimate in the console)
-- hands out a fully entitled tenant for free.
--
-- The earlier migration cannot be edited: it is already applied, and changing it would fail
-- every existing database on its checksum. So this is a separate, conditional cleanup.
--
-- The condition is "owns nothing at all", checked across every table that carries a daycareId.
-- On an installation where this tenant IS the live business, every one of those is non-empty
-- and the row is left exactly as it is. On a fresh install they are all empty and it goes.
-- Its daycare_modules rows are excluded from the test, because the backfill wrote those itself
-- and they cascade on delete.
DO $$
DECLARE
  tenant CONSTANT TEXT := 'daycare_pethijos';
  in_use BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM "users"                  WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "clients"                WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "pets"                   WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "providers"              WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "veterinarians"          WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "rooms"                  WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "recurring_plans"        WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "business_unit_settings" WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "reservations"           WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "check_in_outs"          WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "incomes"                WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "payables"               WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "inventory_items"        WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "alerts"                 WHERE "daycareId" = tenant)
      OR EXISTS (SELECT 1 FROM "contracts"              WHERE "daycareId" = tenant)
      -- A console action recorded against it means an operator has already adopted it.
      OR EXISTS (SELECT 1 FROM "platform_audit_logs"    WHERE "daycareId" = tenant)
  INTO in_use;

  IF in_use THEN
    RAISE NOTICE 'El inquilino % tiene datos: se conserva intacto.', tenant;
  ELSE
    DELETE FROM "daycare_modules" WHERE "daycareId" = tenant;
    DELETE FROM "daycares"        WHERE "id" = tenant;
    RAISE NOTICE 'El inquilino % estaba vacío (base de datos nueva): eliminado.', tenant;
  END IF;
END $$;
