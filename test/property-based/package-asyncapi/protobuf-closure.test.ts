import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compileWithProtobuf, descriptorOf, renderNamed } from "../../utils/protobuf-parity.js";

/**
 * A payload carries the closure of its message, and nothing else.
 *
 * The walk that builds a payload decides which declarations belong in it. A
 * field of a message type pulls that message in, and whatever it reaches
 * comes too. Everything else stays out, so the text describes one payload
 * rather than a whole package.
 *
 * The example cases pin three shapes: one reference, a message that reaches
 * itself, and two that reach each other. Those are the shapes a person thinks
 * of. The ones that break a closure are the shapes nobody enumerates: a
 * diamond where two paths meet at one message, a node reachable only through
 * three hops, a cycle entered from outside it. A generator finds those.
 *
 * The oracle is reachability computed here, over the graph the generator drew
 * rather than over anything the emitter produced. So the property compares
 * two independent answers to one question.
 */

/** How many models one generated program declares. */
const MODEL_COUNT = { min: 2, max: 5 };

/** How many fields one generated model declares. */
const FIELD_COUNT = { min: 0, max: 3 };

/**
 * One field of a generated model.
 *
 * A number is the index of the model this field points at, itself included.
 * `"scalar"` is a field that reaches nothing.
 */
type Field = number | "scalar";

/** The graph one run draws: one entry per model, holding its fields. */
type Graph = readonly (readonly Field[])[];

/**
 * Draws a graph of models that reference each other.
 *
 * A reference may name any model of the graph, including the one it sits in.
 * So a run can produce a chain, a diamond, a self-loop, a cycle, or an
 * island, and the counters below record which of those actually appeared.
 */
const graphs: fc.Arbitrary<Graph> = fc
  .integer({ min: MODEL_COUNT.min, max: MODEL_COUNT.max })
  .chain((count) =>
    fc.array(
      fc.array(fc.oneof(fc.constant<Field>("scalar"), fc.integer({ min: 0, max: count - 1 })), {
        minLength: FIELD_COUNT.min,
        maxLength: FIELD_COUNT.max,
      }),
      { minLength: count, maxLength: count },
    ),
  );

/** The name the source gives the model at one index. */
function modelName(index: number): string {
  return `M${String(index)}`;
}

/** Writes the TypeSpec source of one graph. Every model is a message. */
function sourceOf(graph: Graph): string {
  const models = graph.map((fields, index) => {
    const properties = fields.map((field, position) => {
      const type = field === "scalar" ? "string" : modelName(field);
      // Field numbers start at one and are unique within a message, which is
      // all proto3 asks of them.
      return `  @Protobuf.field(${String(position + 1)}) f${String(position)}: ${type};`;
    });
    return [`@Protobuf.message`, `model ${modelName(index)} {`, ...properties, `}`].join("\n");
  });

  return [
    '@Protobuf.package({ name: "com.example.closure" })',
    "namespace Closure;",
    "",
    ...models,
  ].join("\n");
}

/**
 * The models one model reaches, itself included.
 *
 * This is the answer the payload has to match. It is computed from the graph
 * the generator drew, so nothing the emitter decides can influence it.
 *
 * @param graph - The graph of the run
 * @param root - The index the walk starts from
 * @returns The names of every model reachable from the root
 */
function reachableFrom(graph: Graph, root: number): Set<string> {
  const seen = new Set<number>();
  const queue = [root];
  while (queue.length > 0) {
    const index = queue.pop();
    if (index === undefined || seen.has(index)) continue;
    seen.add(index);
    for (const field of graph[index]) {
      if (field !== "scalar" && !seen.has(field)) queue.push(field);
    }
  }
  return new Set([...seen].map(modelName));
}

/**
 * Every message a rendered payload declares, by name.
 *
 * A message with no field is written on one line, so the anchor accepts the
 * closing brace as well as the opening one.
 */
function declarationsIn(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    const head = /^message (\w+) \{\}?$/.exec(line);
    if (head !== null) names.add(head[1]);
  }
  return names;
}

/** Whether a graph holds a cycle reachable from one root. */
function hasCycleFrom(graph: Graph, root: number): boolean {
  const open = new Set<number>();
  const done = new Set<number>();
  const walk = (index: number): boolean => {
    if (open.has(index)) return true;
    if (done.has(index)) return false;
    open.add(index);
    for (const field of graph[index]) {
      if (field !== "scalar" && walk(field)) return true;
    }
    open.delete(index);
    done.add(index);
    return false;
  };
  return walk(root);
}

/** Whether two distinct references reach one model, which makes a diamond. */
function hasSharedNode(graph: Graph, root: number): boolean {
  const reachable = reachableFrom(graph, root);
  const referrers = new Map<number, Set<number>>();
  for (const [index, fields] of graph.entries()) {
    if (!reachable.has(modelName(index))) continue;
    for (const field of fields) {
      if (field === "scalar" || field === index) continue;
      const owners = referrers.get(field) ?? new Set<number>();
      owners.add(index);
      referrers.set(field, owners);
    }
  }
  return [...referrers.values()].some((owners) => owners.size > 1);
}

describe("Property: a Protobuf payload holds the closure of its message", () => {
  it("declares every model the root reaches, and no other", async () => {
    // The counters prove the generator drew the shapes this property exists
    // for. Without them a run of chains alone would pass and say nothing.
    let withCycle = 0;
    let withSharedNode = 0;
    let withExcludedModel = 0;
    let deterministic = 0;

    await fc.assert(
      fc.asyncProperty(graphs, async (graph) => {
        const program = await compileWithProtobuf(sourceOf(graph));

        for (const root of graph.keys()) {
          const text = renderNamed(program, modelName(root));
          const expected = reachableFrom(graph, root);

          // The closure, both directions at once. A missing declaration
          // leaves a field naming a type the text never declares. An extra
          // one describes a payload the message cannot carry.
          expect(declarationsIn(text)).toStrictEqual(expected);

          // A text that holds the right names can still be unreadable. The
          // reference parser is the judge of that.
          expect(() => descriptorOf(text)).not.toThrow();

          // Two renders of one program agree. The walk keeps no state that
          // outlives it, and the emitted corpus depends on that.
          if (renderNamed(program, modelName(root)) === text) deterministic++;

          if (hasCycleFrom(graph, root)) withCycle++;
          if (hasSharedNode(graph, root)) withSharedNode++;
          if (expected.size < graph.length) withExcludedModel++;
        }
      }),
      { numRuns: 40 },
    );

    expect(withCycle).toBeGreaterThan(0);
    expect(withSharedNode).toBeGreaterThan(0);
    // Without this the property could hold by never trimming anything.
    expect(withExcludedModel).toBeGreaterThan(0);
    expect(deterministic).toBeGreaterThan(0);
  });
});
