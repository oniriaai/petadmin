-- AlterTable
ALTER TABLE "vet_vitals" ADD COLUMN     "hospitalizationId" TEXT;

-- CreateTable
CREATE TABLE "vet_hospitalizations" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INGRESADO',
    "reason" TEXT NOT NULL,
    "dailyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "dischargeSummary" TEXT,
    "homeCareInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_hospitalizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_treatment_orders" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "hospitalizationId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "drug" TEXT,
    "dose" TEXT,
    "route" TEXT,
    "everyHours" INTEGER,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_treatment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_treatment_administrations" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "hospitalizationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "administeredAt" TIMESTAMP(3),
    "administeredByUserId" TEXT,
    "skippedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_treatment_administrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_procedures" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "veterinarianId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'PROCEDIMIENTO',
    "status" TEXT NOT NULL DEFAULT 'PROGRAMADO',
    "asaRisk" INTEGER,
    "anesthesiaProtocol" TEXT,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "findings" TEXT,
    "complications" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_lab_orders" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LABORATORIO',
    "test" TEXT NOT NULL,
    "externalLab" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SOLICITADO',
    "notes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultSummary" TEXT,
    "resultFilePath" TEXT,
    "resultAt" TIMESTAMP(3),

    CONSTRAINT "vet_lab_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_lab_result_values" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "analyte" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "referenceRange" TEXT,
    "flag" TEXT,

    CONSTRAINT "vet_lab_result_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_consents" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "visitId" TEXT,
    "type" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "signedByName" TEXT,
    "signedAt" TIMESTAMP(3),
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vet_hospitalizations_daycareId_idx" ON "vet_hospitalizations"("daycareId");

-- CreateIndex
CREATE INDEX "vet_hospitalizations_daycareId_status_idx" ON "vet_hospitalizations"("daycareId", "status");

-- CreateIndex
CREATE INDEX "vet_hospitalizations_petId_idx" ON "vet_hospitalizations"("petId");

-- CreateIndex
CREATE INDEX "vet_hospitalizations_visitId_idx" ON "vet_hospitalizations"("visitId");

-- CreateIndex
CREATE INDEX "vet_treatment_orders_daycareId_idx" ON "vet_treatment_orders"("daycareId");

-- CreateIndex
CREATE INDEX "vet_treatment_orders_hospitalizationId_idx" ON "vet_treatment_orders"("hospitalizationId");

-- CreateIndex
CREATE INDEX "vet_treatment_administrations_daycareId_idx" ON "vet_treatment_administrations"("daycareId");

-- CreateIndex
CREATE INDEX "vet_treatment_administrations_hospitalizationId_idx" ON "vet_treatment_administrations"("hospitalizationId");

-- CreateIndex
CREATE UNIQUE INDEX "vet_treatment_administrations_orderId_scheduledAt_key" ON "vet_treatment_administrations"("orderId", "scheduledAt");

-- CreateIndex
CREATE INDEX "vet_procedures_daycareId_idx" ON "vet_procedures"("daycareId");

-- CreateIndex
CREATE INDEX "vet_procedures_petId_idx" ON "vet_procedures"("petId");

-- CreateIndex
CREATE INDEX "vet_procedures_visitId_idx" ON "vet_procedures"("visitId");

-- CreateIndex
CREATE INDEX "vet_lab_orders_daycareId_idx" ON "vet_lab_orders"("daycareId");

-- CreateIndex
CREATE INDEX "vet_lab_orders_daycareId_status_idx" ON "vet_lab_orders"("daycareId", "status");

-- CreateIndex
CREATE INDEX "vet_lab_orders_petId_idx" ON "vet_lab_orders"("petId");

-- CreateIndex
CREATE INDEX "vet_lab_orders_visitId_idx" ON "vet_lab_orders"("visitId");

-- CreateIndex
CREATE INDEX "vet_lab_result_values_daycareId_idx" ON "vet_lab_result_values"("daycareId");

-- CreateIndex
CREATE INDEX "vet_lab_result_values_orderId_idx" ON "vet_lab_result_values"("orderId");

-- CreateIndex
CREATE INDEX "vet_consents_daycareId_idx" ON "vet_consents"("daycareId");

-- CreateIndex
CREATE INDEX "vet_consents_petId_idx" ON "vet_consents"("petId");

-- CreateIndex
CREATE INDEX "vet_consents_visitId_idx" ON "vet_consents"("visitId");

-- CreateIndex
CREATE INDEX "vet_vitals_hospitalizationId_idx" ON "vet_vitals"("hospitalizationId");

-- AddForeignKey
ALTER TABLE "vet_vitals" ADD CONSTRAINT "vet_vitals_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "vet_hospitalizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_hospitalizations" ADD CONSTRAINT "vet_hospitalizations_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_hospitalizations" ADD CONSTRAINT "vet_hospitalizations_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_hospitalizations" ADD CONSTRAINT "vet_hospitalizations_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_hospitalizations" ADD CONSTRAINT "vet_hospitalizations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_treatment_orders" ADD CONSTRAINT "vet_treatment_orders_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_treatment_orders" ADD CONSTRAINT "vet_treatment_orders_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "vet_hospitalizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_treatment_administrations" ADD CONSTRAINT "vet_treatment_administrations_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_treatment_administrations" ADD CONSTRAINT "vet_treatment_administrations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "vet_treatment_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_treatment_administrations" ADD CONSTRAINT "vet_treatment_administrations_hospitalizationId_fkey" FOREIGN KEY ("hospitalizationId") REFERENCES "vet_hospitalizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_treatment_administrations" ADD CONSTRAINT "vet_treatment_administrations_administeredByUserId_fkey" FOREIGN KEY ("administeredByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_procedures" ADD CONSTRAINT "vet_procedures_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_procedures" ADD CONSTRAINT "vet_procedures_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_procedures" ADD CONSTRAINT "vet_procedures_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_procedures" ADD CONSTRAINT "vet_procedures_veterinarianId_fkey" FOREIGN KEY ("veterinarianId") REFERENCES "veterinarians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_lab_orders" ADD CONSTRAINT "vet_lab_orders_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_lab_orders" ADD CONSTRAINT "vet_lab_orders_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_lab_orders" ADD CONSTRAINT "vet_lab_orders_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_lab_result_values" ADD CONSTRAINT "vet_lab_result_values_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_lab_result_values" ADD CONSTRAINT "vet_lab_result_values_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "vet_lab_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_consents" ADD CONSTRAINT "vet_consents_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_consents" ADD CONSTRAINT "vet_consents_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_consents" ADD CONSTRAINT "vet_consents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_consents" ADD CONSTRAINT "vet_consents_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

