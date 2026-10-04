import { describe, it, expect } from "vitest";

/**
 * BRAND.md: "read colors from tokens, never raw Tailwind palette classes".
 *
 * A raw `text-gray-500` or `bg-red-100` does not follow the vendor console's theme and drifts
 * from the marble-and-ink palette. Use `ink` / `muted` / `sunken` / `line`, the `danger` /
 * `success` / `warning` / `info` tones, `action`, or a unit ramp (`daycare-*`, `grooming-*`,
 * `veterinary-*`).
 */
const RAW_PALETTE =
  /\b(?:bg|text|border|ring|divide|outline|from|to|via|fill|stroke|placeholder|shadow|decoration|accent|caret)-(?:[trblxyse]-)?(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

// Vite inlines every source file as text, so the scan needs no Node file-system types.
const sources = import.meta.glob<string>(["../**/*.{ts,tsx,css}", "!../test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("design tokens", () => {
  it("uses no raw Tailwind palette classes", () => {
    const offenders = Object.entries(sources).flatMap(([file, text]) =>
      (text.match(RAW_PALETTE) ?? []).map((match) => `${file}: ${match}`),
    );
    expect(Object.keys(sources).length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });

  it("does not ship the old product name", () => {
    const offenders = Object.entries(sources)
      .filter(([, text]) => text.includes("Pethijos Admin"))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
