import { defineConfig, loadEnv } from "vite";
import type { HtmlTagDescriptor, Plugin } from "vite";
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

const DESCRIPTION =
  "Software de gestión para guarderías caninas, peluquerías y clínicas veterinarias: reservas, " +
  "cupos, citas, fichas clínicas, cobros e inventario en un solo lugar.";

/**
 * What a crawler reads: robots.txt, the sitemap, the canonical link and the structured data.
 *
 * All of them need the address the site is published at, which only the deployment knows, so it
 * comes from VITE_SITE_URL. A build that does not say where it lives is kept out of search
 * instead: that is every local build, CI, and the demo until someone opts it in.
 *
 * Only the landing is listed. Every other route is the application, which marks itself noindex
 * (src/App.tsx); robots.txt does not disallow those routes, because a page a crawler may not
 * fetch is a page whose noindex it never sees.
 */
function seo(siteUrl: string | undefined): Plugin {
  const site = siteUrl?.trim().replace(/\/+$/, "") || undefined;

  const graph = [
    {
      "@type": "Organization",
      "@id": `${site ?? ""}/#organization`,
      name: "Argos Suite",
      ...(site && { url: `${site}/`, logo: `${site}/android-chrome-512x512.png` }),
    },
    {
      "@type": "WebSite",
      "@id": `${site ?? ""}/#website`,
      name: "Argos Suite",
      inLanguage: "es",
      publisher: { "@id": `${site ?? ""}/#organization` },
      ...(site && { url: `${site}/` }),
    },
    {
      "@type": "SoftwareApplication",
      name: "Argos Suite",
      description: DESCRIPTION,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "es",
      publisher: { "@id": `${site ?? ""}/#organization` },
      ...(site && { url: `${site}/` }),
    },
  ];

  return {
    name: "seo",
    generateBundle() {
      const robots = site
        ? `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`
        : "User-agent: *\nDisallow: /\n";
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
      if (!site) return;
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `  <url><loc>${site}/</loc></url>\n` +
          "</urlset>\n",
      });
    },
    transformIndexHtml(): HtmlTagDescriptor[] {
      return [
        { tag: "meta", attrs: { name: "description", content: DESCRIPTION }, injectTo: "head" },
        site
          ? { tag: "link", attrs: { rel: "canonical", href: `${site}/` }, injectTo: "head" }
          : { tag: "meta", attrs: { name: "robots", content: "noindex" }, injectTo: "head" },
        {
          tag: "script",
          attrs: { type: "application/ld+json" },
          // "<" is escaped so that no value can close the script element.
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@graph": graph,
          }).replace(/</g, "\\u003c"),
          injectTo: "head",
        },
      ];
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    preloadFonts(),
    publishCommit(),
    seo(loadEnv(mode, process.cwd(), "VITE_").VITE_SITE_URL),
  ],
  server: {
    host: "0.0.0.0",
    port: 5174,
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
  },
}));
