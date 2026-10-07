-- Indexes for the queries that grow with a tenant's history.
--
-- Every operational table was indexed on "daycareId" (and some on the business unit) and on
-- nothing else, so a filter by date, status or parent row read the tenant's whole history to
-- answer it: the dashboard's counts for today, the room-conflict check on every booking, the
-- ledgers' ordering. Postgres does not index a foreign key's referencing column by itself, so
-- the joins through "clientId", "petId" and "payableId" scanned as well.
--
-- Plain CREATE INDEX, not CONCURRENTLY: Prisma applies a migration inside a transaction, where
-- CONCURRENTLY is not allowed. Each one blocks writes to its table while it builds, which at
-- today's sizes is a moment. On a database that has grown large, build them by hand with
-- CONCURRENTLY first and mark this migration applied (`prisma migrate resolve --applied`).

-- Reservations: the agenda and the dashboard filter by day inside a unit; the capacity check
-- looks for overlaps in one room; a tutor's record lists their bookings.
CREATE INDEX "reservations_daycareId_businessUnit_checkIn_idx" ON "reservations"("daycareId", "businessUnit", "checkIn");
CREATE INDEX "reservations_daycareId_status_idx" ON "reservations"("daycareId", "status");
CREATE INDEX "reservations_roomId_checkIn_idx" ON "reservations"("roomId", "checkIn");
CREATE INDEX "reservations_clientId_idx" ON "reservations"("clientId");
-- Both are a prefix of the first index above, which serves their queries.
DROP INDEX "reservations_daycareId_idx";
DROP INDEX "reservations_daycareId_businessUnit_idx";

CREATE INDEX "reservation_pets_petId_idx" ON "reservation_pets"("petId");

-- Finance: every report and the ledger itself are a date range inside a unit.
CREATE INDEX "incomes_daycareId_businessUnit_date_idx" ON "incomes"("daycareId", "businessUnit", "date");
CREATE INDEX "incomes_reservationId_idx" ON "incomes"("reservationId");
DROP INDEX "incomes_daycareId_idx";
DROP INDEX "incomes_daycareId_businessUnit_idx";

CREATE INDEX "payables_daycareId_createdAt_idx" ON "payables"("daycareId", "createdAt");
CREATE INDEX "payables_providerId_idx" ON "payables"("providerId");
DROP INDEX "payables_daycareId_idx";

CREATE INDEX "payments_payableId_idx" ON "payments"("payableId");

-- Pets and what hangs from them.
CREATE INDEX "pets_clientId_idx" ON "pets"("clientId");
CREATE INDEX "pet_vaccinations_petId_idx" ON "pet_vaccinations"("petId");
CREATE INDEX "pet_documents_petId_idx" ON "pet_documents"("petId");

CREATE INDEX "alerts_daycareId_isResolved_idx" ON "alerts"("daycareId", "isResolved");
DROP INDEX "alerts_daycareId_idx";

-- Search by name is `contains` (ILIKE '%text%'), which no b-tree can serve. Trigram indexes
-- can, from three characters up. They cannot be declared in schema.prisma, like the partial
-- unique index in per_tenant_usernames. pg_trgm is a trusted extension since Postgres 13, so
-- the database owner may create it without being a superuser.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "clients_firstName_trgm_idx" ON "clients" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "clients_lastName_trgm_idx" ON "clients" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX "pets_name_trgm_idx" ON "pets" USING GIN ("name" gin_trgm_ops);
