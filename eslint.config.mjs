import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "src-tauri/**"],
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
];
