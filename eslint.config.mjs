import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  // The SonarJS rules SonarQube itself runs for JavaScript and TypeScript.
  // They run here, in this process, against the working tree. Nothing is
  // uploaded, and no analysis reaches SonarCloud, so a check costs nothing
  // and touches no shared state.
  sonarjs.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "docs/**",
      "temp/**",
      "tsp-output/**",
      "eslint.config.mjs",
      "commitlint.config.mjs",
      "stryker.config.mjs",
    ],
  },
);
