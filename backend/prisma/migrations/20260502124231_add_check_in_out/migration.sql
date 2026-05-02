-- CreateTable CheckInOut
CREATE TABLE "check_in_outs" (
    "id" TEXT NOT NULL,
    "businessUnit" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "reservationId" TEXT,
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "performedByUserId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "check_in_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "check_in_outs_reservationId_idx" ON "check_in_outs"("reservationId");

-- CreateIndex
CREATE INDEX "check_in_outs_petId_idx" ON "check_in_outs"("petId");

-- CreateIndex
CREATE INDEX "check_in_outs_roomId_idx" ON "check_in_outs"("roomId");

-- CreateIndex
CREATE INDEX "check_in_outs_businessUnit_idx" ON "check_in_outs"("businessUnit");

-- CreateIndex
CREATE INDEX "check_in_outs_checkInTime_idx" ON "check_in_outs"("checkInTime");

-- CreateIndex
CREATE INDEX "check_in_outs_checkOutTime_idx" ON "check_in_outs"("checkOutTime");

-- AddForeignKey
ALTER TABLE "check_in_outs" ADD CONSTRAINT "check_in_outs_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_outs" ADD CONSTRAINT "check_in_outs_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_outs" ADD CONSTRAINT "check_in_outs_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_outs" ADD CONSTRAINT "check_in_outs_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "check_in_outs" ADD CONSTRAINT "check_in_outs_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Update Reservation to add checkInOuts relationship (no column change needed - handled by Prisma)
