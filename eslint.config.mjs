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
      // `.claude/` is untracked, and it holds nested git worktrees of this
      // same repository. Those files belong to another checkout and another
      // branch, and linting them here type-checks them against this
      // checkout's tsconfig.
      ".claude/**",
      // `.gemini` is a symlink to `.claude`, so it reaches the same worktrees
      // by a second path that `.claude/**` does not match.
      ".gemini/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "docs/**",
      "temp/**",
      "tsp-output/**",
      "eslint.config.mjs",
      "commitlint.config.mjs",
      "stryker.config.mjs",
      // `plan/` is git-ignored and holds reference copies of other people's
      // emitters. They are not this project's code, they have their own
      // tsconfig, and linting them produced most of the errors in a run.
      // Matched at any depth. A worktree links `plan` back to this working
      // tree, so the same files are reachable through the worktree path too.
      "**/plan/**",
    ],
  },
);
