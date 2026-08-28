import { describe, expect, it } from "vitest";
import type { ComponentsObject } from "#emitter/types/index.js";
import { emitDocument } from "../../../utils/test-host.js";

/**
 * The shape of `components`, pinned at the type level.
 *
 * Most of these fields have no writer yet. Declaring the field first lets a
 * later step add just the writer, not the writer and the field together.
 *
 * The real check is that this file compiles under `pnpm typecheck`. A wrong
 * assignment fails the build, not a runtime assertion.
 */
describe("Unit: the shape of ComponentsObject", () => {
  /**
   * A schema written in another language is a Multi Format Schema Object.
   * The specification allows one under `components.schemas`, so a protobuf
   * schema can be shared, not just written inline per message.
   */
  it("accepts a Multi Format Schema Object under schemas", () => {
    const components: ComponentsObject = {
      schemas: {
        OrderProto: {
          schemaFormat: "application/vnd.google.protobuf;version=3",
          schema: 'syntax = "proto3"; message Order { string id = 1; }',
        },
      },
    };

    expect(components.schemas?.OrderProto).toHaveProperty("schemaFormat");
  });

  /** A plain Schema Object fits the same map. */
  it("still accepts a plain Schema Object under schemas", () => {
    const components: ComponentsObject = {
      schemas: { Order: { type: "object", properties: { id: { type: "string" } } } },
    };

    expect(components.schemas?.Order).toHaveProperty("type", "object");
  });

  /**
   * A bindings component holds a whole Bindings Object, not one protocol
   * member. The specification allows `$ref` only at `bindings`, never at
   * `bindings.<protocol>`, so the map is typed by `BindingsObject`.
   */
  it("holds a whole Bindings Object in each bindings map", () => {
    const components: ComponentsObject = {
      serverBindings: {
        OrderDispatch: {
          jms: { jmsConnectionFactory: "org.apache.activemq.ActiveMQConnectionFactory" },
          ibmmq: { groupId: "orders" },
        },
      },
    };

    expect(Object.keys(components.serverBindings?.OrderDispatch ?? {})).toStrictEqual([
      "jms",
      "ibmmq",
    ]);
  });

  /**
   * The field set, pinned.
   *
   * `Required<ComponentsObject>` turns an added or removed field into a
   * compile error, so no field arrives without a decision behind it.
   *
   * This does not pin field order. `Object.keys` on the literal below would
   * only return the literal's own order, not the type's. The order a reader
   * sees is the order `lowerComponents` writes, pinned by the next case.
   */
  it("declares exactly the fields this emitter writes", () => {
    const populated: Required<ComponentsObject> = {
      schemas: {},
      serverVariables: {},
      messages: {},
      securitySchemes: {},
      parameters: {},
      correlationIds: {},
      replies: {},
      replyAddresses: {},
      serverBindings: {},
      channelBindings: {},
      operationBindings: {},
      messageBindings: {},
      tags: {},
      externalDocs: {},
    };

    // Five fields the specification defines but this emitter never writes:
    // `servers`, `channels`, `operations`, and the two traits.
    expect(Object.keys(populated)).toHaveLength(14);
  });

  /**
   * The order a reader sees.
   *
   * `lowerComponents` builds the section from a spread of conditional
   * literals. TypeScript does not enforce that this order follows the
   * interface, so this case is what keeps the two in agreement.
   *
   * Only the three fields with a writer appear yet. A later step extends
   * this list as it adds its own.
   */
  it("emits the sections in specification order", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("kafka-scram", #{ type: "scramSha512" })
      @useSecurity("kafka-scram")
      @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      interface OrderChannel {
        @send
        op publish(event: OrderCreated): void;
      }
    `);

    expect(Object.keys(doc.components ?? {})).toStrictEqual([
      "schemas",
      "messages",
      "securitySchemes",
    ]);
  });
});
