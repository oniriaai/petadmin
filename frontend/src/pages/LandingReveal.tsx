import type { ReactNode } from "react";
import { m } from "motion/react";

/** The page's one easing curve: an exponential ease-out. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Content arrives once as its section enters the viewport, so the page reads in order. */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </m.div>
  );
}
