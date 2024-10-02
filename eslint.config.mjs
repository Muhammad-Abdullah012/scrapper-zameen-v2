import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";


export default tseslint.config(
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.node }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {ignores: ["**/node_modules/**", '**/dist/**']}
);