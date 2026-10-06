import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cls } from "../lib/cls";

/** The page's one easing curve: an exponential ease-out. */
export const EASE = [0.16, 1, 0.3, 1] as const;

const EASE_CSS = `cubic-bezier(${EASE.join(", ")})`;

/**
 * The entrance and the sliding pill are CSS, driven by a class or a measured box, so neither
 * waits for Motion's engine (a later chunk) nor needs its layout projection. A visitor who asked
 * for less motion gets the content in place and the pill without the slide.
 */
export const REVEAL_STYLES = `
@media (prefers-reduced-motion: no-preference) {
  .landing-reveal {
    opacity: 0;
    transform: translateY(var(--reveal-rise, 20px));
    transition:
      opacity var(--reveal-duration, 0.6s) ${EASE_CSS} var(--reveal-delay, 0s),
      transform var(--reveal-duration, 0.6s) ${EASE_CSS} var(--reveal-delay, 0s);
  }
  .landing-reveal[data-revealed] {
    opacity: 1;
    transform: none;
  }
  .landing-pill[data-sliding] {
    transition:
      transform 0.35s ${EASE_CSS},
      width 0.35s ${EASE_CSS},
      height 0.35s ${EASE_CSS},
      background-color 0.35s ${EASE_CSS};
  }
}`;

/** Marks its element once, the first time `amount` of it is inside the viewport. */
export function useReveal<T extends HTMLElement>(amount = 0.25) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      node.dataset.revealed = "";
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        node.dataset.revealed = "";
        observer.disconnect();
      },
      { threshold: amount },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [amount]);
  return ref;
}

/** The custom properties `landing-reveal` reads; every one has a default in the stylesheet. */
export function revealStyle(options: { delay?: number; rise?: number; duration?: number }) {
  return {
    ...(options.delay ? { "--reveal-delay": `${options.delay}s` } : {}),
    ...(options.rise !== undefined ? { "--reveal-rise": `${options.rise}px` } : {}),
    ...(options.duration !== undefined ? { "--reveal-duration": `${options.duration}s` } : {}),
  } as CSSProperties;
}

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
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={cls("landing-reveal", className)} style={revealStyle({ delay })}>
      {children}
    </div>
  );
}

interface PillBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One highlight that slides to whichever option is selected.
 *
 * The options register themselves with `option(id)`; the pill is laid over the selected one's
 * box, measured against the group (which must be positioned) and measured again when the group
 * resizes, since a row of tabs wraps on a phone.
 */
export function useSlidingPill<K extends string>(selected: K) {
  const group = useRef<HTMLDivElement>(null);
  const options = useRef<Partial<Record<K, HTMLElement | null>>>({});
  const [box, setBox] = useState<PillBox | null>(null);
  // The pill is placed, not slid, the first time: it has nowhere to come from.
  const [sliding, setSliding] = useState(false);

  useLayoutEffect(() => {
    function measure() {
      const node = options.current[selected];
      if (!node) return;
      setBox({
        x: node.offsetLeft,
        y: node.offsetTop,
        width: node.offsetWidth,
        height: node.offsetHeight,
      });
    }
    measure();
    if (typeof ResizeObserver === "undefined" || !group.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(group.current);
    return () => observer.disconnect();
  }, [selected]);

  useEffect(() => {
    if (!box || sliding) return;
    const frame = requestAnimationFrame(() => setSliding(true));
    return () => cancelAnimationFrame(frame);
  }, [box, sliding]);

  return {
    group,
    option: (id: K) => (node: HTMLElement | null) => {
      options.current[id] = node;
    },
    pill: (className: string) =>
      box && (
        <span
          aria-hidden="true"
          data-sliding={sliding ? "" : undefined}
          className={cls("landing-pill pointer-events-none absolute left-0 top-0", className)}
          style={{
            width: box.width,
            height: box.height,
            transform: `translate(${box.x}px, ${box.y}px)`,
          }}
        />
      ),
  };
}
