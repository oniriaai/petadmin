-- Reminders the system sends to tutors, by WhatsApp or email.
--
-- Until now a reminder was a prefilled wa.me link the staff sent from the business's own phone:
-- nothing was sent by the system and nothing recorded that it had been. This adds what sending
-- needs: a tutor's preferred channel, the unit's reminder settings, and a log of every message
-- sent, failed or deliberately skipped.
--
-- Everything here is additive and defaulted, so no row needs a backfill.

-- NULL means "follow the unit's default"; otherwise WHATSAPP, EMAIL or NONE (opted out).
ALTER TABLE "clients" ADD COLUMN "reminderChannel" TEXT;

-- Automatic sending starts OFF for every unit: these messages reach real people, and an admin
-- turns them on knowingly.
ALTER TABLE "business_unit_settings"
  ADD COLUMN "remindersAuto" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reminderChannels" TEXT[] NOT NULL DEFAULT ARRAY['WHATSAPP', 'EMAIL']::TEXT[],
  ADD COLUMN "reminderDefaultChannel" TEXT NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN "reminderLeadDays" INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "contactEmail" TEXT;

CREATE TABLE "reminder_messages" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "businessUnit" TEXT NOT NULL,
    "clientId" TEXT,
    "petId" TEXT,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "channel" TEXT,
    "recipient" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "trigger" TEXT NOT NULL DEFAULT 'AUTO',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "error" TEXT,
    "sentByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "reminder_messages_pkey" PRIMARY KEY ("id")
);

-- The idempotency key of the scheduled job. Manual sends leave "dedupeKey" NULL, and Postgres
-- treats NULLs as distinct, so a reminder can be resent by hand as often as needed.
CREATE UNIQUE INDEX "reminder_messages_daycareId_dedupeKey_key" ON "reminder_messages"("daycareId", "dedupeKey");
CREATE INDEX "reminder_messages_daycareId_createdAt_idx" ON "reminder_messages"("daycareId", "createdAt");
CREATE INDEX "reminder_messages_daycareId_sourceKey_idx" ON "reminder_messages"("daycareId", "sourceKey");

ALTER TABLE "reminder_messages" ADD CONSTRAINT "reminder_messages_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reminder_messages" ADD CONSTRAINT "reminder_messages_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reminder_messages" ADD CONSTRAINT "reminder_messages_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
