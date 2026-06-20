import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // The two battle-tested hooks rules. We intentionally skip react-hooks v7's
      // experimental React Compiler rule set (refs/purity/set-state-in-effect/…),
      // which flags deliberate patterns in this codebase (ref-sync during render,
      // live-metrics render compute, the TanStack virtualizer).
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // `opts.onClose && opts.onClose(...)` is a deliberate call idiom in the clients.
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true },
      ],
    },
  },
  // Test files run under Node + Vitest, not the browser.
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      globals: globals.node,
    },
  },
);
