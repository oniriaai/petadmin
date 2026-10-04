# Brand assets

Final artwork (Argos griego lockup, Sello griego icon) is pending from a designer; see `BRAND.md`.
Until it exists the app uses a type-only stand-in drawn in code:

- `src/components/brand/Wordmark.tsx`: ARGOS / SUITE in Cinzel.
- `src/components/brand/Meander.tsx`: the Greek-key band as an SVG pattern.
- `src/components/brand/BrandTile.tsx`: the "A" tile for small sizes.
- `favicon.svg`: source of `public/favicon.svg`.

When the artwork arrives, drop the SVG sources and PNG exports here and swap those components.
