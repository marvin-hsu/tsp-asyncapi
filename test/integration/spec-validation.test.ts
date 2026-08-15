import { describe, it, expect } from "vitest";
import { expectValidAsyncAPI } from "../utils/spec-validation.js";

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
    await expectValidAsyncAPI({
      asyncapi: "3.1.0",
      info: { title: "Valid", version: "1.0.0" },
    });
  });

  it("should accept a document given as a YAML string", async () => {
    await expectValidAsyncAPI(`asyncapi: 3.1.0\ninfo:\n  title: Valid\n  version: 1.0.0\n`);
  });

  it("should reject a document without the asyncapi version field", async () => {
    await expect(
      expectValidAsyncAPI({ info: { title: "Broken", version: "1.0.0" } }),
    ).rejects.toThrow(/asyncapi-is-asyncapi/);
  });

  it("should reject a document without a required info field", async () => {
    await expect(
      expectValidAsyncAPI({ asyncapi: "3.1.0", info: { title: "Broken" } }),
    ).rejects.toThrow(/must have required property "version"/);
  });

  it("should reject a reference to a component that does not exist", async () => {
    await expect(expectValidAsyncAPI(docWithMissingRef)).rejects.toThrow(/invalid-ref/);
  });

  it("should report the path of the offending node", async () => {
    await expect(expectValidAsyncAPI(docWithMissingRef)).rejects.toThrow(
      /channels\/orders\/messages\/placed\/\$ref/,
    );
  });

  it("should accept a document that only raises non-error diagnostics", async () => {
    // Version 3.0.0 raises the informational asyncapi-latest-version rule. It stays valid.
    await expectValidAsyncAPI({
      asyncapi: "3.0.0",
      info: { title: "Older", version: "1.0.0" },
    });
  });

  it("should reject a document that declares AsyncAPI 2.x", async () => {
    await expect(
      expectValidAsyncAPI({
        asyncapi: "2.6.0",
        info: { title: "Old", version: "1.0.0" },
        channels: {},
      }),
    ).rejects.toThrow(/major version 3/);
  });

  it("should reject a document given as a YAML string that declares AsyncAPI 2.x", async () => {
    await expect(
      expectValidAsyncAPI(`asyncapi: 2.6.0\ninfo:\n  title: Old\n  version: 1.0.0\nchannels: {}\n`),
    ).rejects.toThrow(/major version 3/);
  });

  it("should reject an empty document", async () => {
    await expect(expectValidAsyncAPI(null)).rejects.toThrow(/got nothing/);
  });
});
