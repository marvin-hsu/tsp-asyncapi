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
  // The package boundary, enforced.
  //
  // The emitter splits along one line: `decorators/` and `resolve/` read what
  // the author declared, and `lower/` decides how AsyncAPI writes it down.
  // Only the second half knows about the output document.
  //
  // The line is a real one. Nothing under `decorators/` or `resolve/` imports
  // `lower/`, `emitter.ts`, or `pipeline.ts` today, and these rules are what
  // keep that true. Without them the direction holds by habit, and a single
  // import in the wrong direction is invisible in review.
  //
  // `types/document.ts` is on the output side, so the input side must not
  // reach it. The objects the author writes directly are in
  // `types/authored.ts` instead, and both halves may use those. Import from
  // `types/index.js` for either, and the barrel re-exports both files, so the
  // rule names the file rather than the barrel.
  //
  // The message on each rule states the reasoning, because the error is where
  // somebody meets this decision for the first time.
  {
    files: ["src/decorators/**/*.ts", "src/resolve/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lower/**", "**/emitter.js", "**/pipeline.js"],
              message:
                "The input language must not depend on the output document. `decorators/` and `resolve/` record what the author declared. Deciding how AsyncAPI writes it down is the job of `lower/`, and it reads the model this half produces.",
            },
            {
              group: ["**/types/document.js"],
              message:
                "`types/document.ts` holds the objects the lower stage writes. A decorator or the resolve stage may only use the objects the author writes directly, which are in `types/authored.ts`. Import from `types/index.js`.",
            },
          ],
        },
      ],
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
