import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Preloads the three latin faces every screen paints with (Inter, Marcellus, Cinzel). Without
 * it the browser finds them only after the stylesheet has loaded and text has been laid out.
 */
function preloadFonts(): Plugin {
  const faces =
    /(inter-latin-wght-normal|marcellus-latin-400-normal|cinzel-latin-700-normal)-[\w-]+\.woff2$/;
  return {
    name: "preload-fonts",
    transformIndexHtml: {
      order: "post",
      handler: (_html, ctx) =>
        Object.keys(ctx.bundle ?? {})
          .filter((fileName) => faces.test(fileName))
          .map((fileName) => ({
            tag: "link",
            attrs: {
              rel: "preload",
              as: "font",
              type: "font/woff2",
              href: `/${fileName}`,
              crossorigin: true,
            },
            injectTo: "head",
          })),
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts()],
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
  },
});
