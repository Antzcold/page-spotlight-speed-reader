import js from "@eslint/js";
import globals from "globals";

// Flat config for a build-free Manifest V3 Chrome extension.
// Prettier owns formatting, so this config deliberately adds NO style
// rules — only bug-pattern / correctness rules from @eslint/js.
// Each file runs in a different Chrome extension context with different
// globals, so languageOptions are scoped per file.
export default [
  js.configs.recommended,
  {
    files: ["content.js", "popup.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },
  {
    files: ["background.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.serviceworker,
        ...globals.webextensions,
      },
    },
  },
  {
    // Tooling/config files run in Node.
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ignores: ["node_modules/", "dist/"],
  },
];
