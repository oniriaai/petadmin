-- Introduce the Daycare tenant and attach every operational root to it.
--
-- Prisma's own diff would emit `ADD COLUMN "daycareId" TEXT NOT NULL`, which fails on any
-- populated table. The order below is what makes this safe on a database with data:
--   create tenant tables -> insert the existing business as the default tenant ->
--   add the column nullable -> backfill -> SET NOT NULL -> constraints and indexes.
--
-- The default tenant uses a literal id rather than a generated cuid so this migration, the
-- seed, the platform console fixtures and the e2e suites can all refer to the same tenant.

-- ---------------------------------------------------------------- 1. tenant tables
CREATE TABLE "daycares" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Guayaquil',
    "units" TEXT NOT NULL DEFAULT 'DAYCARE,GROOMING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "daycares_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "daycares_slug_key" ON "daycares"("slug");

CREATE TABLE "daycare_modules" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "daycare_modules_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "daycare_modules_daycareId_idx" ON "daycare_modules"("daycareId");
CREATE UNIQUE INDEX "daycare_modules_daycareId_moduleId_key" ON "daycare_modules"("daycareId", "moduleId");
ALTER TABLE "daycare_modules" ADD CONSTRAINT "daycare_modules_daycareId_fkey"
    FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "daycareId" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "platform_audit_logs_daycareId_createdAt_idx" ON "platform_audit_logs"("daycareId", "createdAt");
CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");

-- -------------------------------------------- 2. the existing business as default tenant
INSERT INTO "daycares" ("id", "slug", "name", "timezone", "units", "isActive", "createdAt", "updatedAt")
VALUES ('daycare_pethijos', 'pethijos', 'Pethijos', 'America/Guayaquil', 'DAYCARE,GROOMING', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Every product module is enabled for the existing business: it had full access before.
INSERT INTO "daycare_modules" ("id", "daycareId", "moduleId", "isEnabled", "updatedAt")
SELECT 'dm_pethijos_' || m.id, 'daycare_pethijos', m.id, true, CURRENT_TIMESTAMP
FROM (VALUES ('reservas'), ('guarderia'), ('peluqueria'), ('finanzas'), ('inventario'), ('informes'), ('cumplimiento')) AS m(id)
ON CONFLICT ("daycareId", "moduleId") DO NOTHING;

-- ------------------------------------------------------- 3. add the column, nullable
ALTER TABLE "users"                  ADD COLUMN "daycareId" TEXT;
ALTER TABLE "clients"                ADD COLUMN "daycareId" TEXT;
ALTER TABLE "pets"                   ADD COLUMN "daycareId" TEXT;
ALTER TABLE "providers"              ADD COLUMN "daycareId" TEXT;
ALTER TABLE "veterinarians"          ADD COLUMN "daycareId" TEXT;
ALTER TABLE "rooms"                  ADD COLUMN "daycareId" TEXT;
ALTER TABLE "recurring_plans"        ADD COLUMN "daycareId" TEXT;
ALTER TABLE "business_unit_settings" ADD COLUMN "daycareId" TEXT;
ALTER TABLE "reservations"           ADD COLUMN "daycareId" TEXT;
ALTER TABLE "check_in_outs"          ADD COLUMN "daycareId" TEXT;
ALTER TABLE "incomes"                ADD COLUMN "daycareId" TEXT;
ALTER TABLE "payables"               ADD COLUMN "daycareId" TEXT;
ALTER TABLE "inventory_items"        ADD COLUMN "daycareId" TEXT;
ALTER TABLE "alerts"                 ADD COLUMN "daycareId" TEXT;
ALTER TABLE "contracts"              ADD COLUMN "daycareId" TEXT;

-- --------------------------------------------------------------------- 4. backfill
UPDATE "users"                  SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "clients"                SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "providers"              SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "veterinarians"          SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "rooms"                  SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "recurring_plans"        SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "business_unit_settings" SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "reservations"           SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "check_in_outs"          SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "incomes"                SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "payables"               SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "inventory_items"        SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "alerts"                 SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;
UPDATE "contracts"              SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;

-- A pet's tenant is derived from its owner, so the denormalized column is correct by
-- construction rather than by assuming a single tenant.
UPDATE "pets" p SET "daycareId" = c."daycareId" FROM "clients" c WHERE p."clientId" = c."id";
-- Any orphan pet (no matching client) still needs a tenant to satisfy NOT NULL.
UPDATE "pets" SET "daycareId" = 'daycare_pethijos' WHERE "daycareId" IS NULL;

-- ------------------------------------------------------------------ 5. SET NOT NULL
-- users stays nullable: a NULL daycareId is what identifies a platform superadmin.
ALTER TABLE "clients"                ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "pets"                   ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "providers"              ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "veterinarians"          ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "rooms"                  ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "recurring_plans"        ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "business_unit_settings" ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "reservations"           ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "check_in_outs"          ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "incomes"                ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "payables"               ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "inventory_items"        ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "alerts"                 ALTER COLUMN "daycareId" SET NOT NULL;
ALTER TABLE "contracts"              ALTER COLUMN "daycareId" SET NOT NULL;

-- --------------------------------------------------------------- 6. foreign keys
-- RESTRICT, not SET NULL: nulling a tenant user's daycareId would violate the superadmin
-- CHECK below, so a delete would fail with a confusing constraint error instead of a clear
-- "this daycare still has users". The console deactivates a daycare rather than deleting it.
ALTER TABLE "users"                  ADD CONSTRAINT "users_daycareId_fkey"                  FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clients"                ADD CONSTRAINT "clients_daycareId_fkey"                FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pets"                   ADD CONSTRAINT "pets_daycareId_fkey"                   FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "providers"              ADD CONSTRAINT "providers_daycareId_fkey"              FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "veterinarians"          ADD CONSTRAINT "veterinarians_daycareId_fkey"          FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rooms"                  ADD CONSTRAINT "rooms_daycareId_fkey"                  FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_plans"        ADD CONSTRAINT "recurring_plans_daycareId_fkey"        FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "business_unit_settings" ADD CONSTRAINT "business_unit_settings_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservations"           ADD CONSTRAINT "reservations_daycareId_fkey"           FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "check_in_outs"          ADD CONSTRAINT "check_in_outs_daycareId_fkey"          FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incomes"                ADD CONSTRAINT "incomes_daycareId_fkey"                FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payables"               ADD CONSTRAINT "payables_daycareId_fkey"               FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_items"        ADD CONSTRAINT "inventory_items_daycareId_fkey"        FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "alerts"                 ADD CONSTRAINT "alerts_daycareId_fkey"                 FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contracts"              ADD CONSTRAINT "contracts_daycareId_fkey"              FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------------- 7. indexes
CREATE INDEX "users_daycareId_idx"             ON "users"("daycareId");
CREATE INDEX "clients_daycareId_idx"           ON "clients"("daycareId");
CREATE INDEX "pets_daycareId_idx"              ON "pets"("daycareId");
CREATE INDEX "providers_daycareId_idx"         ON "providers"("daycareId");
CREATE INDEX "veterinarians_daycareId_idx"     ON "veterinarians"("daycareId");
CREATE INDEX "rooms_daycareId_idx"             ON "rooms"("daycareId");
CREATE INDEX "recurring_plans_daycareId_idx"   ON "recurring_plans"("daycareId");
CREATE INDEX "business_unit_settings_daycareId_idx" ON "business_unit_settings"("daycareId");
CREATE INDEX "reservations_daycareId_idx"      ON "reservations"("daycareId");
CREATE INDEX "check_in_outs_daycareId_idx"     ON "check_in_outs"("daycareId");
CREATE INDEX "incomes_daycareId_idx"           ON "incomes"("daycareId");
CREATE INDEX "payables_daycareId_idx"          ON "payables"("daycareId");
CREATE INDEX "inventory_items_daycareId_idx"   ON "inventory_items"("daycareId");
CREATE INDEX "alerts_daycareId_idx"            ON "alerts"("daycareId");
CREATE INDEX "contracts_daycareId_idx"         ON "contracts"("daycareId");

-- Scoped reads filter tenant + unit together on the hot tables.
CREATE INDEX "check_in_outs_daycareId_businessUnit_idx" ON "check_in_outs"("daycareId", "businessUnit");
CREATE INDEX "reservations_daycareId_businessUnit_idx"  ON "reservations"("daycareId", "businessUnit");
CREATE INDEX "incomes_daycareId_businessUnit_idx"       ON "incomes"("daycareId", "businessUnit");

-- --------------------------------- 8. replace the now-wrong single-tenant constraints
-- A second daycare must be able to own its own DAYCARE/GROOMING settings rows.
DROP INDEX IF EXISTS "business_unit_settings_businessUnit_key";
CREATE UNIQUE INDEX "business_unit_settings_daycareId_businessUnit_key" ON "business_unit_settings"("daycareId", "businessUnit");
-- Superseded by the composite index above.
DROP INDEX IF EXISTS "check_in_outs_businessUnit_idx";

-- ------------------------------------------------------ 9. superadmin/tenant invariant
-- A superadmin is exactly a user with no daycare, and a tenant user can never be one.
-- Enforced in the database so no application path can violate it.
ALTER TABLE "users" ADD CONSTRAINT "users_superadmin_untenanted"
    CHECK (("role" = 'superadmin') = ("daycareId" IS NULL));
