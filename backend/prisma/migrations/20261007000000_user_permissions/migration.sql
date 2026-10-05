-- Per-user permissions.
--
-- Role, business unit and entitlement decide which modules a user reaches, but nothing said
-- what it may do inside one: every staff account could read the financial statements and
-- rewrite stock. Each user now carries the list of permissions it was granted (the catalog is
-- in src/core/tenancy/permissions.ts). A tenant admin holds all of them implicitly, whatever
-- this column says.
ALTER TABLE "users"
  ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Existing staff start from the same narrow default a new user gets: inventory read-only, and
-- no finance, export or delete until an admin grants it. Written for admins too, where it is
-- inert, so a later demotion lands on the default rather than on nothing.
UPDATE "users"
  SET "permissions" = ARRAY['inventario.read']
  WHERE "role" <> 'superadmin';
