import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "../../../src/testing/index.js";
import { t, TesterInstance } from "@typespec/compiler/testing";
import { listServices } from "@typespec/compiler";
import { buildInfo } from "../../../src/builders/info.js";
import { buildTags } from "../../../src/builders/tags.js";
import { buildExternalDocs } from "../../../src/builders/external-docs.js";
import { buildAsyncAPIDocument } from "../../../src/builders/document.js";

describe("Unit: Builders (Phase 1)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  describe("buildInfo", () => {
    it("should extract title from @service and default version", async () => {
      const { program } = await runner.compile(t.code`
        @doc("Standard Doc Description")
        @tag("t1")
        @AsyncAPI.externalDocs("https://example.com")
        @service(#{ title: "My Service" })
        namespace ${t.namespace("TestService")} {}
      `);
      const services = listServices(program);
      const info = buildInfo(program, services[0]);

      expect(info.title).toBe("My Service");
      expect(info.version).toBe("0.0.0");
      expect(info.description).toBe("Standard Doc Description");
      expect(info.tags).toHaveLength(1);
      expect(info.externalDocs?.url).toBe("https://example.com");
    });

    it("should fall back to the default title when @service names none", async () => {
      // `@service` takes its options as an optional argument, so a service
      // can carry no title at all. `buildInfo` then reads `service.title`
      // as `undefined` and falls back to `DEFAULT_DOCUMENT_TITLE`. Every
      // other test names a title, so only this input reaches the fallback.
      const { program } = await runner.compile(t.code`
        @service
        namespace ${t.namespace("Orders")} {}
      `);
      const services = listServices(program);
      const info = buildInfo(program, services[0]);

      expect(info.title).toBe("AsyncAPI Document");
      expect(info.version).toBe("0.0.0");
    });

    it("should extract full info from @info decorator", async () => {
      await runner.compile(`
        @service(#{ title: "My Service" })
        @AsyncAPI.info(#{
          version: "1.2.3",
          description: "Desc",
          contact: #{ name: "Contact Name", email: "test@test.com", url: "https://test.com" },
          license: #{ name: "MIT", url: "https://mit.edu" }
        })
        namespace TestService {}
      `);
      const services = listServices(runner.program);
      const info = buildInfo(runner.program, services[0]);

      expect(info.title).toBe("My Service");
      expect(info.version).toBe("1.2.3");
      expect(info.description).toBe("Desc");
      expect(info.contact?.name).toBe("Contact Name");
      expect(info.contact?.email).toBe("test@test.com");
      expect(info.contact?.url).toBe("https://test.com");
      expect(info.license?.name).toBe("MIT");
      expect(info.license?.url).toBe("https://mit.edu");
    });
  });

  describe("buildTags", () => {
    it("should extract tags from target", async () => {
      const { TestTarget } = await runner.compile(t.code`
        @tag("t1") @tag("t2")
        namespace ${t.namespace("TestTarget")} {}
      `);
      const tags = buildTags(runner.program, TestTarget);
      expect(tags).toHaveLength(2);
      expect(tags).toContainEqual({ name: "t1" });
      expect(tags).toContainEqual({ name: "t2" });
    });

    it("should take the description from the later @asyncTag when the first states none", async () => {
      // The merge takes a field from whichever application states it, as
      // long as the other one says nothing about it. Here the first
      // application in source order carries no description and the second
      // one does. So the second contributes it, and nothing conflicts.
      // The existing merge tests all put the description on the first
      // application, which leaves this direction untested.
      const { TestTarget } = await runner.compile(t.code`
        @asyncTag("orders")
        @asyncTag("orders", #{ description: "Order events" })
        namespace ${t.namespace("TestTarget")} {}
      `);
      const tags = buildTags(runner.program, TestTarget);

      expect(tags).toEqual([{ name: "orders", description: "Order events" }]);
      expect(
        runner.program.diagnostics.filter(
          (d) => d.code === "tsp-asyncapi/conflicting-tag-metadata",
        ),
      ).toEqual([]);
    });

    it("should return undefined if no tags", async () => {
      const { TestTarget } = await runner.compile(t.code`
        namespace ${t.namespace("TestTarget")} {}
      `);
      const tags = buildTags(runner.program, TestTarget);
      expect(tags).toBeUndefined();
    });
  });

  describe("buildExternalDocs", () => {
    it("should extract external docs from target", async () => {
      const { TestTarget } = await runner.compile(t.code`
        @AsyncAPI.externalDocs("https://example.com", "Desc")
        namespace ${t.namespace("TestTarget")} {}
      `);
      const docs = buildExternalDocs(runner.program, TestTarget);
      expect(docs?.url).toBe("https://example.com");
      expect(docs?.description).toBe("Desc");
    });

    it("should return undefined if no external docs", async () => {
      const { TestTarget } = await runner.compile(t.code`
        namespace ${t.namespace("TestTarget")} {}
      `);
      const docs = buildExternalDocs(runner.program, TestTarget);
      expect(docs).toBeUndefined();
    });
  });

  describe("buildAsyncAPIDocument", () => {
    it("should generate root document correctly", async () => {
      await runner.compile(`
        @service(#{ title: "Root Doc" })
        namespace Root {}
      `);
      const services = listServices(runner.program);
      const doc = buildAsyncAPIDocument(runner.program, services[0], {
        "asyncapi-id": "urn:test",
        "default-content-type": "application/json",
      });

      expect(doc.asyncapi).toBe("3.1.0");
      expect(doc.id).toBe("urn:test");
      expect(doc.defaultContentType).toBe("application/json");
      expect(doc.info.title).toBe("Root Doc");
    });

    it("should generate fallback document when no service provided", async () => {
      await runner.compile(``);
      const doc = buildAsyncAPIDocument(runner.program, undefined, {});

      expect(doc.asyncapi).toBe("3.1.0");
      expect(doc.info.title).toBe("AsyncAPI Document");
      expect(doc.info.version).toBe("0.0.0");
    });
  });
});
