import { describe, expect, it } from "vitest";
import { documentFrom, emitDocumentWithDiagnostics } from "../../../utils/test-host.js";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { AsyncAPITester } from "#emitter/testing.js";
import { BindingPlacements, reportUnattachedBindings } from "#core/resolve/bindings.js";
import { listAllBindings } from "#core/decorators/bindings/state.js";
import { operationsOf } from "../../../utils/document.js";
import type { Diagnostic } from "@typespec/compiler";
import { KAFKA_SERVICE } from "../../../utils/source.js";
import { bindingsOf } from "../../../utils/document.js";

const BINDING_OUTSIDE = "binding-outside-document";

/** Tells whether any diagnostic reports a binding that reached no object. */
function reportsUnattached(diagnostics: readonly Diagnostic[]): boolean {
  return diagnosticsWith(diagnostics, BINDING_OUTSIDE).length > 0;
}

describe("Unit: which bindings count as having reached the document", () => {
  it("leaves an operation declared in a base interface alone", async () => {
    // `interface C extends Base` copies each operation and reruns its
    // decorators, so the copy carries the binding into the document.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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
    expect(bindingsOf(operationsOf(doc).OrderChannel_publish.bindings).kafka).toEqual({
      groupId: { type: "string" },
      bindingVersion: "0.5.0",
    });
  });

  it("reports only the repeated id when a duplicate channel carries a binding", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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
    findDiagnostic(diagnostics, "duplicate-channel-id");
    expect(reportsUnattached(diagnostics)).toBe(false);
  });

  it("reports only the repeated id when a duplicate operation carries a binding", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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

    findDiagnostic(diagnostics, "duplicate-operation-id");
    expect(reportsUnattached(diagnostics)).toBe(false);
  });

  it("reports only the repeated key when a duplicate message carries a binding", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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

    findDiagnostic(diagnostics, "duplicate-message-key");
    expect(reportsUnattached(diagnostics)).toBe(false);
  });

  it("leaves the second instantiation of one template message alone", async () => {
    // Two instantiations sharing a message key emit one Message Object. The
    // other drops silently, but its decorator ran too, so its binding still
    // reaches the document through the surviving instantiation.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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
    // names every level, so a bare "channel" match would pass no matter
    // which level got interpolated.
    expect(reported.message).toContain("for the channel level");
  });

  it("reports every stray binding of one target, not just the first", async () => {
    // One target can carry two stray bindings, two separate mistakes. The
    // state stores a target's entries as a list, and the report flattens it
    // so the author hears about both.
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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

    const reported = diagnosticsWith(diagnostics, BINDING_OUTSIDE);
    expect(reported).toHaveLength(4);

    // Order is asserted, not just membership. State hands entries over in
    // decorator run order, not source order, so the builder sorts them by
    // source position. Joining the messages before asserting would hide that
    // sort: a plain reverse of the list would still pass.
    const protocols = reported.map((diagnostic) => /'(\w+)' binding/.exec(diagnostic.message)?.[1]);
    // Two targets with two bindings each make the sort observable. Decorators
    // on one declaration run bottom-up, so one target's entries arrive in
    // reverse source order. Reversing the whole list fixes that by accident
    // for one target, but puts the second target first.
    expect(protocols).toEqual(["kafka", "mqtt", "amqp", "ws"]);
  });

  it("marks only the level the builder dropped, and still reports the other one", async () => {
    // A namespace can carry a binding at two levels. The channel's binding
    // counts as placed because the channel drops as a repeated id, but the
    // server's binding reaches nothing, since the namespace declares no
    // server. Marking by target alone would silence that second one.
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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

    findDiagnostic(diagnostics, "duplicate-channel-id");
    const reported = diagnosticsWith(diagnostics, BINDING_OUTSIDE);
    expect(reported).toHaveLength(1);
    expect(reported[0].message).toContain("for the server level");
  });

  it("names all four objects when a level-less @binding reaches nothing", async () => {
    // `@binding` records no level, so it uses its own wording. The default
    // wording would interpolate "the any level" here, a position the author
    // cannot look for.
    const { diagnostics } = await emitDocumentWithDiagnostics(`
      ${KAFKA_SERVICE}

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
    // `reportUnattachedBindings` picks one of two wordings per stray binding:
    // `anyLevel` for a level-less `@binding`, `default` for a levelled one
    // like `@kafkaChannel`. The tests above each drive only one wording per
    // compile. Here the reporter runs alone, with no emit before it, so
    // nothing consumed a binding and both wordings appear in one list.
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

    const reported = diagnosticsWith(program.diagnostics, BINDING_OUTSIDE);
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
   * the entry in program state, so it outlives the build that set it.
   * One build per program hides this. Emitting one document per version or
   * per service resolves the same program more than once, so a mark left by
   * an earlier build would wrongly answer for the current one.
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

    // Stand in for an earlier build: place every entry, including the stray
    // one, in that build's own record, which the next build cannot reach.
    const earlierBuild = new BindingPlacements();
    for (const entry of listAllBindings(runner.program)) {
      earlierBuild.place(entry);
    }

    const before = runner.program.diagnostics.length;
    await documentFrom(runner.program);
    const reported = diagnosticsWith(runner.program.diagnostics.slice(before), BINDING_OUTSIDE);

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
      diagnosticsWith(runner.program.diagnostics.slice(from, to), BINDING_OUTSIDE).length;

    const start = runner.program.diagnostics.length;
    await documentFrom(runner.program);
    const afterFirst = runner.program.diagnostics.length;
    await documentFrom(runner.program);
    const afterSecond = runner.program.diagnostics.length;

    // Two builds of one program describe the same program, so they have to
    // agree about which bindings reached nothing.
    expect(straysBetween(start, afterFirst)).toBe(1);
    expect(straysBetween(afterFirst, afterSecond)).toBe(1);
  });
});
