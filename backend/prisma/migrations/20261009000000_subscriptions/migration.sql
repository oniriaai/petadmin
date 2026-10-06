-- Self-service onboarding: a visitor signs up from the public page, pays through PayPhone (or
-- starts a trial) and gets a daycare without the vendor creating it by hand.
--
-- Until now a daycare only existed once the console created it, and nothing recorded what it
-- paid or until when. This adds the signup waiting for its payment, the subscription of a
-- daycare that came in this way, and every charge attempted for it.
--
-- Everything here is additive. A daycare with no row in "subscriptions" is managed by the vendor
-- exactly as before, so no existing row needs a backfill.

CREATE TABLE "signup_intents" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "email" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "adminName" TEXT NOT NULL,
    "adminUsername" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "units" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "founder" BOOLEAN NOT NULL DEFAULT false,
    "saveCard" BOOLEAN NOT NULL DEFAULT false,
    "verificationTokenHash" TEXT,
    "daycareId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "signup_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "signup_intents_verificationTokenHash_key" ON "signup_intents"("verificationTokenHash");
CREATE INDEX "signup_intents_slug_idx" ON "signup_intents"("slug");
CREATE INDEX "signup_intents_email_idx" ON "signup_intents"("email");
CREATE INDEX "signup_intents_taxId_idx" ON "signup_intents"("taxId");

CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "priceCents" INTEGER NOT NULL,
    "founderNumber" INTEGER,
    "founderUntil" TIMESTAMP(3),
    "billingEmail" TEXT NOT NULL,
    "taxId" TEXT,
    "phone" TEXT,
    "cardToken" TEXT,
    "cardHolder" TEXT,
    "cardBrand" TEXT,
    "cardLastDigits" TEXT,
    "payerEmail" TEXT,
    "payerPhone" TEXT,
    "payerDocument" TEXT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "pastDueSince" TIMESTAMP(3),
    "lastNotice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscriptions_daycareId_key" ON "subscriptions"("daycareId");
-- At most one tenant per founder slot, whatever two concurrent payments do.
CREATE UNIQUE INDEX "subscriptions_founderNumber_key" ON "subscriptions"("founderNumber");
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT,
    "subscriptionId" TEXT,
    "signupIntentId" TEXT,
    "clientTransactionId" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "kind" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "units" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "saveCard" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payphoneTransactionId" TEXT,
    "authorizationCode" TEXT,
    "cardBrand" TEXT,
    "cardLastDigits" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_payments_clientTransactionId_key" ON "subscription_payments"("clientTransactionId");
-- The idempotency key of the renewal job. Payments started by a person leave it NULL, and
-- Postgres treats NULLs as distinct.
CREATE UNIQUE INDEX "subscription_payments_dedupeKey_key" ON "subscription_payments"("dedupeKey");
CREATE INDEX "subscription_payments_daycareId_createdAt_idx" ON "subscription_payments"("daycareId", "createdAt");
CREATE INDEX "subscription_payments_subscriptionId_idx" ON "subscription_payments"("subscriptionId");
CREATE INDEX "subscription_payments_signupIntentId_idx" ON "subscription_payments"("signupIntentId");

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_signupIntentId_fkey" FOREIGN KEY ("signupIntentId") REFERENCES "signup_intents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
