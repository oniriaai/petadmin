import { useId } from "react";
import { cls } from "../../lib/utils";

/**
 * The Greek-key band.
 *
 * Drawn as an SVG shape, never from text characters (BRAND.md, Shapes). It takes its colour from
 * `currentColor`: Azul Egeo on light backgrounds, Oro on the dark shell, or a unit's colour inside
 * that unit's screens.
 */
export function Meander({ className, height = 8 }: { className?: string; height?: number }) {
  const id = useId();
  return (
    <svg
      className={cls("block w-full", className)}
      height={height}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={id}
          width="12"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform={`scale(${height / 8})`}
        >
          <path
            d="M0 7.5H12M0.5 7.5V1.5H8.5V5.5H4.5V3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height={height} fill={`url(#${id})`} />
    </svg>
  );
}
