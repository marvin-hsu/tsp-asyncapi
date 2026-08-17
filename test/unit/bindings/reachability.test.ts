/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { BindingPlacements, reportUnattachedBindings } from "../../../src/resolve/bindings.js";
import { buildAsyncAPIDocument } from "../../../src/pipeline.js";
import { listAllBindings } from "../../../src/decorators/bindings/state.js";

const KAFKA_CONTRACT = `
  @service(#{ title: "Orders" })
  @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
  namespace Test;
`;

const BINDING_OUTSIDE = "tsp-asyncapi/binding-outside-document";

/** Tells whether any diagnostic reports a binding that reached no object. */
function reportsUnattached(diagnostics: readonly { code: string }[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === BINDING_OUTSIDE);
}

describe("Unit: which bindings count as having reached the document", () => {
  it("leaves an operation declared in a base interface alone", async () => {
    // `interface C extends Base` copies each operation of `Base` and runs its
    // decorators again. The declaration in `Base` sits on no channel, and it
    // reaches the document through the copy. Its binding did too.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @message
      model OrderCreated {
        id: string;
      }

      interface Base {
        @kafkaOperation(#{ groupId: #{ type: "string" } })
        @send
        op publish(event: OrderCreated): void;
      }

      @channel("orders.created")
      interface OrderChannel extends Base {}
    `);

    expect(reportsUnattached(diagnostics)).toBe(false);
    expect(doc.operations.OrderChannel_publish.bindings.kafka).toEqual({
      groupId: { type: "string" },
      bindingVersion: "0.5.0",
    });
  });

  it("reports only the repeated id when a duplicate channel carries a binding", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.first", "orders")
      interface First {
        @send
        op publish(event: OrderCreated): void;
      }

      @kafkaChannel(#{ topic: "orders.second" })
      @channel("orders.second", "orders")
      interface Second {
        @send
        op emit(event: OrderCreated): void;
      }
    `);

    // The repeated id is the mistake, and it names itself exactly. A second
    // report about the binding would ask for a @channel the target carries.
    findDiagnostic(diagnostics, "tsp-asyncapi/duplicate-channel-id");
    expect(reportsUnattached(diagnostics)).toBe(false);
  });

  it("reports only the repeated id when a duplicate operation carries a binding", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send("publish")
        op publish(event: OrderCreated): void;

        @kafkaOperation(#{ clientId: #{ type: "string" } })
        @send("publish")
        op other(event: OrderCreated): void;
      }
    `);

    findDiagnostic(diagnostics, "tsp-asyncapi/duplicate-operation-id");
    expect(reportsUnattached(diagnostics)).toBe(false);
  });

  it("reports only the repeated key when a duplicate message carries a binding", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @friendlyName("Shared")
      @message
      model A {
        a: string;
      }

      @kafkaMessage(#{ schemaIdLocation: "header" })
      @friendlyName("Shared")
      @message
      model B {
        b: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: A): void;
      }
    `);

    findDiagnostic(diagnostics, "tsp-asyncapi/duplicate-message-key");
    expect(reportsUnattached(diagnostics)).toBe(false);
  });

  it("leaves the second instantiation of one template message alone", async () => {
    // Two instantiations of one template can share a message key. They emit
    // one Message Object between them, so the second one is dropped without a
    // report. The decorator ran on each instantiation, so each carries its
    // own recorded binding, and the dropped one reached the document through
    // the surviving instantiation.
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @kafkaMessage(#{ schemaIdLocation: "header" })
      @message
      model Envelope<T> {
        body: T;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: Envelope<{ id: string }>): void;

        @send
        op emit(event: Envelope<{ id: string }>): void;
      }
    `);

    expect(reportsUnattached(diagnostics)).toBe(false);
    expect(doc).not.toBeNull();
  });

  it("still reports a binding on a target that reaches nothing at all", async () => {
    // The three cases above must not silence the check itself.
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @message
      model OrderCreated {
        id: string;
      }

      @kafkaChannel(#{ topic: "orphan" })
      interface NotAChannel {
        op publish(event: OrderCreated): void;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op emit(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, BINDING_OUTSIDE);
    // The whole clause is asserted, not the bare word. The remedy sentence
    // of this diagnostic already lists every level by name, so a test that
    // looks for "channel" alone passes whichever level is interpolated.
    expect(reported.message).toContain("for the channel level");
  });

  it("reports every stray binding of one target, not just the first", async () => {
    // One target can carry two bindings that both reach nothing. They are two
    // mistakes, so the author hears about both. The state layer stores the
    // entries of one target as a list, and the report flattens those lists.
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @message
      model OrderCreated {
        id: string;
      }

      @kafkaChannel(#{ topic: "orphan" })
      @binding("mqtt", #{ qos: 1 })
      interface NotAChannel {
        op publish(event: OrderCreated): void;
      }

      @binding("amqp", #{ exchange: "orders" })
      @binding("ws", #{ method: "GET" })
      interface AlsoNotAChannel {
        op publish(event: OrderCreated): void;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op emit(event: OrderCreated): void;
      }
    `);

    const reported = diagnostics.filter((diagnostic) => diagnostic.code === BINDING_OUTSIDE);
    expect(reported).toHaveLength(4);

    // The order is asserted, not just the membership. The state layer hands
    // these over in the order the decorators ran, which is not the order the
    // author reads, so the builder sorts them by source position. Joining the
    // two messages before asserting cannot see that sort at all: reversing it
    // left the whole suite green.
    const protocols = reported.map((diagnostic) => /'(\w+)' binding/.exec(diagnostic.message)?.[1]);
    // Two targets, two bindings each. That shape is what makes the sort
    // observable. Decorators on one declaration run bottom-up, so the entries
    // of a single target arrive in the reverse of source order, and a plain
    // reverse of the whole list would fix them by accident. Across two
    // targets it cannot: reversing gives the second target first.
    expect(protocols).toEqual(["kafka", "mqtt", "amqp", "ws"]);
  });

  it("marks only the level the builder dropped, and still reports the other one", async () => {
    // A namespace can carry a binding at two levels. Here the channel is
    // dropped as a repeated id, so its binding counts as placed and is not
    // reported. The server binding of the same namespace reaches nothing at
    // all, because the namespace declares no server. Marking by target alone
    // would silence it.
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.first", "orders")
      interface First {
        @send
        op publish(event: OrderCreated): void;
      }

      @kafkaServer(#{ schemaRegistryUrl: "https://registry.example.com" })
      @kafkaChannel(#{ topic: "orders.second" })
      @channel("orders.second", "orders")
      namespace Second {
        @send
        op emit(event: OrderCreated): void;
      }
    `);

    findDiagnostic(diagnostics, "tsp-asyncapi/duplicate-channel-id");
    const reported = diagnostics.filter((diagnostic) => diagnostic.code === BINDING_OUTSIDE);
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toContain("for the server level");
  });

  it("names all four objects when a level-less @binding reaches nothing", async () => {
    // `@binding` records no level, so it reports a wording of its own. The
    // default wording interpolates the level, which would read "the any
    // level" here and name a position the author cannot look for.
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${KAFKA_CONTRACT}

      @message
      model OrderCreated {
        id: string;
      }

      @binding("mqtt", #{ qos: 1 })
      interface NotAChannel {
        op publish(event: OrderCreated): void;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op emit(event: OrderCreated): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, BINDING_OUTSIDE);
    expect(reported.message).toContain("no server, no channel, no operation and no message");
    expect(reported.message).not.toContain("any level");
  });

  it("picks the wording per binding when a level-less and a levelled binding are both stray", async () => {
    // `reportUnattachedBindings` chooses between two wordings for each
    // stray binding. The level-less `@binding` gets `anyLevel`, and a
    // levelled one such as `@kafkaChannel` gets `default`. The tests above
    // each drive one wording per compile, so neither shows the choice
    // being made both ways over one list.
    // The reporter runs on its own here, with no emit before it. Nothing
    // consumed a binding, so both applications are stray at once.
    const runner = await AsyncAPITester.createInstance();
    const { program } = await runner.compile(`
      @binding("mqtt", #{ qos: 1 })
      model NoObject {
        id: string;
      }

      @kafkaChannel(#{ topic: "orders" })
      interface NotAChannel {
        op publish(): void;
      }
    `);

    // Nothing was built, so this build placed nothing.
    reportUnattachedBindings(program, new BindingPlacements());

    const reported = program.diagnostics.filter(
      (diagnostic) => diagnostic.code === BINDING_OUTSIDE,
    );
    expect(reported).toHaveLength(2);
    const messages = reported.map((diagnostic) => diagnostic.message);
    expect(messages.some((message) => message.includes("for the channel level"))).toBe(true);
    expect(
      messages.some((message) =>
        message.includes("no server, no channel, no operation and no message"),
      ),
    ).toBe(true);
  });
});

describe("Unit: Bindings — consumption marks do not leak between builds", () => {
  /**
   * A binding records whether it reached an emitted object. That mark lives on
   * the entry, and the entry lives in program state, so it outlives the build
   * that set it.
   *
   * One build per program hides the problem. Emitting one document per
   * version, or one per service, resolves the same program more than once, and
   * a mark left by an earlier build would then answer for the current one.
   */
  it("still reports a stray binding when an earlier build left a mark on it", async () => {
    const runner = await AsyncAPITester.createInstance();
    await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message model Order { id: string; }
      @channel("orders") interface Ordering {
        @send op publish(m: Order): void;
      }

      // This binding names a model no channel, message, or operation emits,
      // so every build must report it.
      @binding("kafka", #{ topic: "nowhere" })
      model Orphan { id: string; }
    `);

    // Stand in for a previous build over the same program: place every entry,
    // including the stray one, in a record of that build's own. A record the
    // build owns cannot reach the next build, so the stray is still reported.
    const earlierBuild = new BindingPlacements();
    for (const entry of listAllBindings(runner.program)) {
      earlierBuild.place(entry);
    }

    const before = runner.program.diagnostics.length;
    buildAsyncAPIDocument(runner.program, undefined, {});
    const reported = runner.program.diagnostics
      .slice(before)
      .filter((diagnostic) => diagnostic.code === BINDING_OUTSIDE);

    expect(reported).toHaveLength(1);
  });

  it("reports the same strays on a second build of the same program", async () => {
    const runner = await AsyncAPITester.createInstance();
    await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message model Order { id: string; }
      @channel("orders") interface Ordering {
        @send op publish(m: Order): void;
      }

      @binding("kafka", #{ topic: "nowhere" })
      model Orphan { id: string; }
    `);

    // Count within one build's own slice. Counting to the end of the list
    // instead would fold the second build's reports into the first's.
    const straysBetween = (from: number, to: number): number =>
      runner.program.diagnostics.slice(from, to).filter((d) => d.code === BINDING_OUTSIDE).length;

    const start = runner.program.diagnostics.length;
    buildAsyncAPIDocument(runner.program, undefined, {});
    const afterFirst = runner.program.diagnostics.length;
    buildAsyncAPIDocument(runner.program, undefined, {});
    const afterSecond = runner.program.diagnostics.length;

    // Two builds of one program describe the same program, so they have to
    // agree about which bindings reached nothing.
    expect(straysBetween(start, afterFirst)).toBe(1);
    expect(straysBetween(afterFirst, afterSecond)).toBe(1);
  });
});
