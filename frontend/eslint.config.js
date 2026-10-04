// Frontend lint rules. Same non-type-aware stance as the backend config, plus the two
// react-hooks rules — the only lint rules here that catch bugs a reviewer reliably misses.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs["recommended-latest"],
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // 43 sites, mostly API response shapes that predate the shared types in lib/api.ts.
      "@typescript-eslint/no-explicit-any": "warn",
      // Three real hits. Each one needs its effect reasoned about individually — adding the
      // missing dep can turn a mount-once effect into a loop — so they are flagged, not gated.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
