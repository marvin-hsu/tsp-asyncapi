import { describe, expect, it } from "vitest";
import { emitDocument } from "../../../utils/test-host.js";
import { messagesOf, schemasOf } from "../../../utils/document.js";
import { validateAsyncAPI } from "../../../utils/spec-validation.js";

const PROTO = "message Order { string id = 1; }";

/**
 * Two messages carrying one schema written in another language.
 *
 * The emitter never reads inside such a schema, so it could not share one
 * either: each message wrote the whole text. That is the blocker
 * `@rawPayload` records, and it is what makes deriving a Protobuf payload
 * expensive, because one `.proto` holds every message of its package.
 */
describe("Unit: sharing a raw payload", () => {
  it("emits one component and two references when two messages agree", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @rawPayload("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
      model Placed {}

      @rawPayload("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
      model Shipped {}

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;

        @send
        op ship(event: Shipped): void;
      }
    `);

    // The first message in source order names the component.
    expect(Object.keys(schemasOf(doc))).toStrictEqual(["PlacedPayload"]);
    expect(schemasOf(doc).PlacedPayload).toStrictEqual({
      schemaFormat: "application/vnd.google.protobuf;version=3",
      schema: PROTO,
    });

    for (const name of ["Placed", "Shipped"]) {
      expect(messagesOf(doc)[name].payload).toStrictEqual({
        $ref: "#/components/schemas/PlacedPayload",
      });
    }
  });

  /**
   * One use keeps the schema where it is. A component would add a `$ref` hop
   * and save nothing, which is the reason `components` reuse was deferred in
   * the first place.
   */
  it("leaves a schema used once in the message", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @rawPayload("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
      model Placed {}

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;
      }
    `);

    expect(messagesOf(doc).Placed.payload).toStrictEqual({
      schemaFormat: "application/vnd.google.protobuf;version=3",
      schema: PROTO,
    });
    expect(doc.components?.schemas).toBeUndefined();
  });

  /** Two schemas that differ are two schemas, and neither is promoted. */
  it("keeps schemas that differ apart", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @rawPayload("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
      model Placed {}

      @rawPayload("application/vnd.google.protobuf;version=3", "message Ship { string id = 1; }")
      @message
      model Shipped {}

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;

        @send
        op ship(event: Shipped): void;
      }
    `);

    expect(doc.components?.schemas).toBeUndefined();
    expect(messagesOf(doc).Placed.payload).toHaveProperty("schema", PROTO);
  });

  /** The same rule for `@rawHeaders`, keyed with its own suffix. */
  it("shares raw headers under a Headers key", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @rawHeaders("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
      model Placed {
        id: string;
      }

      @rawHeaders("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
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
    `);

    expect(schemasOf(doc).PlacedHeaders).toStrictEqual({
      schemaFormat: "application/vnd.google.protobuf;version=3",
      schema: PROTO,
    });
    for (const name of ["Placed", "Shipped"]) {
      expect(messagesOf(doc)[name].headers).toStrictEqual({
        $ref: "#/components/schemas/PlacedHeaders",
      });
    }
  });

  /**
   * The promoted form has to be a document the specification accepts. The
   * official parser is the authority, and this is the case the whole phase
   * rests on.
   */
  it("emits a document the official parser accepts", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @rawPayload("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
      model Placed {}

      @rawPayload("application/vnd.google.protobuf;version=3", "${PROTO}")
      @message
      model Shipped {}

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;

        @send
        op ship(event: Shipped): void;
      }
    `);

    expect(await validateAsyncAPI(doc)).toBeNull();
  });
});
