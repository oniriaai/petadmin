import type { BusinessUnit } from "../modules/shared/contracts";

/**
 * One place for each business unit's colour, so a screen never mixes two (the One Unit Rule).
 *
 * `text` respects the Text Shade Rule: 600 for Terracota and Púrpura, 700 for Olivo, whose 600 is
 * only 2.9 : 1 on Mármol.
 */
export interface UnitTheme {
  /** Hex, for places that need a raw colour: the sidebar accent and the meander. */
  accent: string;
  text: string;
  badge: string;
  fill: string;
  soft: string;
  border: string;
  tile: string;
}

const NEUTRAL: UnitTheme = {
  accent: "#ca8a04",
  text: "text-action",
  badge: "bg-sunken text-muted",
  fill: "bg-action",
  soft: "bg-sunken",
  border: "border-line-subtle",
  tile: "bg-white/15",
};

const THEMES: Record<BusinessUnit, UnitTheme> = {
  DAYCARE: {
    accent: "#ea580c",
    text: "text-daycare-600",
    badge: "bg-daycare-50 text-daycare-800",
    fill: "bg-daycare-500",
    soft: "bg-daycare-50",
    border: "border-daycare-200",
    tile: "bg-daycare-600",
  },
  GROOMING: {
    accent: "#a855f7",
    text: "text-grooming-600",
    badge: "bg-grooming-50 text-grooming-700",
    fill: "bg-grooming-500",
    soft: "bg-grooming-50",
    border: "border-grooming-200",
    tile: "bg-grooming-700",
  },
  VETERINARY: {
    accent: "#84cc16",
    text: "text-veterinary-700",
    badge: "bg-veterinary-50 text-veterinary-800",
    fill: "bg-veterinary-600",
    soft: "bg-veterinary-50",
    border: "border-veterinary-200",
    tile: "bg-veterinary-700",
  },
};

export function unitTheme(unit: BusinessUnit | null | undefined): UnitTheme {
  return (unit && THEMES[unit]) || NEUTRAL;
}
