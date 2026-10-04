/** @type {import('tailwindcss').Config} */

// A status tone: `DEFAULT` for fills and icons, `soft` for the tint behind a badge or notice,
// `ink` for text on that tint and `line` for its border.
const tone = (name) => ({
  DEFAULT: `var(--color-${name})`,
  soft: `var(--color-${name}-soft)`,
  ink: `var(--color-${name}-ink)`,
  line: `var(--color-${name}-line)`,
});

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
        // The 20 Pixel Rule (BRAND.md): these two never render below 20px.
        display: ["Marcellus", "Georgia", "serif"],
        wordmark: ["Cinzel", '"Times New Roman"', "serif"],
      },
      colors: {
        // The design tokens from src/styles.css, exposed to Tailwind so pages can use
        // `bg-surface` / `text-muted` instead of re-deriving stone-*. Defined as CSS variables
        // rather than literals so `[data-theme="platform"]` retheme the console for free.
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        raised: "var(--color-raised)",
        sunken: "var(--color-sunken)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        // Decorative icons only; too light to carry text.
        faint: "var(--color-faint)",
        line: "var(--color-border)",
        "line-subtle": "var(--color-border-subtle)",
        action: {
          DEFAULT: "var(--color-action)",
          hover: "var(--color-action-hover)",
        },
        shell: {
          DEFAULT: "var(--color-shell)",
          ink: "var(--color-shell-ink)",
          muted: "var(--color-shell-muted)",
        },
        // Decorative only (the meander on the dark shell). Never text on a light background.
        oro: "#ca8a04",

        danger: tone("danger"),
        success: tone("success"),
        warning: tone("warning"),
        info: tone("info"),

        // Business-unit accents: Terracota (Guardería), Púrpura de Tiro (Peluquería) and
        // Verde Olivo (Veterinaria). A unit's 500 is never text on a light background; text
        // starts at 600 for terracotta and purple and at 700 for olive.
        daycare: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          500: "#ea580c",
          600: "#c2410c",
          700: "#9a3412",
          800: "#7c2d12",
          900: "#431407",
        },
        grooming: {
          50: "#faf5ff",
          100: "#f3e8ff",
          200: "#e9d5ff",
          500: "#a855f7",
          600: "#9333ea",
          700: "#7e22ce",
          800: "#6b21a8",
          900: "#581c87",
        },
        veterinary: {
          50: "#f7fee7",
          100: "#ecfccb",
          200: "#d9f99d",
          500: "#84cc16",
          600: "#65a30d",
          700: "#4d7c0f",
          800: "#3f6212",
          900: "#365314",
        },
      },
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
      },
      width: {
        sidebar: "var(--shell-sidebar-width)",
        "sidebar-collapsed": "var(--shell-sidebar-collapsed)",
      },
      zIndex: {
        shell: "40",
        drawer: "50",
      },
    },
  },
  plugins: [],
};
