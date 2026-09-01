import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/no-unsafe-type-assertion": "off",
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["**/*.mjs"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        console: "readonly",
        process: "readonly",
        structuredClone: "readonly",
        URL: "readonly",
      },
    },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: ["apps/admin/public/**/*.js"],
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        document: "readonly",
        fetch: "readonly",
        window: "readonly",
      },
    },
  },
);
