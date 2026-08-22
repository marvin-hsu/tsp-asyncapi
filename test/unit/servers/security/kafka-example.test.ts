import { describe, it, expect } from "vitest";
import { emitDocument } from "../../../utils/test-host.js";
import { serversOf } from "../../../utils/document.js";
import { ASYNCAPI_VERSION, DEFAULT_INFO_VERSION } from "../../../../src/constants.js";

describe("Unit: Kafka acceptance example", () => {
  it("emits a prod and a sit Kafka broker that both use SCRAM", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("kafka-scram", #{
        type: "scramSha512",
        description: "SASL/SCRAM over TLS."
      })
      @useSecurity("kafka-scram")
      @server("production", #{
        host: "kafka.example.com:9092",
        protocol: "kafka-secure",
        protocolVersion: "3.5.0",
        title: "Production broker",
        description: "The production Kafka cluster."
      })
      @server("sit", #{
        host: "{tenant}.kafka.sit.example.com:9092",
        protocol: "kafka-secure",
        protocolVersion: "3.5.0",
        title: "SIT broker",
        variables: #{
          tenant: #{ default: "acme", \`enum\`: #["acme", "globex"], description: "The tenant." }
        }
      })
      namespace Test;
    `);

    // The whole document is asserted, not the servers alone. A stray
    // top-level field, a lost `info`, or a changed specification version
    // then fails this test as well.
    expect(doc).toEqual({
      asyncapi: ASYNCAPI_VERSION,
      info: { title: "Orders", version: DEFAULT_INFO_VERSION },
      servers: {
        production: {
          host: "kafka.example.com:9092",
          protocol: "kafka-secure",
          protocolVersion: "3.5.0",
          title: "Production broker",
          description: "The production Kafka cluster.",
          security: [{ $ref: "#/components/securitySchemes/kafka-scram" }],
        },
        sit: {
          host: "{tenant}.kafka.sit.example.com:9092",
          protocol: "kafka-secure",
          protocolVersion: "3.5.0",
          title: "SIT broker",
          variables: {
            tenant: { enum: ["acme", "globex"], default: "acme", description: "The tenant." },
          },
          security: [{ $ref: "#/components/securitySchemes/kafka-scram" }],
        },
      },
      channels: {},
      operations: {},
      components: {
        securitySchemes: {
          "kafka-scram": { type: "scramSha512", description: "SASL/SCRAM over TLS." },
        },
      },
    });
    // The shape above is one this project decided on. The official parser
    // decides whether the specification accepts it, and it is the only
    // judge of `security`, `variables` and `securitySchemes` together.
    await expect(doc).toBeValidAsyncAPI();
  });

  it("emits an apiKey and an X509 scheme that one server names together", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("byUser", #{ type: "apiKey", in: "user" })
      @securityScheme("cert", #{ type: "X509", description: "The client certificate." })
      @useSecurity("byUser")
      @useSecurity("cert")
      @server("production", #{ host: "mqtt.example.com", protocol: "mqtt" })
      namespace Test;
    `);

    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/byUser" },
      { $ref: "#/components/securitySchemes/cert" },
    ]);
    await expect(doc).toBeValidAsyncAPI();
  });

  it("emits an oauth2 scheme with no scopes that a server names", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @securityScheme("oauth", #{
        type: "oauth2",
        flows: #{
          clientCredentials: #{
            tokenUrl: "https://example.com/token",
            availableScopes: #{ \`orders:read\`: "Read orders" }
          }
        }
      })
      @useSecurity("oauth")
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(serversOf(doc).production.security).toEqual([
      { $ref: "#/components/securitySchemes/oauth" },
    ]);
    await expect(doc).toBeValidAsyncAPI();
  });
});
