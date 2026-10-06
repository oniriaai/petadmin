import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption at rest for what a saved card needs: PayPhone's token and the cardholder's name.
 *
 * Neither is a card number, but the token is what a charge is made with, so a copy of the
 * database alone must not be enough to make one.
 */

function key(): Buffer {
  const secret =
    process.env.BILLING_ENCRYPTION_KEY?.trim() ||
    // Outside production the signing secret stands in, so the dev stack needs nothing new.
    // `assertSecureConfig` refuses to boot a production process that charges without the key.
    (process.env.NODE_ENV === "production" ? "" : (process.env.JWT_SECRET ?? "change_me"));
  if (!secret) throw new Error("BILLING_ENCRYPTION_KEY no está definido");
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM, as `v1.<iv>.<tag>.<ciphertext>` in base64url. */
export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

/** Null when the value cannot be read with the current key, rather than a throw mid-charge. */
export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
