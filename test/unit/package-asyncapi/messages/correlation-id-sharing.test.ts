import { describe, expect, it } from "vitest";
import { emitDocument } from "../../../utils/test-host.js";
import { messagesOf } from "../../../utils/document.js";
import { validateAsyncAPI } from "../../../utils/spec-validation.js";

const SOURCE = (second: string) => `
  @service(#{ title: "Orders" })
  namespace Test;

  @message
  @correlationId("$message.header#/correlation-id")
  model Placed {
    id: string;
  }

  @message
  @correlationId("${second}")
  model Shipped {
    id: string;
  }

  @channel("orders")
  interface OrderChannel {
    @send
    op place(event: Placed): void;

    @send
    op ship(event: Shipped): void;
  }
`;

/**
 * A Correlation ID Object has no name of its own, so the second use is what
 * says a component saves anything.
 */
describe("Unit: sharing a correlation id", () => {
  it("shares one component when two messages state the same location", async () => {
    const doc = await emitDocument(SOURCE("$message.header#/correlation-id"));

    expect(doc.components?.correlationIds).toStrictEqual({
      Placed: { location: "$message.header#/correlation-id" },
    });
    for (const name of ["Placed", "Shipped"]) {
      expect(messagesOf(doc)[name].correlationId).toStrictEqual({
        $ref: "#/components/correlationIds/Placed",
      });
    }
    expect(await validateAsyncAPI(doc)).toBeNull();
  });

  it("keeps two different locations in place", async () => {
    const doc = await emitDocument(SOURCE("$message.header#/other-id"));

    expect(doc.components?.correlationIds).toBeUndefined();
    expect(messagesOf(doc).Placed.correlationId).toStrictEqual({
      location: "$message.header#/correlation-id",
    });
  });

  /** One message stating it alone gains nothing from a component. */
  it("keeps a lone correlation id in place", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @correlationId("$message.header#/correlation-id")
      model Placed {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;
      }
    `);

    expect(doc.components?.correlationIds).toBeUndefined();
    expect(messagesOf(doc).Placed.correlationId).toStrictEqual({
      location: "$message.header#/correlation-id",
    });
  });
});
