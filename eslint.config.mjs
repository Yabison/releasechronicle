import { FlatCompat } from "@eslint/eslintrc";

/**
 * Next's rule sets (core-web-vitals + typescript) via the compat bridge —
 * eslint-config-next does not ship a flat config yet.
 */
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // .claude/worktrees/ holds full checkouts of other branches. Linting them
    // reports thousands of problems that belong to another commit and drown the
    // ones in this one. vitest.config.ts excludes the same path, for the same
    // reason. The CI never sees it — the directory is gitignored — so this is
    // purely about `npm run lint` staying usable on a machine with a worktree.
    ignores: [".next/**", "node_modules/**", "coverage/**", "next-env.d.ts", ".claude/**"],
  },
  {
    rules: {
      // French UI copy is full of apostrophes; escaping every one of them in
      // JSX hurts more than it protects.
      "react/no-unescaped-entities": "off",
      // The codebase deliberately types API payload shims loosely in a few
      // spots; `any` stays visible in review without failing the build.
      "@typescript-eslint/no-explicit-any": "warn",
      // A leading underscore is the conventional "intentionally unused" marker
      // (kept route-handler params, destructure-and-drop fields).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
