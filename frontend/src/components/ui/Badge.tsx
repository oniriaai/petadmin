import React from "react";
import { cls } from "../../lib/utils";

/** Semantic badge tones. Unit tones mark a business unit, never a status. */
export const TONES = {
  neutral: "bg-sunken text-muted",
  info: "bg-info-soft text-info-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  daycare: "bg-daycare-50 text-daycare-800",
  grooming: "bg-grooming-50 text-grooming-700",
  veterinary: "bg-veterinary-50 text-veterinary-800",
} as const;

export type Tone = keyof typeof TONES;

interface Props {
  children: React.ReactNode;
  tone?: Tone;
  /** Raw classes, for the status maps that already carry their own. Prefer `tone`. */
  color?: string;
  className?: string;
}

export function Badge({ children, tone, color, className }: Props) {
  return (
    <span className={cls("badge", tone ? TONES[tone] : (color ?? TONES.neutral), className)}>
      {children}
    </span>
  );
}
