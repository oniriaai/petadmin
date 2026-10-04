-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "bloodType" TEXT,
ADD COLUMN     "chronicConditions" TEXT,
ADD COLUMN     "deathCause" TEXT,
ADD COLUMN     "deceasedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pet_documents" ADD COLUMN     "vetVisitId" TEXT;

-- AlterTable
ALTER TABLE "veterinarians" ADD COLUMN     "isExternal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "specialty" TEXT,
ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "vet_services" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'CONSULTA',
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "basePrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vet_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_visits" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "veterinarianId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'CONSULTA',
    "triage" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PROGRAMADA',
    "reason" TEXT,
    "anamnesis" TEXT,
    "physicalExam" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "followUpDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vet_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_vitals" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "visitId" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weightKg" DOUBLE PRECISION,
    "temperatureC" DOUBLE PRECISION,
    "heartRate" INTEGER,
    "respiratoryRate" INTEGER,
    "mucousMembranes" TEXT,
    "capillaryRefill" TEXT,
    "bodyCondition" INTEGER,
    "painScore" INTEGER,
    "notes" TEXT,

    CONSTRAINT "vet_vitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_diagnoses" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "code" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'PRESUNTIVO',
    "isChronic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vet_visit_charges" (
    "id" TEXT NOT NULL,
    "daycareId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "vetServiceId" TEXT,
    "inventoryItemId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vet_visit_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vet_services_daycareId_idx" ON "vet_services"("daycareId");

-- CreateIndex
CREATE UNIQUE INDEX "vet_visits_reservationId_key" ON "vet_visits"("reservationId");

-- CreateIndex
CREATE INDEX "vet_visits_daycareId_idx" ON "vet_visits"("daycareId");

-- CreateIndex
CREATE INDEX "vet_visits_daycareId_status_idx" ON "vet_visits"("daycareId", "status");

-- CreateIndex
CREATE INDEX "vet_visits_petId_idx" ON "vet_visits"("petId");

-- CreateIndex
CREATE INDEX "vet_vitals_daycareId_idx" ON "vet_vitals"("daycareId");

-- CreateIndex
CREATE INDEX "vet_vitals_petId_idx" ON "vet_vitals"("petId");

-- CreateIndex
CREATE INDEX "vet_vitals_visitId_idx" ON "vet_vitals"("visitId");

-- CreateIndex
CREATE INDEX "vet_diagnoses_daycareId_idx" ON "vet_diagnoses"("daycareId");

-- CreateIndex
CREATE INDEX "vet_diagnoses_petId_idx" ON "vet_diagnoses"("petId");

-- CreateIndex
CREATE INDEX "vet_diagnoses_visitId_idx" ON "vet_diagnoses"("visitId");

-- CreateIndex
CREATE INDEX "vet_visit_charges_daycareId_idx" ON "vet_visit_charges"("daycareId");

-- CreateIndex
CREATE INDEX "vet_visit_charges_visitId_idx" ON "vet_visit_charges"("visitId");

-- CreateIndex
CREATE INDEX "pet_documents_vetVisitId_idx" ON "pet_documents"("vetVisitId");

-- CreateIndex
CREATE UNIQUE INDEX "veterinarians_userId_key" ON "veterinarians"("userId");

-- AddForeignKey
ALTER TABLE "pet_documents" ADD CONSTRAINT "pet_documents_vetVisitId_fkey" FOREIGN KEY ("vetVisitId") REFERENCES "vet_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veterinarians" ADD CONSTRAINT "veterinarians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_services" ADD CONSTRAINT "vet_services_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visits" ADD CONSTRAINT "vet_visits_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visits" ADD CONSTRAINT "vet_visits_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visits" ADD CONSTRAINT "vet_visits_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visits" ADD CONSTRAINT "vet_visits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visits" ADD CONSTRAINT "vet_visits_veterinarianId_fkey" FOREIGN KEY ("veterinarianId") REFERENCES "veterinarians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_vitals" ADD CONSTRAINT "vet_vitals_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_vitals" ADD CONSTRAINT "vet_vitals_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_vitals" ADD CONSTRAINT "vet_vitals_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_diagnoses" ADD CONSTRAINT "vet_diagnoses_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_diagnoses" ADD CONSTRAINT "vet_diagnoses_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_diagnoses" ADD CONSTRAINT "vet_diagnoses_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_charges" ADD CONSTRAINT "vet_visit_charges_daycareId_fkey" FOREIGN KEY ("daycareId") REFERENCES "daycares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_charges" ADD CONSTRAINT "vet_visit_charges_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "vet_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_charges" ADD CONSTRAINT "vet_visit_charges_vetServiceId_fkey" FOREIGN KEY ("vetServiceId") REFERENCES "vet_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vet_visit_charges" ADD CONSTRAINT "vet_visit_charges_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

