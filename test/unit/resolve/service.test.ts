import { describe, it, expect } from "vitest";
import type { Model, ModelProperty, Namespace, Operation } from "@typespec/compiler";
import type {
  AsyncAPIService,
  BindingNode,
  ChannelMessageNode,
  ChannelNode,
  ChannelParameterNode,
  ContactNode,
  ExternalDocsNode,
  InfoNode,
  JsonObject,
  LicenseNode,
  MessageHeadersNode,
  MessageNode,
  MessagePayloadNode,
  MessageRefNode,
  OperationNode,
  OperationReplyNode,
  SecuritySchemeNode,
  ServerNode,
  ServerVariableNode,
  TagNode,
} from "../../../src/resolve/service.js";

/**
 * The semantic model is types only. This suite is a compile-time check of
 * its shape, so it builds a whole service from stubs instead of compiling
 * TypeSpec. It fails at type-check time, not at run time.
 *
 * The suite also keeps the file reachable. Nothing imports the model yet,
 * because the emitter is not wired to it.
 */
function stub(name: string): unknown {
  return { name };
}

const namespace = stub("Service") as Namespace;
const model = stub("Order") as Model;
const property = stub("orderId") as ModelProperty;
const operation = stub("publishOrder") as Operation;

const externalDocs: ExternalDocsNode = { url: "https://example.com" };
const tag: TagNode = { name: "orders", description: "Order traffic", externalDocs };
const contact: ContactNode = { name: "Team", email: "team@example.com" };
const license: LicenseNode = { name: "MIT" };
const config: JsonObject = { groupId: "orders" };
const binding: BindingNode = { protocol: "kafka", renderer: "kafka", config };

const info: InfoNode = {
  target: namespace,
  title: "Order Service",
  version: "1.0.0",
  tags: [tag],
  externalDocs,
  contact,
  license,
};

const variable: ServerVariableNode = { enum: ["dev", "prod"], default: "dev" };

const server: ServerNode = {
  target: namespace,
  name: "production",
  host: "broker.example.com",
  protocol: "kafka",
  variables: new Map([["stage", variable]]),
  security: ["apiKey"],
  tags: [tag],
  bindings: [binding],
};

const securityScheme: SecuritySchemeNode = {
  target: namespace,
  name: "apiKey",
  scheme: { type: "httpApiKey", name: "x-api-key", in: "header" },
};

const headers: MessageHeadersNode = { kind: "fields", fields: [property] };
const payload: MessagePayloadNode = { kind: "model", model, lifted: new Set([property]) };

const message: MessageNode = {
  target: model,
  key: "Order",
  headers,
  payload,
  examples: [{ name: "one", payload: { id: 1 } }],
  tags: [tag],
  bindings: [binding],
  rawPayloadRef: "#/components/schemas/Order",
};

const parameter: ChannelParameterNode = {
  target: property,
  name: "orderId",
  enumValues: ["a", "b"],
};

const channelMessage: ChannelMessageNode = { model, key: "Order" };

const channel: ChannelNode = {
  target: namespace,
  key: "orders",
  address: "orders/{orderId}",
  servers: ["production"],
  parameters: [parameter],
  messages: [channelMessage],
  messageKeys: new Map([[model, "Order"]]),
  tags: [tag],
  bindings: [binding],
};

const messageRef: MessageRefNode = { channelKey: "orders", messageKey: "Order" };

const reply: OperationReplyNode = { channelKey: "orders", messages: [messageRef] };

const operationNode: OperationNode = {
  target: operation,
  key: "publishOrder",
  action: "send",
  channelKey: "orders",
  security: ["apiKey"],
  tags: [tag],
  bindings: [binding],
  messages: [messageRef],
  reply,
};

const service: AsyncAPIService = {
  target: namespace,
  info,
  servers: [server],
  securitySchemes: [securityScheme],
  messages: [message],
  messageKeys: new Map([[model, "Order"]]),
  channels: [channel],
  operations: [operationNode],
};

describe("AsyncAPIService", () => {
  it("describes a whole service from one value", () => {
    expect(service.info.title).toBe("Order Service");
    expect(service.channels[0].address).toBe("orders/{orderId}");
    expect(service.operations[0].reply?.channelKey).toBe("orders");
    // There is no schema key table to assert on. A schema key is decided
    // while the type graph is walked, so the schema builder owns it and the
    // lower stage is where it lives.
    expect(service.messageKeys.get(model)).toBe("Order");
  });

  it("keeps a dynamic channel apart from a channel with no address", () => {
    const dynamic: ChannelNode = { ...channel, address: null };

    expect(dynamic.address).toBeNull();
  });
});
