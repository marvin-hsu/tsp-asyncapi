import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

// Every value `decorators/index.ts` exports that reads decorator state.
//
// The lower half must not call these. It translates the model resolve
// produced, and it does not go to the program for anything. The `$`-prefixed
// decorator implementations are left out: nothing outside `tsp-index.ts`
// imports one, and the compiler is what calls them.
//
// This list used to be a comment. The three permitted reads were kept on
// their own import lines so a reader could count them, which SonarQube reads
// as the same module imported several times. Counting lines never proved
// anything anyway: it showed how many statements a file had, not which names
// crossed the boundary. The rule below checks the names.
//
// Add a name here when a state reader is added to `decorators/index.ts`.
const DECORATOR_STATE_READERS = [
  "getAsyncTags",
  "getChannel",
  "getContentType",
  "getCorrelationId",
  "getExtensions",
  "getExternalDocs",
  "getHeadersModel",
  "getInfo",
  "getJsonSchemaExtensions",
  "getMessageExamples",
  "getOperationAction",
  "getParameterLocation",
  "getRawHeaders",
  "getRawPayload",
  "getReplyAddress",
  "getReplyChannel",
  "getSecuritySchemes",
  "getServers",
  "getUsedSecuritySchemes",
  "getUsedServers",
  "isHeader",
  "isOneOf",
  "listChannels",
  "listMessages",
  "localRef",
];

/** Builds the `no-restricted-imports` entry for one set of forbidden names. */
function restrictStateReaders(names, message) {
  return {
    "no-restricted-imports": [
      "error",
      { paths: [{ name: "tsp-asyncapi-core", importNames: names, message }] },
    ],
  };
}

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
        // The project service, not `project: true`.
        //
        // With project references, `project: true` reads a referenced project
        // through its declaration output. So linting needed a build first, and
        // the static CI job deliberately runs without one: 981 errors, every
        // cross-package type reported as unresolved.
        //
        // The project service resolves a reference to the source it was built
        // from, so lint needs no build output. It is also the option
        // typescript-eslint recommends now; `project` is deprecated.
        projectService: true,
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
  // The Avro boundary, enforced.
  //
  // `tsp-avro` is a sibling of the upstream Protobuf emitter, not an AsyncAPI
  // thing. It reads TypeSpec and writes Avro schema files, and it shares no
  // model with the two AsyncAPI packages.
  //
  // The rule is here while the package is small, because the cheapest moment
  // to refuse a dependency is before anything reaches for it. A helper the two
  // sides both want is lifted to a place both can import, never imported
  // across.
  {
    files: ["packages/tsp-avro/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "tsp-asyncapi",
              message:
                "Avro emits on its own. This package is the sibling of the Protobuf emitter, and it shares no model with the AsyncAPI packages. Lift a helper both sides need, rather than importing across.",
            },
            {
              name: "tsp-asyncapi-core",
              message:
                "Avro emits on its own. This package is the sibling of the Protobuf emitter, and it shares no model with the AsyncAPI packages. Lift a helper both sides need, rather than importing across.",
            },
          ],
          patterns: [
            {
              group: ["**/tsp-asyncapi/**", "**/tsp-asyncapi-core/**"],
              message:
                "A relative path into an AsyncAPI package is the same dependency by another spelling. Avro emits on its own.",
            },
          ],
        },
      ],
    },
  },
  // An Avro schema is a string or an object, and the walk says so.
  //
  // The specification defines a schema as one of three things: a JSON string
  // naming a type, a JSON object defining one, or a JSON array for a union.
  // So a function that produces a schema produces a string or an object, and
  // the same is true of the one that renders it. That is the data model, not
  // a shortcut.
  //
  // The alternative is to wrap every primitive and every name reference in an
  // object of our own. That buys one rule and costs the property this package
  // is built on: the structure the walk produces is already Avro shaped, so
  // the renderer only orders keys.
  //
  // This grants the exception to the two files that hold that shape. Nothing
  // else in the package returns more than one type.
  {
    files: ["packages/tsp-avro/src/walk/model.ts", "packages/tsp-avro/src/render.ts"],
    rules: {
      "sonarjs/function-return-type": "off",
    },
  },
  // The stage discipline, enforced.
  //
  // resolve answers "what did the author declare?". lower answers "how does
  // AsyncAPI write that down?". So the lower half reads the resolved model
  // and nothing else. A state reader called here means a fact skipped the
  // model, and the model is what a second service or a second version would
  // be resolved into.
  //
  // The schemas block is the documented exception, and it is granted below.
  {
    files: ["packages/tsp-asyncapi/src/lower/**/*.ts"],
    rules: restrictStateReaders(
      DECORATOR_STATE_READERS,
      "The lower half reads the resolved model, not decorator state. Resolve the fact into an IR node and read the node here. See the schemas block for the one exception, and why it is one.",
    ),
  },
  // The schemas block, exempt.
  //
  // Every other section of the document is a few fixed fields. A schema is a
  // tree with no bound, and materializing it into the IR would build a second
  // type system beside the one TypeSpec already has.
  //
  // Expanding a schema is itself a lowering: `type`, `properties`, `allOf`,
  // and `$ref` are JSON Schema concepts, and TypeSpec has none of them. So
  // reading `@minLength(3)` to write `minLength: 3` is the translation step,
  // not a shortcut around resolve.
  //
  // `schemas.ts` is the entry of the block and `schemas/` is its inside, so
  // both are listed.
  {
    files: [
      "packages/tsp-asyncapi/src/lower/schemas.ts",
      "packages/tsp-asyncapi/src/lower/schemas/**/*.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  // One reader outside the schemas block.
  //
  // A raw schema is JSON the author wrote, and it can carry a `$ref` into the
  // document. `localRef` reads back what `@rawPayload` recorded, so this file
  // can tell a reference this emitter must resolve from one it must leave
  // alone. Nothing else here reads state.
  {
    files: ["packages/tsp-asyncapi/src/lower/raw-schema-refs.ts"],
    rules: restrictStateReaders(
      DECORATOR_STATE_READERS.filter((name) => name !== "localRef"),
      "The lower half reads the resolved model, not decorator state. This file may read `localRef`, and that one only, because a raw schema is author-written JSON whose `$ref` has to be told apart from one this emitter wrote.",
    ),
  },
  // The linter-rule tests assert through the compiler, not through `expect`.
  //
  // `createLinterRuleTester` returns `toBeValid()` and `toEmitDiagnostics()`.
  // Both throw when the rule behaves wrongly, so a case that calls one is
  // asserting. sonarjs recognises only `expect(...)`, so it reads every one
  // of those cases as assertion-free.
  //
  // Wrapping each call in `expect(...).resolves` would satisfy the rule and
  // say nothing more than the call already says. So the rule is off for the
  // files that use that tester, and stays on everywhere else —
  // `definition.test.ts` asserts on the linter definition with plain
  // `expect`, so it keeps the guard.
  {
    files: ["test/unit/linter/**/*.test.ts"],
    ignores: ["test/unit/linter/definition.test.ts"],
    rules: { "sonarjs/assertions-in-tests": "off" },
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
