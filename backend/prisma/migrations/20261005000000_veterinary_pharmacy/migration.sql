-- AlterTable
ALTER TABLE "pet_vaccinations" ADD COLUMN     "lotNumber" TEXT,
ADD COLUMN     "manufacturer" TEXT,
ADD COLUMN     "vetVisitId" TEXT,
ADD COLUMN     "veterinarianId" TEXT;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "isControlled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lotNumber" TEXT,
ADD COLUMN     "vetPrescriptionItemId" TEXT;

-- CreateTable
CREATE TABLE "vet_preventives" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "visitId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'DESPARASITACION_INTERNA',
    "product" TEXT NOT NULL,
    "dose" TEXT,
    "weightKg" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDue" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_preventives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_prescriptions" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "veterinarianId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "vet_prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_prescription_items" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "prescriptionId" TEXT NOT NULL,
    "drug" TEXT NOT NULL,
    "presentation" TEXT,
    "dose" TEXT NOT NULL,
    "route" TEXT,
    "frequency" TEXT NOT NULL,
    "durationDays" INTEGER,
    "instructions" TEXT,
    "inventoryItemId" TEXT,
    "quantityDispensed" DOUBLE PRECISION,
    "dispensedAt" TIMESTAMP(3),
    "dispensedByUserId" TEXT,
    "lotNumber" TEXT,

    CONSTRAINT "vet_prescription_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vet_preventives_daycareId_idx" ON "vet_preventives"("daycareId");

-- CreateIndex
CREATE INDEX "vet_preventives_petId_idx" ON "vet_preventives"("petId");

-- CreateIndex
CREATE INDEX "vet_preventives_daycareId_nextDue_idx" ON "vet_preventives"("daycareId", "nextDue");

-- CreateIndex
CREATE INDEX "vet_prescriptions_daycareId_idx" ON "vet_prescriptions"("daycareId");

-- CreateIndex
CREATE INDEX "vet_prescriptions_petId_idx" ON "vet_prescriptions"("petId");

-- CreateIndex
CREATE INDEX "vet_prescriptions_visitId_idx" ON "vet_prescriptions"("visitId");

-- CreateIndex
CREATE INDEX "vet_prescription_items_daycareId_idx" ON "vet_prescription_items"("daycareId");

-- CreateIndex
CREATE INDEX "vet_prescription_items_prescriptionId_idx" ON "vet_prescription_items"("prescriptionId");

-- CreateIndex
CREATE INDEX "vet_prescription_items_daycareId_dispensedAt_idx" ON "vet_prescription_items"("daycareId", "dispensedAt");

-- CreateIndex
CREATE INDEX "pet_vaccinations_vetVisitId_idx" ON "pet_vaccinations"("vetVisitId");

-- CreateIndex
CREATE INDEX "inventory_movements_itemId_idx" ON "inventory_movements"("itemId");

-- AddForeignKey
ALTER TABLE "pet_vaccinations" ADD CONSTRAINT "pet_vaccinations_veterinarianId_fkey" FOREIGN KEY ("veterinarianId") REFERENCES "veterinarians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_vaccinations" ADD CONSTRAINT "pet_vaccinations_vetVisitId_fkey" FOREIGN KEY ("vetVisitId") REFERENCES "vet_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_vetPrescriptionItemId_fkey" FOREIGN KEY ("vetPrescriptionItemId") REFERENCES "vet_prescription_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_preventives" ADD CONSTRAINT "vet_preventives_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_preventives" ADD CONSTRAINT "vet_preventives_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_preventives" ADD CONSTRAINT "vet_preventives_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_prescriptions" ADD CONSTRAINT "vet_prescriptions_veterinarianId_fkey" FOREIGN KEY ("veterinarianId") REFERENCES "veterinarians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_prescription_items" ADD CONSTRAINT "vet_prescription_items_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_prescription_items" ADD CONSTRAINT "vet_prescription_items_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "vet_prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_prescription_items" ADD CONSTRAINT "vet_prescription_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

