/**
 * Conventional Commits, with the scopes this repository actually uses.
 *
 * The scope list stays open on purpose. A new phase brings new areas, and a
 * rejected commit is a bad way to learn that a scope is not on a list.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // `merge` is not a Conventional Commits type. The pre-push hook rejects
    // merge commits, so the type has no reason to come back.
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "revert",
        "style",
        "test",
      ],
    ],
  },
};
