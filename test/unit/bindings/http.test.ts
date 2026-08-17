/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { findDiagnostic } from "../../utils/diagnostics.js";

const SERVICE = `
  @service(#{ title: "Notices" })
  @server("prod", #{ host: "api.example.com", protocol: "http" })
  namespace Test;
`;

describe("Unit: the HTTP binding decorators", () => {
  describe("@httpOperation", () => {
    it("emits every field with the binding version", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @message
        model Notice {
          body: string;
        }

        @channel("/notices")
        interface Notices {
          @httpOperation(#{
            method: "POST",
            query: #{ type: "object", properties: #{ since: #{ type: "string" } } },
          })
          @send
          op publish(event: Notice): void;
        }
      `);

      expect(doc.operations.publish.bindings).toEqual({
        http: {
          method: "POST",
          query: { type: "object", properties: { since: { type: "string" } } },
          bindingVersion: "0.3.0",
        },
      });
    });

    it("accepts every method the binding lists", async () => {
      const methods = [
        "GET",
        "PUT",
        "POST",
        "PATCH",
        "DELETE",
        "HEAD",
        "OPTIONS",
        "CONNECT",
        "TRACE",
      ];

      for (const method of methods) {
        const doc = await emitAsyncAPI(`
          ${SERVICE}

          @message
          model Notice {
            body: string;
          }

          @channel("/notices")
          interface Notices {
            @httpOperation(#{ method: "${method}" })
            @send
            op publish(event: Notice): void;
          }
        `);

        expect(doc.operations.publish.bindings.http.method).toBe(method);
      }
    });

    it("reports a method the binding does not list", async () => {
      const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @message
        model Notice {
          body: string;
        }

        @channel("/notices")
        interface Notices {
          @httpOperation(#{ method: "FETCH" })
          @send
          op publish(event: Notice): void;
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
      expect(reported.message).toContain("method");
      expect(reported.message).toContain("http binding field");
    });

    it("reports a query schema that names no property", async () => {
      const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @message
        model Notice {
          body: string;
        }

        @channel("/notices")
        interface Notices {
          @httpOperation(#{ query: #{ type: "object" } })
          @send
          op publish(event: Notice): void;
        }
      `);

      // HTTP states the same rule the WebSocket binding does. A schema with no
      // `properties` key describes no query parameter.
      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
      expect(reported.message).toContain("query");
      expect(reported.message).toContain(`an object schema with a "properties" key`);
    });
  });

  describe("@httpMessage", () => {
    it("emits every field with the binding version", async () => {
      const doc = await emitAsyncAPI(`
        ${SERVICE}

        @httpMessage(#{
          headers: #{ type: "object", properties: #{ \`X-Trace-Id\`: #{ type: "string" } } },
          statusCode: 201,
        })
        @message
        model Notice {
          body: string;
        }

        @channel("/notices")
        interface Notices {
          @send
          op publish(event: Notice): void;
        }
      `);

      expect(doc.components.messages.Notice.bindings).toEqual({
        http: {
          headers: { type: "object", properties: { "X-Trace-Id": { type: "string" } } },
          statusCode: 201,
          bindingVersion: "0.3.0",
        },
      });
    });

    it("reports a status code outside the range RFC 9110 defines", async () => {
      const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
        ${SERVICE}

        @httpMessage(#{ statusCode: 999, headers: #{ type: "object", properties: #{} } })
        @message
        model Notice {
          body: string;
        }

        @channel("/notices")
        interface Notices {
          @send
          op publish(event: Notice): void;
        }
      `);

      const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
      expect(reported.message).toContain("statusCode");
      expect(reported.message).toContain("a status code from 100 to 599");
      // The rejected field goes on its own.
      expect(doc.components.messages.Notice.bindings.http).toEqual({
        headers: { type: "object", properties: {} },
        bindingVersion: "0.3.0",
      });
    });

    it("accepts the lowest and the highest status code", async () => {
      for (const code of [100, 599]) {
        const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
          ${SERVICE}

          @httpMessage(#{ statusCode: ${String(code)} })
          @message
          model Notice {
            body: string;
          }

          @channel("/notices")
          interface Notices {
            @send
            op publish(event: Notice): void;
          }
        `);

        // The range is inclusive at both ends. An off-by-one check would
        // reject a code the specification allows.
        expect(diagnostics.filter((d) => d.code === "tsp-asyncapi/invalid-binding-field")).toEqual(
          [],
        );
        expect(doc.components.messages.Notice.bindings.http.statusCode).toBe(code);
      }
    });
  });
});
