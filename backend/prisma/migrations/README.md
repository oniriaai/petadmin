# Migrations

## History

This project originally ran `prisma db push --accept-data-loss` from `docker-compose.yml`, so the
three hand-written migrations below were **never recorded in `_prisma_migrations`**:

- `20260502124231_add_check_in_out`
- `20260503113000_add_recurring_reservation_occurrence_unique`
- `20260503150000_add_recurring_plan_interval_and_bu_timezone`

They now live in `prisma/legacy-migrations/` and are kept only for provenance. They had to be
moved out of this directory: their timestamps sort *before* the baseline, so `migrate deploy` on
a fresh database would have run them first and the baseline would then fail trying to create the
same tables again. Their effects are already included in `20260901000000_baseline`, which was
generated from the schema as it stood at that point:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

Do not re-apply the three superseded files; do not move them back into this directory.

## Adopting migrations on a database that predates them

A database created by `db push` already has the baseline's tables, so mark the baseline (and any
migration already applied by hand) as applied rather than running it:

```bash
npx prisma migrate resolve --applied 20260901000000_baseline
npx prisma migrate resolve --applied 20260902000000_rename_business_units   # if applied manually
npx prisma migrate deploy                                                   # applies the rest
```

A fresh database just needs `npx prisma migrate deploy`.

## Going forward

- `npm run db:migrate` → `prisma migrate deploy` (what Docker and any deployment runs)
- `npm run db:migrate:dev` → `prisma migrate dev` (authoring a new migration locally)
- `npm run db:push` remains as an escape hatch for throwaway local databases only

Schema changes that need to preserve existing rows — adding a required column, renaming a stored
value — must be hand-authored so the backfill happens between adding the column and making it
`NOT NULL`. `db push` cannot express that.
