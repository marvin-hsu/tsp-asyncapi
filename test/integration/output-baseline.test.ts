import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty } from "@typespec/compiler/testing";
import { AsyncAPITester } from "../../src/testing/index.js";
import { LIBRARY_NAME } from "../../src/lib.js";

/**
 * The byte-for-byte output baseline.
 *
 * Phase 9 moves every builder into a three-stage pipeline. The refactor must
 * not change one byte of the emitted document. Assertions on single fields
 * cannot prove that, because they only look where the author already looked.
 * A committed snapshot of the whole file looks everywhere at once.
 *
 * These snapshots are the file the emitter wrote, not a re-serialized object.
 * So they also pin key order, indentation, and quoting. The serialize stage
 * decides those, and a stage that only reorders keys is still a change a
 * reviewer must see.
 *
 * When a diff appears, do not update the snapshot to make the suite pass.
 * Explain the diff first. An unexplained diff is the refactor breaking the
 * output.
 *
 * Each program stays focused on a few document sections. A single large
 * program would put every diff in one file, and a reviewer could not tell
 * which section moved.
 */

/** The Avro format identifier AsyncAPI recommends. */
const AVRO = "application/vnd.apache.avro;version=1.9.0";

/**
 * Compiles one program and returns the file the emitter wrote.
 *
 * The other integration suites parse the output before asserting on it.
 * Parsing throws away exactly what this suite exists to protect, so the raw
 * text is returned instead.
 *
 * @param code - The whole of `main.tsp`, service namespace included
 * @param options - The emitter options
 * @returns The text of the emitted file
 */
async function emitRaw(code: string, options: Record<string, unknown> = {}): Promise<string> {
  const [result, diagnostics] = await AsyncAPITester.emit(LIBRARY_NAME, options).compileAndDiagnose(
    code,
  );
  // A baseline taken from a program that also reported a diagnostic would
  // freeze a half-built document. Every program here is meant to compile
  // clean.
  expectDiagnosticEmpty(diagnostics);

  const fileType = options["file-type"] === "json" ? "json" : "yaml";
  const name = `asyncapi.${fileType}`;
  // `outputs` is typed as a total map, so an absent file reads as `undefined`
  // at run time while the type says otherwise. Widening the type first keeps
  // the guard below honest. Without it, a program that emits nothing would
  // write the text "undefined" into the baseline.
  const outputs: Record<string, string | undefined> = result.outputs;
  const content = outputs[name];
  if (content === undefined) {
    throw new Error(`The emitter wrote no ${name}`);
  }
  return content;
}

/**
 * Emits one program and compares it against its committed snapshot file.
 *
 * The snapshot is a real `.yaml` or `.json` file rather than an entry in a
 * `.snap`, so a reviewer diffs the document itself.
 *
 * @param name - The base name of the snapshot file
 * @param code - The whole of `main.tsp`
 * @param options - The emitter options
 */
async function expectBaseline(
  name: string,
  code: string,
  options: Record<string, unknown> = {},
): Promise<void> {
  const fileType = options["file-type"] === "json" ? "json" : "yaml";
  const content = await emitRaw(code, options);
  await expect(content).toMatchFileSnapshot(`./__snapshots__/output-baseline/${name}.${fileType}`);
}

// The service namespace, its metadata, and the two options that only reach
// the root of the document.
const INFO_PROGRAM = `
  @service(#{ title: "Order Events" })
  @info(#{
    version: "1.4.2",
    description: "Every event the order system publishes.",
    termsOfService: "https://example.com/terms",
    contact: #{ name: "API Team", url: "https://example.com/team", email: "team@example.com" },
    license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
  })
  @tag("orders")
  @asyncTag("orders", #{
    description: "The order domain as a whole.",
    externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
  })
  @asyncTag("public")
  @externalDocs("https://example.com/docs", "The whole documentation set.")
  namespace Orders;
`;

describe("Output baseline", () => {
  it("pins info, tags, and the root options", async () => {
    await expectBaseline("info", INFO_PROGRAM, {
      "asyncapi-id": "urn:com:example:orders",
      "default-content-type": "application/json",
    });
  });

  it("pins the same program in JSON", async () => {
    // The same source through the other serializer. Without this, the JSON
    // half of the serialize stage has no baseline at all, and YAML is the
    // default so nothing else would reach it.
    await expectBaseline("info", INFO_PROGRAM, {
      "file-type": "json",
      "asyncapi-id": "urn:com:example:orders",
      "default-content-type": "application/json",
    });
  });

  it("pins servers, server variables, and securitySchemes", async () => {
    await expectBaseline(
      "servers-security",
      `
        @service(#{ title: "Order Events" })
        @tag("edge")
        @asyncTag("region", #{ description: "Where the broker runs." })
        @securityScheme("kafka-scram", #{
          type: "scramSha512",
          description: "SASL/SCRAM over TLS."
        })
        @securityScheme("api-key", #{
          type: "httpApiKey",
          name: "X-Api-Key",
          in: "header"
        })
        @securityScheme("oauth", #{
          type: "oauth2",
          scopes: #["orders:read"],
          flows: #{
            clientCredentials: #{
              tokenUrl: "https://example.com/token",
              refreshUrl: "https://example.com/refresh",
              availableScopes: #{ \`orders:read\`: "Read orders" }
            },
            authorizationCode: #{
              authorizationUrl: "https://example.com/authorize",
              tokenUrl: "https://example.com/token",
              availableScopes: #{ \`orders:write\`: "Write orders" }
            }
          }
        })
        @useSecurity("kafka-scram")
        @useSecurity("oauth")
        @server("production", #{
          host: "{tenant}.kafka.example.com:9092",
          protocol: "kafka-secure",
          protocolVersion: "3.5.0",
          pathname: "/{stage}",
          title: "Production",
          summary: "The production cluster.",
          description: "One cluster per tenant.",
          variables: #{
            tenant: #{ default: "acme", \`enum\`: #["acme", "globex"], description: "The tenant." },
            stage: #{ default: "v1", examples: #["v1"] }
          }
        })
        @server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
        namespace Orders;
      `,
    );
  });

  it("pins channels, parameters, and the three operation shapes", async () => {
    // One channel with address expressions and two servers, one dynamic
    // channel, and the three ways an operation reaches the document: send,
    // receive, and a send with an explicit reply channel and reply address.
    await expectBaseline(
      "channels-operations",
      `
        @service(#{ title: "Order Events" })
        @securityScheme("kafka-scram", #{ type: "scramSha512" })
        @server("primary", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        @server("secondary", #{ host: "kafka.dr.example.com:9092", protocol: "kafka" })
        namespace Orders;

        @message
        model CreateOrder {
          id: string;
        }

        @message
        model OrderAccepted {
          id: string;
        }

        @message
        model OrderShipped {
          id: string;
        }

        @dynamicChannel
        @doc("The reply channel. Its address is only known at run time.")
        interface ReplyChannel {
          @receive op onAccepted(): OrderAccepted;
        }

        @channel("orders.{region}.{tenant}.create")
        @useServer("primary")
        @useServer("secondary")
        @asyncTag("commands")
        interface OrderCommands {
          @send
          @useSecurity("kafka-scram")
          @replyChannel(ReplyChannel)
          @replyAddress("$message.header#/replyTo", "Where the reply goes.")
          op createOrder(
            @parameterLocation("$message.header#/region")
            @doc("The region of the cluster.")
            region: string,

            tenant: "acme" | "globex",

            command: CreateOrder
          ): OrderAccepted;
        }

        @channel("orders.shipped", "shipped")
        namespace OrderEvents {
          @receive
          @doc("Consumes the shipment event.")
          op onOrderShipped(): OrderShipped;
        }
      `,
    );
  });

  it("pins message headers, correlationId, contentType, and examples", async () => {
    // Both header mechanisms in one document. `OrderPlaced` lifts flat
    // fields out of its payload, so it also pins the split payload
    // component. `OrderShipped` names a headers model instead.
    await expectBaseline(
      "messages",
      `
        @service(#{ title: "Order Events" })
        namespace Orders;

        model MqmdFields {
          CorrelId: string;
        }

        model ShippingHeaders {
          MQMD: MqmdFields;
        }

        @message
        @contentType("application/json")
        @correlationId("$message.header#/correlationId", "Ties a reply to its request.")
        @messageExample(
          #{
            headers: #{ correlationId: "abc-123" },
            payload: #{ id: "o-1", amount: 12.5 }
          },
          #{ name: "smallOrder", summary: "One line, already paid." }
        )
        @messageExample(
          #{ payload: #{ id: "o-2", amount: 999.0 } },
          #{ name: "largeOrder" }
        )
        @asyncTag("orders", #{ description: "Emitted by the order service." })
        @externalDocs("https://example.com/order-placed", "How to consume this message.")
        model OrderPlaced {
          @header
          correlationId: string;

          @header
          @encodedName("application/json", "x-retry-count")
          retryCount?: int32;

          id: string;
          amount: float64;
        }

        @message("shipped")
        @headers(ShippingHeaders)
        @correlationId("$message.header#/MQMD/CorrelId")
        model OrderShipped {
          id: string;
        }
      `,
    );
  });

  it("pins the raw payload and raw headers of a message", async () => {
    // A Multi Format Schema Object is written into the message, never into
    // `components`. That makes it the one message shape the other programs
    // cannot reach.
    await expectBaseline(
      "raw-schema",
      `
        @service(#{ title: "Order Events" })
        namespace Orders;

        @message
        @rawPayload("${AVRO}", #{
          type: "record",
          name: "OrderCreated",
          fields: #[#{ name: "orderId", type: "string" }]
        })
        @rawHeaders("${AVRO}", #{
          type: "record",
          name: "OrderCreatedHeaders",
          fields: #[#{ name: "correlationId", type: "string" }]
        })
        model OrderCreated {}
      `,
    );
  });

  it("pins schema composition: inheritance, discriminator, and unions", async () => {
    await expectBaseline(
      "schemas-composition",
      `
        @service(#{ title: "Order Events" })
        namespace Orders;

        @discriminator("kind")
        model Pet {
          kind: string;
          name: string;
        }

        model Cat extends Pet {
          kind: "cat";
          lives: int32;
        }

        model Dog extends Pet {
          kind: "dog";
        }

        @discriminated
        union Envelope {
          cat: Cat,
          dog: Dog
        }

        @oneOf
        union Payment {
          card: string,
          cash: int32
        }

        union Channel {
          web: "web",
          app: "app"
        }

        enum Priority {
          low,
          high
        }

        @message
        model PetAdopted {
          pet: Pet;
          envelope: Envelope;
          payment: Payment;
          origin: Channel;
          priority: Priority;
        }
      `,
    );
  });

  it("pins schema annotations: encode, defaults, deprecated, and visibility", async () => {
    await expectBaseline(
      "schemas-annotations",
      `
        @service(#{ title: "Order Events" })
        namespace Orders;

        @doc("Everything that describes a value without naming its type.")
        @externalDocs("https://example.com/annotations", "The annotation guide.")
        model Details {
          @encode("unixTimestamp", int32)
          placedAt: utcDateTime;

          @encode(BytesKnownEncoding.base64url)
          blob: bytes;

          @minLength(2)
          @maxLength(64)
          @pattern("^[a-z]+$")
          @example("ab")
          @example("cd")
          slug?: string = "ab";

          @minValue(1)
          @maxValue(10)
          retries?: int32 = 3;

          enabled?: boolean = false;

          @secret
          token: string;

          #deprecated "use fullName instead"
          name?: string;

          @invisible(Lifecycle)
          internalOnly: string;

          @jsonSchemaExtension("x-owner", "orders-team")
          owner: string;
        }

        @message
        model OrderDetailed {
          details: Details;
        }
      `,
    );
  });

  it("pins Kafka bindings at all four levels", async () => {
    // Server, channel, operation, and message, plus one generic `@binding`
    // beside a Kafka one. The generic decorator adds no `bindingVersion`,
    // and only a whole-document snapshot shows the two side by side.
    await expectBaseline(
      "kafka-bindings",
      `
        @service(#{ title: "Order Events" })
        @kafkaServer(#{
          schemaRegistryUrl: "https://registry.example.com",
          schemaRegistryVendor: "confluent"
        })
        @server("production", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        namespace Orders;

        @message
        @kafkaMessage(#{
          key: #{ type: "string" },
          schemaIdLocation: "header",
          schemaIdPayloadEncoding: "confluent",
          schemaLookupStrategy: "TopicIdStrategy"
        })
        @binding("mqtt", #{ qos: 1 })
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        @kafkaChannel(#{
          topic: "orders.created",
          partitions: 3,
          replicas: 3,
          topicConfiguration: #{ \`cleanup.policy\`: #["compact"], \`retention.ms\`: 604800000 }
        })
        @binding("amqp", #{ expiration: 100 })
        interface OrderChannel {
          @send
          @kafkaOperation(#{ groupId: #{ type: "string" }, clientId: #{ type: "string" } })
          op publish(event: OrderCreated): void;
        }
      `,
    );
  });
});
