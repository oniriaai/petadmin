# Argos Suite · Vasija de figuras negras

Logo 3 from the rebranding guide: a Tinta hound on a terracotta disc, with the ΛRGOS wordmark, SUITE and a meander band. The wordmark is Cinzel 700, converted to outlines, so the files need no fonts installed. Cinzel has no Λ glyph, so the Λ is Cinzel's V turned upside down.

Colors: Terracota #ea580c, Tinta #1c1917, Mármol #faf8f5.

| Folder | What | Use |
| --- | --- | --- |
| `svg/` | Lockup and mark (disc + hound), vector | Web, design tools, any size |
| `pdf/` | The same, vector | Print shops, signage, merchandise |
| `png/lockup/` | Lockup at 400, 800, 1600, 3200 px wide, transparent | Documents, slides, social posts |
| `png/mark/` | Mark at 64 to 1024 px, transparent | Avatars, stickers, embroidery mock-ups |
| `public/` (not this folder) | favicon.ico (16/32/48), favicon.svg, PNG favicons, apple-touch-icon (180), Android icons (192/512), maskable icons, Windows tile, web manifest | Browsers, phones, home-screen installs |

Variants: `color` for light backgrounds, `on-dark` for dark backgrounds (white wordmark), `mono-black` and `mono-white` for one-color printing, with the hound cut out of the disc.

Small sizes: below 64 px use the mark, never the lockup. At favicon sizes (16 to 48 px) the hound is enlarged and the eye dropped, so the shape still reads. The apple-touch and maskable icons sit on Mármol because those platforms don't allow transparency; the maskable disc stays inside the central 80% safe zone.

Clear space: at least the height of the Λ around the lockup. Don't redraw the hound, stretch the lockup or add shadows.

In the app:

- `src/components/brand/Logo.tsx`: `Lockup` (pick `tone` by background) and `Mark`. Only the SVGs it imports are bundled; the PDFs and PNGs here are for print and documents and never ship.
- The icon set lives at the root of `frontend/public/` because browsers and the web manifest ask for it at fixed paths. `index.html` links it.
- `build-logo.py <out-dir>` regenerates the whole kit; copy its `icons/` output into `public/`.

Cinzel is licensed under the SIL Open Font License (`Cinzel-OFL.txt`).
