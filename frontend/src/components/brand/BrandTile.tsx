import { cls } from "../../lib/utils";

/**
 * The small mark: where the Sello griego will go once it exists (collapsed sidebar, tight
 * headers). Until then, a Cinzel "A" in a 12px-radius tile.
 */
export function BrandTile({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Argos Suite"
      className={cls(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10",
        className,
      )}
    >
      <span aria-hidden="true" className="font-wordmark text-xl font-bold leading-none">
        A
      </span>
    </span>
  );
}
