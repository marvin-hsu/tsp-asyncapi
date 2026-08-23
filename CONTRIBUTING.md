# Contributing

中文版：[CONTRIBUTING.zh-TW.md](./CONTRIBUTING.zh-TW.md)

Thank you for looking at this project.

## Before you start

Open an issue first for anything larger than a typo. A short discussion
saves you from writing code that does not fit the direction of the
emitter.

For a bug, the most useful report holds the TypeSpec source that produces
the wrong output, the document the emitter wrote, and the document you
expected.

## Setting up

This project needs Node 20 or newer and pnpm.

```bash
pnpm install
pnpm build
pnpm test
```

`pnpm install` also installs the git hooks.

## The one command that matters

```bash
pnpm check
```

This is the gate. It runs nine steps in order: format check, lint, type
check, knip, build, API report check, tests with coverage, package check,
and a production dependency audit. CI runs the same command, so a green
`pnpm check` means CI has nothing new to tell you.

Judge it by the exit code. Do not read the output and decide for
yourself. `tsc` colours its output, and the escape characters sit between
the word `error` and the code, so a grep for `error TS` finds nothing
even when the build failed.

## While you work

`pnpm test:watch` reruns the tests that your change affects.

Decorators run from `dist/`, not from `src/`. `lib/main.tsp` imports
`../dist/src/tsp-index.js`, so the compiler loads the build output. Run
`pnpm build` before any test that exercises a decorator, or you will test
the previous version of your code.

## Tests

Every diagnostic needs a test that asserts its code. Every emitted field
needs a test.

A passing test is not the same as a protected rule. Before you trust a
test, break the rule it covers and confirm the test turns red. This
project has shipped tests that passed while the code they described had
been deleted.

Unit tests mirror the source layout. A test file over 850 lines is split
into a folder named after the concern.

## Comments and documentation

Code comments are English. They follow ASD-STE100: short sentences, one
idea each, active voice. Keep the explanation. This is a style rule and
not a reason to drop the substance.

Do not name a file path in a comment. Files move, and nothing warns you
that the comment now points at nothing.

User documentation is written twice, once in `docs/` and once in
`docs/zh-tw/`. Both pages go into the sidebar of their own locale in
`docs/.vitepress/config.mts`. Run `pnpm docs:build` and fix any dead
link it reports.

Never name a decorator, an emitter option, or a diagnostic code that does
not exist. Check `src/lib.ts` and `lib/main.tsp` first.

## Commits

Commit messages follow Conventional Commits. The `commit-msg` hook checks
this.

Write the body for the person who reads it in a year. Say what was wrong,
then what the change does, then how you know it works.

## Pull requests

Keep one pull request to one concern.

Before you open it:

- `pnpm check` exits 0.
- New behaviour has a test, and you have seen that test fail.
- Documentation is updated in both locales if you changed what a user
  sees.

The `pre-push` hook type-checks and runs the tests. It refuses a merge
commit, because this repository keeps a linear history. Rebase instead of
merging.

Never use `--no-verify`.

## Adding a decorator

Read the official `@typespec/openapi3` and `@typespec/json-schema`
emitters first. Both already solve problems this project has. Match their
decorator signature and their state shape where it makes sense.

Put the decorator in the folder under `src/decorators/` that matches the
part of the document it describes.

If the emitter cannot express something, report it. Emit a warning and
leave the field out, or refuse with an error. Never guess and never
rewrite the author's intent in silence. Every diagnostic says what to
write instead.

## Releasing

The two packages version independently, so a tag cannot say what to release.
`tsp-asyncapi-core` and `tsp-asyncapi` do not share a number.

Record what a change should release, as part of the change:

```bash
pnpm changeset
```

To cut a release, compute the versions and open a PR with the result:

```bash
pnpm changeset version
```

That updates each `package.json` and the dependency range between the two
packages. Write the changelog entries by hand, in both languages: the
changelogs are not generated, because they explain why a change was made.

Once that PR is merged, run the Release workflow from the Actions tab.
`workflow_dispatch` is the only trigger, so nothing publishes on a push. The
workflow runs `pnpm check` against the commit being published, then releases
whichever versions the registry does not have yet, and tags them.
