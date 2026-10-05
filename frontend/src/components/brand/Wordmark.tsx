import { cls } from "../../lib/cls";

const SIZES = {
  md: { argos: "text-xl", suite: "text-[9px]" },
  lg: { argos: "text-3xl", suite: "text-[11px]" },
} as const;

/**
 * Type-only stand-in for the Argos griego lockup while the final artwork is pending.
 *
 * Written with a normal A: the Greek lambda belongs to the drawn logo alone. "ARGOS" never
 * renders below 20px (the 20 Pixel Rule); "SUITE" is set in the interface font because Cinzel
 * is not allowed at that size.
 */
export function Wordmark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      role="img"
      aria-label="Argos Suite"
      className={cls("inline-flex flex-col leading-none", className)}
    >
      <span aria-hidden="true" className={cls("font-wordmark font-bold tracking-[0.1em]", s.argos)}>
        ARGOS
      </span>
      <span
        aria-hidden="true"
        className={cls("mt-1 font-semibold tracking-[0.42em] opacity-70", s.suite)}
      >
        SUITE
      </span>
    </span>
  );
}
