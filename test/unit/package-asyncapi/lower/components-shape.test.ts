import { describe, expect, it } from "vitest";
import type { ComponentsObject } from "#emitter/types/index.js";
import { emitDocument } from "../../../utils/test-host.js";

/**
 * The shape of `components`, pinned at the type level.
 *
 * Nothing writes most of these fields yet. They are declared first, so a
 * later step adds one writer rather than a writer and a field together.
 *
 * The assertions below are ordinary values. The check that matters is that
 * this file compiles. `pnpm typecheck` covers `test/`, so the type rejects a
 * wrong assignment at build time.
 */
describe("Unit: the shape of ComponentsObject", () => {
  /**
   * The field this whole phase exists for. A schema written in another
   * language is a Multi Format Schema Object, and the specification allows
   * one under `components.schemas`. Until now the type said otherwise, so a
   * protobuf schema could only be written inline, once per message.
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

  /** A plain Schema Object still fits the same map. */
  it("still accepts a plain Schema Object under schemas", () => {
    const components: ComponentsObject = {
      schemas: { Order: { type: "object", properties: { id: { type: "string" } } } },
    };

    expect(components.schemas?.Order).toHaveProperty("type", "object");
  });

  /**
   * A bindings component holds a whole Bindings Object.
   *
   * The specification offers no reference alternative for one protocol
   * member, so `$ref` belongs at `bindings` and never at
   * `bindings.<protocol>`. Typing the map by `BindingsObject` is what keeps
   * a later step from promoting at the wrong granularity.
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
   * `Required<ComponentsObject>` makes an added or removed field a compile
   * error, so this catches a field arriving without a decision behind it.
   *
   * It does not pin the order. An interface declaration order cannot be read
   * at run time, and `Object.keys` here would return the order of the literal
   * below rather than the order of the type. The order a reader sees is the
   * order `lowerComponents` writes, and the case after this one pins that
   * against an emitted document.
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

    // The five the specification defines and this emitter does not write:
    // `servers`, `channels`, `operations`, and the two traits.
    expect(Object.keys(populated)).toHaveLength(14);
  });

  /**
   * The order a reader sees.
   *
   * `lowerComponents` builds the section from a spread of conditional
   * literals, and TypeScript does not make that follow the interface. The two
   * agree today because they were written to. This case is what keeps them
   * agreeing as later steps add a spread each.
   *
   * Only the three fields with a writer can appear yet. A later step extends
   * the expected list as it adds its own.
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
