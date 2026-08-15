import { describe, it, expect } from "vitest";

describe("AsyncAPI spec validation helper", () => {
  // Shared by the two tests that check how a dangling $ref is reported.
  const docWithMissingRef = {
    asyncapi: "3.1.0",
    info: { title: "Broken", version: "1.0.0" },
    channels: {
      orders: {
        address: "orders",
        messages: { placed: { $ref: "#/components/messages/missing" } },
      },
    },
  };

  it("should accept a minimal valid document", async () => {
    await expect({
      asyncapi: "3.1.0",
      info: { title: "Valid", version: "1.0.0" },
    }).toBeValidAsyncAPI();
  });

  it("should accept a document given as a YAML string", async () => {
    await expect(`asyncapi: 3.1.0\ninfo:\n  title: Valid\n  version: 1.0.0\n`).toBeValidAsyncAPI();
  });

  it("should reject a document without the asyncapi version field", async () => {
    await expect({ info: { title: "Broken", version: "1.0.0" } }).toBeInvalidAsyncAPI(
      /asyncapi-is-asyncapi/,
    );
  });

  it("should reject a document without a required info field", async () => {
    await expect({ asyncapi: "3.1.0", info: { title: "Broken" } }).toBeInvalidAsyncAPI(
      /must have required property "version"/,
    );
  });

  it("should reject a reference to a component that does not exist", async () => {
    await expect(docWithMissingRef).toBeInvalidAsyncAPI(/invalid-ref/);
  });

  it("should report the path of the offending node", async () => {
    await expect(docWithMissingRef).toBeInvalidAsyncAPI(
      /channels\/orders\/messages\/placed\/\$ref/,
    );
  });

  it("should accept a document that only raises non-error diagnostics", async () => {
    // Version 3.0.0 raises the informational asyncapi-latest-version rule. It stays valid.
    await expect({
      asyncapi: "3.0.0",
      info: { title: "Older", version: "1.0.0" },
    }).toBeValidAsyncAPI();
  });

  it("should reject a document that declares AsyncAPI 2.x", async () => {
    await expect({
      asyncapi: "2.6.0",
      info: { title: "Old", version: "1.0.0" },
      channels: {},
    }).toBeInvalidAsyncAPI(/major version 3/);
  });

  it("should reject a document given as a YAML string that declares AsyncAPI 2.x", async () => {
    await expect(
      `asyncapi: 2.6.0\ninfo:\n  title: Old\n  version: 1.0.0\nchannels: {}\n`,
    ).toBeInvalidAsyncAPI(/major version 3/);
  });

  it("should reject an empty document", async () => {
    await expect(null).toBeInvalidAsyncAPI(/got nothing/);
  });
});
