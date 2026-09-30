ALTER TABLE "recurring_plans"
ADD COLUMN "startTime" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN "endTime" TEXT NOT NULL DEFAULT '18:00';

CREATE TABLE "business_unit_settings" (
  "id" TEXT NOT NULL,
  "businessUnit" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "business_unit_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_unit_settings_businessUnit_key"
ON "business_unit_settings"("businessUnit");
