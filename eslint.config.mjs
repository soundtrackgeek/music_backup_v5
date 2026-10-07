import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "src-tauri/**", "src/bindings.ts"],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      "max-lines": [
        "warn",
        { max: 1500, skipBlankLines: true, skipComments: true },
      ],
    },
  },
  {
    // Every backend entry point declares its return type, so the web-preview branch
    // of each function is checked against the generated Rust contract.
    files: ["src/backend.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
];
