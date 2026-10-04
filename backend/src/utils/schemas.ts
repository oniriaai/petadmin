import { z } from "zod";

/**
 * Schema for creating a standalone CheckInOut record (ad-hoc visit)
 */
export const createCheckInOutSchema = z
  .object({
    petId: z.string().optional(),
    petIds: z.array(z.string()).optional(),
    clientId: z.string().min(1, "Client ID is required"),
    roomId: z.string().min(1, "Room ID is required"),
    reservationId: z.string().optional(),
    notes: z.string().optional(),
    checkInNow: z.boolean().optional(),
  })
  .refine((data) => data.petId || (data.petIds && data.petIds.length > 0), {
    message: "Either petId or petIds must be provided",
    path: ["petId"],
  });

/**
 * Schema for registering a check-in
 */
export const checkInSchema = z.object({
  checkInTime: z.string().datetime().optional(),
  performedByUserId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Schema for registering a check-out
 */
export const checkOutSchema = z.object({
  checkOutTime: z.string().datetime().optional(),
  performedByUserId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Schema for updating notes only
 */
export const updateNotesSchema = z.object({
  notes: z.string(),
});

export type CreateCheckInOutRequest = z.infer<typeof createCheckInOutSchema>;
export type CheckInRequest = z.infer<typeof checkInSchema>;
export type CheckOutRequest = z.infer<typeof checkOutSchema>;
export type UpdateNotesRequest = z.infer<typeof updateNotesSchema>;
