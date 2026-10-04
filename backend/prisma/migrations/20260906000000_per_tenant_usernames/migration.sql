-- Usernames become unique per daycare instead of globally.
--
-- They were globally unique because login had no tenant selector. The console already had to
-- apologise for it ("Ya existe el usuario X. Sugerencia: {slug}_{username}"): two client
-- daycares could not both have a `recepcion`, or an admin with the same name. That gets worse
-- with every customer added, and it is a schema plus login change, so it is cheaper now than
-- later.
--
-- Two indexes, because they cover two different things:
--
--   * (daycareId, username) — the tenant rule. Postgres treats NULLs as distinct, so this
--     alone would NOT stop two platform accounts sharing a username: (NULL,'superadmin') and
--     (NULL,'superadmin') do not conflict.
--   * username WHERE daycareId IS NULL — the platform accounts, which have no daycare and
--     must still be unique among themselves.
--
-- The partial index cannot be expressed in schema.prisma, so it lives only here. Deployments
-- apply migrations with `migrate deploy`, which leaves it alone; a future `prisma migrate dev`
-- would see it as drift and try to drop it, so it has to be re-stated if the baseline is ever
-- regenerated.

-- A collision would mean the data cannot satisfy the new rule, so fail loudly rather than
-- having the CREATE UNIQUE INDEX below fail with a less obvious message.
DO $$
DECLARE
  dupe RECORD;
BEGIN
  SELECT "daycareId", "username", count(*) AS n
  INTO dupe
  FROM "users"
  GROUP BY "daycareId", "username"
  HAVING count(*) > 1
  LIMIT 1;

  IF dupe IS NOT NULL THEN
    RAISE EXCEPTION 'Usuario repetido dentro de una guardería: % / % (% filas)',
      dupe."daycareId", dupe."username", dupe.n;
  END IF;
END $$;

DROP INDEX "users_username_key";

CREATE UNIQUE INDEX "users_daycareId_username_key" ON "users"("daycareId", "username");

CREATE UNIQUE INDEX "users_platform_username_key" ON "users"("username") WHERE "daycareId" IS NULL;
