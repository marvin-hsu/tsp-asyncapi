/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { emitAsyncAPI, emitAsyncAPIWithDiagnostics } from "../../utils/test-host.js";
import { findDiagnostic, targetText } from "../../utils/diagnostics.js";

const SERVICE = `
  @service(#{ title: "Events" })
  @server("prod", #{ host: "events.example.com", protocol: "ws" })
  namespace Test;

  @message
  model Tick {
    at: utcDateTime;
  }
`;

describe("Unit: the @websocketChannel decorator", () => {
  it("emits every field with the binding version", async () => {
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @websocketChannel(#{
        method: "GET",
        query: #{ type: "object", properties: #{ token: #{ type: "string" } } },
        headers: #{ type: "object", properties: #{ \`X-Api-Key\`: #{ type: "string" } } },
      })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    // The member is `ws`. AsyncAPI names the binding folder `websockets` and
    // the decorator `websocketChannel`, and neither of those is the member
    // name a reader of the document sees.
    expect(doc.channels["/ticks"].bindings).toEqual({
      ws: {
        method: "GET",
        query: { type: "object", properties: { token: { type: "string" } } },
        headers: { type: "object", properties: { "X-Api-Key": { type: "string" } } },
        bindingVersion: "0.1.0",
      },
    });
  });

  it("accepts POST as the handshake method", async () => {
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @websocketChannel(#{ method: "POST" })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    expect(doc.channels["/ticks"].bindings.ws.method).toBe("POST");
  });

  it("reaches a namespace channel as well as an interface channel", async () => {
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @websocketChannel(#{ method: "GET" })
      @channel("/ticks")
      namespace TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    expect(doc.channels["/ticks"].bindings.ws.method).toBe("GET");
  });

  it("emits the binding version on its own when no field was written", async () => {
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @websocketChannel(#{})
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    // The author asked for the binding, so the member is emitted. An absent
    // member would say the channel uses no WebSocket binding at all.
    expect(doc.channels["/ticks"].bindings.ws).toEqual({ bindingVersion: "0.1.0" });
  });

  it("reports a method outside the two the binding allows, and keeps the rest", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${SERVICE}

      @websocketChannel(#{
        method: "PUT",
        query: #{ type: "object", properties: #{ token: #{ type: "string" } } },
      })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("method");
    expect(reported.message).toContain("GET or POST");
    // The message names the protocol as well as the field. One code covers
    // every binding, so the protocol is the half that says which one.
    expect(reported.message).toContain("ws binding field");
    expect(doc.channels["/ticks"].bindings.ws).toEqual({
      query: { type: "object", properties: { token: { type: "string" } } },
      bindingVersion: "0.1.0",
    });
  });

  it("trims a padded method", async () => {
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @websocketChannel(#{ method: "  GET  " })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    // The spacing is not what the author meant to say, so it is not a reason
    // to reject a method the binding allows.
    expect(doc.channels["/ticks"].bindings.ws.method).toBe("GET");
  });

  it("reports a query that is not an object at all", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${SERVICE}

      @websocketChannel(#{ query: "token" })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("query");
    expect(reported.message).toContain("a schema object");
    // The squiggle sits on the config literal, not on the whole interface.
    expect(targetText(reported)).toBe(`#{ query: "token" }`);
  });

  it("reports a headers schema that is an object but names no property", async () => {
    const { doc, diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${SERVICE}

      @websocketChannel(#{ method: "GET", headers: #{ type: "object" } })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    // The binding says the schema must have a `properties` key. A schema
    // without one describes no header, so a generator reading it builds a
    // handshake with nothing in it.
    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("headers");
    expect(reported.message).toContain(`an object schema with a "properties" key`);
    expect(doc.channels["/ticks"].bindings.ws).toEqual({
      method: "GET",
      bindingVersion: "0.1.0",
    });
  });

  it("reports a query schema whose type is not object", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${SERVICE}

      @websocketChannel(#{ query: #{ type: "string", properties: #{} } })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/invalid-binding-field");
    expect(reported.message).toContain("query");
    expect(reported.message).toContain(`an object schema with a "properties" key`);
  });

  it("accepts a query that is a reference", async () => {
    const doc = await emitAsyncAPI(`
      ${SERVICE}

      @websocketChannel(#{ query: #{ \`$ref\`: "#/components/schemas/Handshake" } })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    // A reference names a schema that lives elsewhere. This emitter does not
    // follow it, so it cannot say whether the schema behind it is an object.
    expect(doc.channels["/ticks"].bindings.ws.query).toEqual({
      $ref: "#/components/schemas/Handshake",
    });
  });

  it("reports a binding on a target that carries no channel", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${SERVICE}

      @websocketChannel(#{ method: "GET" })
      interface NotAChannel {
        @send
        op publish(event: Tick): void;
      }
    `);

    // The binding reaches no part of the document. Dropping it in silence
    // would leave the author believing the handshake was described.
    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/binding-outside-document");
    expect(reported.message).toContain("ws");
  });

  it("reports the generic @binding claiming the member ws as well", async () => {
    const { diagnostics } = await emitAsyncAPIWithDiagnostics(`
      ${SERVICE}

      @websocketChannel(#{ method: "GET" })
      @binding("ws", #{ method: "POST" })
      @channel("/ticks")
      interface TickStream {
        @send
        op publish(event: Tick): void;
      }
    `);

    // One protocol claims one member of a Bindings Object. Two claims on one
    // member means one of them is lost, and the author has to be told which.
    const reported = findDiagnostic(diagnostics, "tsp-asyncapi/duplicate-binding");
    expect(reported.message).toContain("ws");
  });
});
