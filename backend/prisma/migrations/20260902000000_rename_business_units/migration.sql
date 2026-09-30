-- Rename the business-unit slots off the Kinderdog/Pethijos brand names onto generic
-- identifiers, so the same two slots can be sold to any daycare:
--   KINDERDOG -> DAYCARE, PETHIJOS -> GROOMING
-- and the matching user roles:
--   kinderdog -> daycare, pethijos -> grooming
--
-- Data only, no DDL. Fully reversible by swapping the values in each statement.
-- The "GLOBAL" sentinel on cross-unit admins is deliberately left untouched.

-- users carries both a businessUnit and a role
UPDATE "users" SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "users" SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "users" SET "role" = 'daycare'  WHERE "role" = 'kinderdog';
UPDATE "users" SET "role" = 'grooming' WHERE "role" = 'pethijos';

-- the remaining 10 tables that carry a businessUnit column
UPDATE "rooms"                  SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "rooms"                  SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "recurring_plans"        SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "recurring_plans"        SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "business_unit_settings" SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "business_unit_settings" SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "reservations"           SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "reservations"           SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "check_in_outs"          SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "check_in_outs"          SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "incomes"                SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "incomes"                SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "payables"               SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "payables"               SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "inventory_items"        SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "inventory_items"        SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "alerts"                 SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "alerts"                 SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
UPDATE "contracts"              SET "businessUnit" = 'DAYCARE'  WHERE "businessUnit" = 'KINDERDOG';
UPDATE "contracts"              SET "businessUnit" = 'GROOMING' WHERE "businessUnit" = 'PETHIJOS';
