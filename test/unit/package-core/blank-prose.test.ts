import { describe, it, expect } from "vitest";
import { emitDocument } from "../../utils/test-host.js";

/**
 * `optional-fields.ts` holds the one rule about a field with nothing to say.
 * A resolver testing only `!== undefined` lets a blank `@doc` or `@summary`
 * reach the document as an empty string, indistinguishable from a
 * deliberate blank.
 */
describe("Unit: blank prose fields", () => {
  it("leaves out a blank title and description on a channel and an operation", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      @summary("  ")
      @doc("")
      interface OrderChannel {
        @send
        @summary("")
        @doc("  ")
        op publish(event: OrderCreated): void;
      }
    `);

    expect(doc.channels?.["orders.created"]).not.toHaveProperty("title");
    expect(doc.channels?.["orders.created"]).not.toHaveProperty("description");
    expect(doc.operations?.publish).not.toHaveProperty("title");
    expect(doc.operations?.publish).not.toHaveProperty("description");
  });

  it("leaves out a blank description on info", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @doc("  ")
      namespace Test;
    `);

    expect(doc.info).not.toHaveProperty("description");
  });
});
