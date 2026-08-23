import { describe, it } from "vitest";
import { operationWithoutMessageRule } from "#core/linter/operation-without-message.rule.js";
import { createRuleTester } from "../../utils/linter.js";

const SERVICE = `
  @service(#{ title: "Orders" })
  namespace Test;

  @message
  model OrderCreated {
    id: string;
  }
`;

/**
 * Unit tests of `tsp-asyncapi/operation-without-message`.
 *
 * An operation with no `messages` field is read by AsyncAPI as carrying
 * every message of its channel. The rule catches the operation that ends up
 * saying that by accident.
 */
describe("Unit: the operation-without-message rule", () => {
  it("stays quiet when the operation names a message", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(event: OrderCreated): void;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * The mistake. `publish` carries only a channel parameter, so its
   * `messages` field is left out, and the operation claims `OrderCreated`
   * even though it never names it.
   */
  it("reports an operation whose channel has a message it does not name", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.{id}")
        interface OrderChannel {
          @receive
          op consume(): OrderCreated;

          @send
          op publish(id: string): void;
        }
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/operation-without-message" });
  });

  /**
   * Without an action there is no operation object, so there is no
   * `messages` field to be wrong. Such an operation still carries its models
   * to the channel, which is what `channel-without-operation` is about.
   */
  it("stays quiet on an operation with no action", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(event: OrderCreated): void;

          op helper(id: string): void;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * A channel with no messages at all belongs to `channel-no-messages`.
   * "Every message of the channel" is not a wrong claim when the channel
   * carries none.
   */
  it("stays quiet when the channel carries no messages", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(id: string): void;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * An operation with an action but no channel is already reported by
   * `operation-without-channel`. Firing here as well would put two warnings
   * on one operation.
   */
  it("stays quiet on an operation that belongs to no channel", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @send
        op stray(id: string): void;
      `,
      )
      .toBeValid();
  });

  /**
   * A `@send` operation sends what its parameters name. Its return type is
   * the reply, which reaches `reply.messages`, a different field. So an
   * operation whose only message is on the reply side still emits no
   * `messages`, and still claims the whole channel.
   */
  it("reports when only the reply side names a message", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @send
          op request(id: string): OrderCreated;
        }
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/operation-without-message" });
  });

  /**
   * A `@receive` operation names what it receives in its **return type**.
   * Writing the message as a parameter puts it on the reply side, so the
   * operation emits no `messages`. This form reads as correct and is not.
   */
  it("reports an inverted @receive", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @receive
          op consume(event: OrderCreated): void;
        }
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/operation-without-message" });
  });

  /** The correct `@receive` form stays quiet. */
  it("stays quiet on a @receive that returns its message", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @receive
          op consume(): OrderCreated;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * `unwrap` walks a union, so a message named through one counts. Reading
   * only a direct model reference would report this.
   */
  it("stays quiet when the message is named through a union", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @message
        model Created {
          id: string;
        }

        @message
        model Shipped {
          id: string;
        }

        union Either {
          Created,
          Shipped,
        }

        @channel("orders")
        interface OrderChannel {
          @send
          op publish(event: Either): void;
        }
      `,
      )
      .toBeValid();
  });

  /** The same walk unwraps a collection to its element type. */
  it("stays quiet when the message is named through an array", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        ${SERVICE}

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(events: OrderCreated[]): void;
        }
      `,
      )
      .toBeValid();
  });

  /** A template instantiation is a message in its own right. */
  it("stays quiet when the message is a template instantiation", async () => {
    const tester = await createRuleTester(operationWithoutMessageRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @message
        model Envelope<T> {
          data: T;
        }

        @channel("orders.created")
        interface OrderChannel {
          @send
          op publish(event: Envelope<string>): void;
        }
      `,
      )
      .toBeValid();
  });
});
