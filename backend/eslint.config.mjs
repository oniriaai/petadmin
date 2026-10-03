// Backend lint rules.
//
// Deliberately NOT type-aware (no projectService / recommendedTypeChecked): the type-aware
// rules need a full program per run, which roughly doubles the step, and `npm run typecheck`
// already compiles both tsconfigs in CI. Lint here is for the things the compiler accepts.

import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "dist-seed/",
      "node_modules/",
      // Quarantined migrations: their timestamps sort before the baseline and they are kept
      // only for reference.
      "prisma/legacy-migrations/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // An unused argument is often a deliberate Express signature (`(req, res, next)`), so
      // only flag unused *values*, and let a leading underscore opt out.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // 63 sites, most of them narrowing a Prisma `where` object or an axios error in the e2e
      // helpers. Worth tightening file by file, not worth a red gate on day one.
      "@typescript-eslint/no-explicit-any": "warn",
      // `declare global { namespace Express }` is how `req.user` is typed; there is no ES module
      // equivalent for augmenting another package's interface.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
    },
  },
  {
    // This suite re-evaluates security.ts under different env vars, which means busting
    // require.cache and re-requiring it. A static import is evaluated once and cannot do that.
    files: ["tests/security-config.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
