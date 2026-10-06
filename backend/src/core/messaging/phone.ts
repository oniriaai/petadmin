/**
 * Phone numbers as WhatsApp wants them: digits only, country code first, no "+".
 *
 * Tutors' numbers are typed by hand at the front desk, so they arrive as "099 123 4567",
 * "+593 99 123 4567" or "0991234567" depending on who typed them. A number without its country
 * code reaches the wrong chat or none at all, which is what the old wa.me link did.
 */

/** Ecuador. Overridable for an installation that serves another country. */
export const DEFAULT_COUNTRY_CODE = (process.env.DEFAULT_COUNTRY_CODE ?? "593").replace(/\D/g, "");

/** A national number, without trunk prefix or country code, is at least this long. */
const MIN_NATIONAL_DIGITS = 8;
/** E.164 allows fifteen digits in all. */
const MAX_DIGITS = 15;

/**
 * The number in international format, or null when it cannot be one.
 *
 * A leading "+" or "00" means the country code is already there. A leading "0" is the national
 * trunk prefix and is dropped before the country code goes on. Anything else is taken as
 * already international when it starts with the default country code, national otherwise.
 */
export function toE164(
  raw: string | null | undefined,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let full: string;
  if (trimmed.startsWith("+")) full = digits;
  else if (digits.startsWith("00")) full = digits.slice(2);
  else if (digits.startsWith("0")) full = countryCode + digits.slice(1);
  else if (
    digits.startsWith(countryCode) &&
    digits.length >= countryCode.length + MIN_NATIONAL_DIGITS
  )
    full = digits;
  else full = countryCode + digits;

  if (full.length < MIN_NATIONAL_DIGITS + 1 || full.length > MAX_DIGITS) return null;
  return full;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The address trimmed, or null when it is not one. */
export function toEmailAddress(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim();
  return EMAIL.test(trimmed) ? trimmed : null;
}
