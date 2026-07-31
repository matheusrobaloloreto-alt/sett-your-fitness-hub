import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // The legacy app has many intentionally dynamic Supabase/JSON boundaries.
      // Keep the rule strict in deterministic/core modules below instead of
      // reporting nearly a thousand unactionable errors across generated data flows.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: [
      "src/lib/prescription/**/*.{ts,tsx}",
      "src/lib/aiContracts.ts",
      "src/lib/studentStatus.ts",
      "src/lib/studentStatus.test.ts",
      "src/lib/salesFunnel.test.ts",
    ],
    ignores: ["src/lib/prescription/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
