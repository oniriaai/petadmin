import type { Prisma } from "@prisma/client";

import { AuthzError } from "../../middleware/auth";

export type StockMovementType = "ENTRADA" | "SALIDA" | "AJUSTE";

export interface StockMovementInput {
  daycareId: string;
  itemId: string;
  type: StockMovementType;
  /** For ENTRADA and SALIDA the amount moved; for AJUSTE the resulting stock level. */
  quantity: number;
  cost?: number;
  reason?: string;
  date?: Date;
  lotNumber?: string;
  expiresAt?: Date;
  vetPrescriptionItemId?: string;
  /** Refuse a SALIDA that would take the stock below zero. */
  requireStock?: boolean;
}

/**
 * Records one stock movement and applies it to the item's level, inside the caller's transaction.
 *
 * This lives in Core because two modules move stock: the inventory screen, and the clinic when it
 * dispenses a prescription. The movement and the level used to be two independent writes in the
 * inventory router, so a failure between them left a movement the stock never reflected.
 *
 * The item is resolved against `daycareId` here, so a caller cannot move another tenant's stock
 * by passing its id.
 */
export async function recordStockMovement(tx: Prisma.TransactionClient, input: StockMovementInput) {
  const item = await tx.inventoryItem.findFirst({
    where: { id: input.itemId, daycareId: input.daycareId },
    select: { id: true, name: true },
  });
  if (!item) throw new AuthzError(404, "Item no encontrado");

  if (input.type === "AJUSTE") {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { currentStock: input.quantity },
    });
  } else if (input.type === "SALIDA" && input.requireStock) {
    // Conditional on the level, so two simultaneous dispensings cannot both take the last unit.
    const taken = await tx.inventoryItem.updateMany({
      where: { id: item.id, daycareId: input.daycareId, currentStock: { gte: input.quantity } },
      data: { currentStock: { decrement: input.quantity } },
    });
    if (taken.count === 0) {
      throw new AuthzError(409, `Stock insuficiente de ${item.name}`);
    }
  } else {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        currentStock: { increment: input.type === "SALIDA" ? -input.quantity : input.quantity },
      },
    });
  }

  return tx.inventoryMovement.create({
    data: {
      itemId: item.id,
      type: input.type,
      quantity: input.quantity,
      cost: input.cost,
      reason: input.reason,
      date: input.date ?? new Date(),
      lotNumber: input.lotNumber,
      expiresAt: input.expiresAt,
      vetPrescriptionItemId: input.vetPrescriptionItemId,
    },
  });
}
