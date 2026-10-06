import { defineConfig, loadEnv } from "vite";
import type { HtmlTagDescriptor, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Preloads the two latin faces every screen paints with (Inter and Marcellus). Without it the
 * browser finds them only after the stylesheet has loaded and text has been laid out.
 */
function preloadFonts(): Plugin {
  const faces = /(inter-latin-wght-normal|marcellus-latin-400-normal)-[\w-]+\.woff2$/;
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
 * Asks for the page's own chunk while the entry script is still downloading.
 *
 * `src/main.tsx` chooses between the landing, the signup and the application at run time, so
 * the HTML cannot name the chunk and the browser would learn of it only once the entry script
 * had run. The inline script below makes the same choice (keep the two in step) and adds the
 * `modulepreload` links for that chunk and what it imports. For the landing it also preloads
 * the hero screenshot, whose `imagesizes` must match the `Shot` in `Hero` (src/pages/Landing.tsx).
 *
 * Build only: the dev server has no bundle to read.
 */
function preloadRoute(): Plugin {
  const HERO_SIZES = "(min-width: 1024px) min(62vw, 780px), 100vw";
  const HERO_WIDTHS = [640, 960, 1440, 2160];
  return {
    name: "preload-route",
    transformIndexHtml: {
      order: "post",
      handler(_html, ctx): HtmlTagDescriptor[] {
        const bundle = ctx.bundle;
        if (!bundle) return [];
        const chunks = Object.values(bundle).filter((file) => file.type === "chunk");
        const entry = chunks.find((chunk) => chunk.isEntry);

        /** The chunk built from `source` and everything it imports statically, entry excluded. */
        const filesFor = (source: string): string[] => {
          // By the module it holds: a dynamic entry that also exports to other chunks has no facade.
          const root = chunks.find(
            (chunk) => chunk.isDynamicEntry && chunk.moduleIds.some((id) => id.endsWith(source)),
          );
          if (!root) return [];
          const seen = new Set<string>(entry ? [entry.fileName] : []);
          const visit = (fileName: string) => {
            if (seen.has(fileName)) return;
            seen.add(fileName);
            const chunk = bundle[fileName];
            if (chunk?.type === "chunk") chunk.imports.forEach(visit);
          };
          visit(root.fileName);
          if (entry) seen.delete(entry.fileName);
          return [...seen].map((fileName) => `/${fileName}`);
        };

        const hero = HERO_WIDTHS.map((width) => {
          const pattern = new RegExp(`(^|/)panel-${width}-[\\w-]+\\.webp$`);
          const fileName = Object.keys(bundle).find((name) => pattern.test(name));
          return fileName ? `/${fileName} ${width}w` : null;
        });

        const routes = {
          landing: filesFor("/src/pages/Landing.tsx"),
          signup: filesFor("/src/pages/signup/SignupApp.tsx"),
          app: filesFor("/src/App.tsx"),
          hero: hero.every(Boolean) ? { srcset: hero.join(", "), sizes: HERO_SIZES } : null,
        };

        const script = `(function(r){var d=document,p=location.pathname.replace(/\\/+$/,""),s=false;try{s=localStorage.getItem("token")!==null}catch(e){}var k=p==="/bienvenida"||(p===""&&!s)?"landing":p==="/registro"||p.indexOf("/registro/")===0?"signup":"app";r[k].forEach(function(h){var l=d.createElement("link");l.rel="modulepreload";l.href=h;d.head.appendChild(l)});if(k==="landing"&&r.hero){var i=d.createElement("link");i.rel="preload";i.as="image";i.type="image/webp";i.setAttribute("imagesrcset",r.hero.srcset);i.setAttribute("imagesizes",r.hero.sizes);i.setAttribute("fetchpriority","high");d.head.appendChild(i)}})(${JSON.stringify(
          routes,
        ).replace(/</g, "\\u003c")});`;

        return [{ tag: "script", children: script, injectTo: "head" }];
      },
    },
  };
}

/**
 * Opens the connection to the API while the page's script loads, when the API is on another
 * origin (production and the demo). Both public pages start by reading the price list from it.
 */
function preconnectApi(apiUrl: string | undefined): Plugin {
  let origin: string | undefined;
  try {
    origin = apiUrl ? new URL(apiUrl).origin : undefined;
  } catch {
    origin = undefined;
  }
  return {
    name: "preconnect-api",
    transformIndexHtml(): HtmlTagDescriptor[] {
      if (!origin) return [];
      return [
        {
          tag: "link",
          attrs: { rel: "preconnect", href: origin, crossorigin: true },
          injectTo: "head",
        },
      ];
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [
      react(),
      tailwindcss(),
      preloadFonts(),
      preloadRoute(),
      preconnectApi(env.VITE_API_URL),
      publishCommit(),
      seo(env.VITE_SITE_URL),
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
  };
});
