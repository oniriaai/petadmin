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

/**
 * Publishes the commit a hosted build was made from as /version.txt, which is how the demo's
 * deploy workflow knows what the static site is serving. Emitted by the build itself, not by
 * the host's build command: that command lives in the host's settings and can lag behind the
 * repository. Nothing is written when the host does not say which commit it is building.
 */
function publishCommit(): Plugin {
  return {
    name: "publish-commit",
    generateBundle() {
      const commit = process.env.RENDER_GIT_COMMIT;
      if (!commit) return;
      this.emitFile({ type: "asset", fileName: "version.txt", source: `${commit}\n` });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadFonts(), publishCommit()],
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
