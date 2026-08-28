import { describe, expect, it } from "vitest";
import { expectNoErrors } from "../../utils/diagnostics.js";
import fc from "fast-check";
import { listServices, type Model, type Program } from "@typespec/compiler";
import { AsyncAPITester } from "#emitter/testing.js";
import { buildAsyncAPIDocument } from "#emitter/pipeline.js";
import type { ExternalSchemaArtifact } from "tsp-asyncapi-core";
import type { AsyncAPIDocument } from "#emitter/types/index.js";
import { namespaceOf } from "../../utils/namespace.js";
import { resolveRef } from "../../utils/json-pointer.js";
import { referencesIn } from "../../utils/references.js";

/**
 * A generated payload lands in `components.schemas` exactly when sharing it
 * saves something.
 *
 * A preview feature hands the resolver one artifact per model, and several
 * models of one Protobuf package get the same one. Those payloads then follow
 * the rule every raw schema follows: the second use earns a component, and a
 * single use stays where it is.
 *
 * The property covers the promotion path alone. The artifacts are written
 * here, not produced by another emitter, so nothing in this file depends on
 * how a version of `@typespec/protobuf` renders a package. What is generated
 * is which message gets which artifact, which is the only input promotion
 * reads.
 *
 * Three answers are asserted together, because one document holds all three.
 * A shared artifact is written once. A lone one is written in place. A
 * message with no artifact keeps the schema its model produces.
 */

/** The AsyncAPI schema format of proto3 text. */
const PROTOBUF = "application/vnd.google.protobuf;version=3";

/** The artifact pool. Small, so two messages sharing one is common. */
const ARTIFACTS: Record<string, ExternalSchemaArtifact> = {
  a: {
    schemaFormat: PROTOBUF,
    schema: 'syntax = "proto3";\npackage com.example.a;',
    provider: "protobuf",
    identity: "com.example.a",
  },
  b: {
    schemaFormat: PROTOBUF,
    schema: 'syntax = "proto3";\npackage com.example.b;',
    provider: "protobuf",
    identity: "com.example.b",
  },
};

/**
 * Which artifact one message is given.
 *
 * `none` is the message no provider claimed. It keeps the JSON Schema its
 * TypeSpec model produces, so every run holds both paths at once.
 */
type Assignment = "a" | "b" | "none";

const assignments = fc.array(fc.constantFrom<Assignment>("a", "b", "none"), {
  minLength: 1,
  maxLength: 4,
});

/** The name of the message at one position. */
function messageName(index: number): string {
  return `M${String(index)}`;
}

/** Builds one program: one message and one channel per assignment. */
function sourceOf(drawn: readonly Assignment[]): string {
  const declarations = drawn
    .map((_, index) => {
      const name = messageName(index);
      return `
      @message
      model ${name} {
        id: string;
      }

      @channel("orders.${String(index)}")
      interface Channel${String(index)} {
        @send
        op send${String(index)}(event: ${name}): void;
      }`;
    })
    .join("\n");
  return `
    @service(#{ title: "Orders" })
    namespace Test;
    ${declarations}
  `;
}

/** The models the source declared, in the order it declared them. */
function modelsOf(program: Program, count: number): Model[] {
  const namespace = namespaceOf(program, "Test");
  return Array.from({ length: count }, (_, index) => {
    const model = namespace.models.get(messageName(index));
    if (model === undefined)
      throw new Error(`The source declared no model '${messageName(index)}'.`);
    return model;
  });
}

/** The component key a promoted artifact takes, named after its first message. */
function keyOf(drawn: readonly Assignment[], id: Assignment): string {
  return `${messageName(drawn.indexOf(id))}Payload`;
}

/** How many messages each artifact was given. */
function usesOf(drawn: readonly Assignment[]): Map<Assignment, number> {
  const uses = new Map<Assignment, number>();
  for (const id of drawn) uses.set(id, (uses.get(id) ?? 0) + 1);
  return uses;
}

/**
 * Builds the document of one draw.
 *
 * @param drawn - Which artifact each message is given
 * @returns The document the pipeline produced
 */
async function documentOf(drawn: readonly Assignment[]): Promise<AsyncAPIDocument> {
  const runner = await AsyncAPITester.createInstance();
  const [, diagnostics] = await runner.compileAndDiagnose(sourceOf(drawn));
  // An error here means the generator built illegal TypeSpec. Fail loudly
  // rather than skipping, so the property cannot starve.
  expectNoErrors(diagnostics);

  const program = runner.program;
  const payloadFor = new Map<Model, ExternalSchemaArtifact>();
  modelsOf(program, drawn.length).forEach((model, index) => {
    const id = drawn[index];
    if (id !== "none") payloadFor.set(model, ARTIFACTS[id]);
  });

  return buildAsyncAPIDocument(
    program,
    listServices(program)[0],
    {},
    {
      payloadFor,
    },
  );
}

describe("Property: a generated payload is shared only when it repeats", () => {
  it("writes one component per repeated artifact and keeps a lone one in place", async () => {
    let withShared = 0;
    let withLone = 0;
    let withModel = 0;
    let withBoth = 0;

    await fc.assert(
      fc.asyncProperty(assignments, async (drawn) => {
        const doc = await documentOf(drawn);
        const uses = usesOf(drawn);

        const shared = [...uses.entries()].filter(([id, count]) => id !== "none" && count > 1);
        const lone = [...uses.entries()].filter(([id, count]) => id !== "none" && count === 1);
        if (shared.length > 0) withShared++;
        if (lone.length > 0) withLone++;
        if ((uses.get("none") ?? 0) > 0) withModel++;
        if (shared.length > 0 && lone.length > 0) withBoth++;

        drawn.forEach((id, index) => {
          const payload = doc.components?.messages?.[messageName(index)].payload;
          if (id === "none") {
            // No artifact reached this model, so it keeps the schema its
            // TypeSpec type produces.
            expect(payload).toEqual({ $ref: `#/components/schemas/${messageName(index)}` });
            return;
          }
          const artifact = ARTIFACTS[id];
          if ((uses.get(id) ?? 0) > 1) {
            expect(payload).toEqual({ $ref: `#/components/schemas/${keyOf(drawn, id)}` });
            return;
          }
          // One use has nothing to share with, so a reference would add a hop
          // and save nothing.
          expect(payload).toEqual({ schemaFormat: artifact.schemaFormat, schema: artifact.schema });
        });

        // Exactly the repeated artifacts earn a component, and each earns one.
        const expected = [
          ...shared.map(([id]) => keyOf(drawn, id)),
          ...drawn.flatMap((id, index) => (id === "none" ? [messageName(index)] : [])),
        ];
        const byName = (names: readonly string[]) => [...names].sort((a, b) => a.localeCompare(b));
        expect(byName(Object.keys(doc.components?.schemas ?? {}))).toEqual(byName(expected));

        // A component that is referenced and not written says nothing where
        // it claims to say something.
        const unresolved = referencesIn(doc).filter(
          (pointer) => resolveRef(doc, pointer) === undefined,
        );
        expect(unresolved).toEqual([]);
      }),
      { numRuns: 40, seed: 20260824 },
    );

    // Each branch of the rule has to be reached, or the property passes by
    // never meeting the case it is about.
    expect(withShared).toBeGreaterThan(0);
    expect(withLone).toBeGreaterThan(0);
    expect(withModel).toBeGreaterThan(0);
    expect(withBoth).toBeGreaterThan(0);
  });
});
