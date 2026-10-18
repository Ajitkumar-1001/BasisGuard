import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "parallel-web", message: "Only the worker (packages/providers/src/live) may call Parallel." },
          { name: "@basisguard/providers", message: "The web app never calls upstream providers." },
          { name: "openai", message: "The web app never calls upstream providers." },
        ],
        patterns: [
          { group: ["parallel-web/*"], message: "Only the worker (packages/providers/src/live) may call Parallel." },
          { group: ["@basisguard/providers/*"], message: "The web app never calls upstream providers." },
          { group: ["openai/*"], message: "The web app never calls upstream providers." },
        ],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
