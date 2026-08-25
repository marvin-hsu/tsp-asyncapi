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
 *
 * The work is split in two, because a counter over random draws is only as
 * reliable as the draw. A diamond appears in about one generated graph in
 * twenty, so a run of forty would sometimes hold none, and a counter
 * asserting otherwise would fail on nobody's mistake. The shapes that break a
 * closure walk are therefore written down and checked every time. The
 * generator explores what nobody wrote down.
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

/**
 * The shapes a closure walk gets wrong, written down.
 *
 * Each is a graph in the same form the generator draws, so both tests run
 * one assertion. `island` is here because a model nothing reaches must stay
 * out of the payload, which is the half a walk that collects everything
 * would pass anyway.
 */
const SHAPES: Record<string, Graph> = {
  // M0 reaches M3 by two paths. A walk that forgets what it has seen writes
  // M3 twice, and one that stops at the first meeting writes it never.
  diamond: [[1, 2], [3], [3], ["scalar"]],
  // A node three hops in. A walk one level deep leaves it out.
  chain: [[1], [2], [3], ["scalar"]],
  // A message that reaches itself. A walk with no guard never returns.
  selfLoop: [[0, "scalar"], []],
  // Two that reach each other, entered from outside the cycle.
  mutual: [[1], [2], [1]],
  // Nothing to trim, and nothing reaches M1.
  island: [["scalar"], ["scalar"]],
};

/**
 * Asserts the payload of every model of one graph.
 *
 * @param graph - The graph to compile and render
 */
async function expectClosure(graph: Graph): Promise<void> {
  const program = await compileWithProtobuf(sourceOf(graph));
  for (const root of graph.keys()) {
    const text = renderNamed(program, modelName(root));

    // The closure, both directions at once. A missing declaration leaves a
    // field naming a type the text never declares. An extra one describes a
    // payload the message cannot carry.
    expect(declarationsIn(text)).toStrictEqual(reachableFrom(graph, root));

    // A text that holds the right names can still be unreadable. The
    // reference parser is the judge of that.
    expect(() => descriptorOf(text)).not.toThrow();

    // Two renders of one program agree. The walk keeps no state that
    // outlives it, and the emitted corpus depends on that.
    expect(renderNamed(program, modelName(root))).toBe(text);
  }
}

describe("Property: a Protobuf payload holds the closure of its message", () => {
  // The shapes are named, so a failure says which one broke rather than
  // printing a graph the reader has to decode.
  it.each(Object.keys(SHAPES))("holds for the %s shape", async (name) => {
    await expectClosure(SHAPES[name]);
  });

  it("declares every model the root reaches, and no other", async () => {
    let roots = 0;
    let withExcludedModel = 0;

    await fc.assert(
      fc.asyncProperty(graphs, async (graph) => {
        await expectClosure(graph);
        for (const root of graph.keys()) {
          roots++;
          if (reachableFrom(graph, root).size < graph.length) withExcludedModel++;
        }
      }),
      { numRuns: 40 },
    );

    // Trimming happens in about nine draws in ten, so this counter is stable.
    // Without it the property could hold by never trimming anything. The
    // rarer shapes are covered by the cases above rather than by a counter
    // that would fail on an unlucky seed.
    expect(roots).toBeGreaterThan(0);
    expect(withExcludedModel).toBeGreaterThan(0);
  });
});
