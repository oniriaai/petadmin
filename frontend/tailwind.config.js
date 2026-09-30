/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // The design tokens from src/styles.css, exposed to Tailwind so pages can use
        // `bg-surface` / `text-muted` instead of re-deriving slate-*. Defined as CSS variables
        // rather than literals so `[data-theme="platform"]` retheme the console for free.
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        raised: "var(--color-raised)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
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

        // Business-unit accents. `daycare` is the amber ramp, `grooming` the violet one.
        // Use these instead of raw amber-*/violet-* so the unit accent lives in one place.
        daycare: {
          50: "#fffbeb", 100: "#fef3c7", 500: "#f59e0b", 600: "#d97706",
          700: "#b45309", 800: "#92400e", 900: "#78350f",
        },
        grooming: {
          50: "#f5f3ff", 100: "#ede9fe", 500: "#8b5cf6", 600: "#7c3aed",
          700: "#6d28d9", 800: "#5b21b6", 900: "#4c1d95",
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
