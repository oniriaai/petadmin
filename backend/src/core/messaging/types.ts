export const CHANNELS = ["WHATSAPP", "EMAIL"] as const;
export type Channel = (typeof CHANNELS)[number];

export function isChannel(value: unknown): value is Channel {
  return (CHANNELS as readonly unknown[]).includes(value);
}

export interface DeliveryResult {
  /** `log` is the stand-in used where no provider is configured outside production. */
  transport: "meta" | "smtp" | "log";
  providerMessageId: string | null;
}

/** A send that did not happen, with a message that is safe to store and to show to staff. */
export class DeliveryError extends Error {}
