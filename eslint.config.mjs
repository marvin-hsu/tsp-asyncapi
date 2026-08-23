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
  // `tsp-asyncapi-core` declares the input language and emits nothing. The
  // emitter package reads the model core produces and writes the document. The
  // dependency runs one way, and only one way.
  //
  // Two rules keep it that way. Core may not name the emitter package at all.
  // And nothing in core may reach a relative path into the emitter's half,
  // which is what a file would do if these two directories were ever merged
  // back together.
  //
  // This caught a real edge during the split: `naming.ts` imported
  // `componentsSchemaRef` from `lower/json-pointer.ts` to build a `$ref`. A
  // `$ref` is a detail of the document, so `refFor` moved to the emitter.
  {
    files: ["packages/tsp-asyncapi-core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "tsp-asyncapi",
              message:
                "The input language must not depend on the emitter. This package declares what an author can write, and it emits nothing. An emitter reads the model this package produces, never the other way round.",
            },
          ],
          patterns: [
            {
              group: ["**/lower/**", "**/emitter.js", "**/pipeline.js"],
              message:
                "`lower/`, `emitter.ts`, and `pipeline.ts` belong to an emitter package. Deciding how AsyncAPI writes something down is their job. If this package needs the value, the value is not about the output document.",
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
      // Matched at any depth. Each package has its own `dist/` and `temp/`,
      // and a root-anchored pattern would leave those unignored. Linting build
      // output produces nothing but noise, and it is silent when it starts.
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/temp/**",
      "**/tsp-output/**",
      "docs/**",
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
