CREATE UNIQUE INDEX "reservations_recurringPlanId_checkIn_key"
ON "reservations"("recurringPlanId", "checkIn");
