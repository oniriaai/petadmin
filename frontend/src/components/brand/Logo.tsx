import { cls } from "../../lib/cls";
import lockupColor from "../../assets/brand/svg/argos-vasija-lockup-color.svg";
import lockupOnDark from "../../assets/brand/svg/argos-vasija-lockup-on-dark.svg";
import markColor from "../../assets/brand/svg/argos-vasija-mark-color.svg";

// The lockup's drawing box: 378 x 164, of which 24 on every side is padding.
const LOCKUP_WIDTH = 378;
const LOCKUP_HEIGHT = 164;
const LOCKUP_BLEED = `${(-24 / LOCKUP_WIDTH) * 100}%`;

/**
 * The Vasija lockup: hound on its disc, ΛRGOS, SUITE and the meander band.
 *
 * `tone` names the background it sits on: "dark" for the shell and the platform console (Mármol
 * wordmark), "light" for Mármol and white (Tinta wordmark), "auto" for a page that follows the
 * visitor's colour scheme (the landing). Size it with a width class on `className`, never below
 * 120px (BRAND.md, Logo); the height follows the artwork.
 *
 * The artwork's own padding is pulled back so the disc sits on the content edge. Clear space is
 * the caller's: leave at least the height of the Λ around it.
 */
export function Lockup({
  tone = "light",
  className,
}: {
  tone?: "light" | "dark" | "auto";
  className?: string;
}) {
  return (
    <picture className={cls("inline-block shrink-0", className)}>
      {tone === "auto" && <source srcSet={lockupOnDark} media="(prefers-color-scheme: dark)" />}
      <img
        src={tone === "dark" ? lockupOnDark : lockupColor}
        alt="Argos Suite"
        width={LOCKUP_WIDTH}
        height={LOCKUP_HEIGHT}
        className="block h-auto w-full max-w-none"
        // A percentage margin resolves against the wrapper's width on all four sides.
        style={{ margin: LOCKUP_BLEED }}
        draggable={false}
      />
    </picture>
  );
}

/**
 * The mark alone, for anywhere too small for the lockup (collapsed sidebar, tight headers).
 * Below 48px it switches to the favicon drawing: the hound enlarged and the eye dropped, so the
 * shape still reads. It is the same on light and dark backgrounds.
 */
export function Mark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src={size < 48 ? "/favicon.svg" : markColor}
      alt="Argos Suite"
      width={size}
      height={size}
      className={cls("block shrink-0", className)}
      draggable={false}
    />
  );
}
