import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import {
  getAsyncTags,
  getCorrelationId,
  getExternalDocs,
  getInfo,
  getJsonSchemaExtensions,
  getMessageExamples,
} from "#core/decorators/index.js";

/**
 * Every public reader hands out a copy. The recorded state is what the
 * emitter writes, so a reader that hands out the stored object lets a caller
 * change the emitted document by changing what it was given.
 */
describe("Unit: readers hand out copies", () => {
  it("keeps the recorded info safe from a change to the returned state", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @info(#{ version: "1.0.0", contact: #{ name: "Support" }, license: #{ name: "MIT" } })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    const first = getInfo(runner.program, Test);
    if (first?.contact === undefined || first.license === undefined) {
      throw new Error("The fixture must record a contact and a license.");
    }
    first.version = "9.9.9";
    first.contact.name = "changed";
    first.license.name = "changed";

    const second = getInfo(runner.program, Test);
    expect(second?.version).toBe("1.0.0");
    expect(second?.contact?.name).toBe("Support");
    expect(second?.license?.name).toBe("MIT");
  });

  it("keeps the recorded external docs safe from a change to the returned state", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @externalDocs("https://example.com/docs", "Docs")
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    const first = getExternalDocs(runner.program, Test);
    if (first === undefined) throw new Error("The fixture must record external docs.");
    first.url = "https://changed.example.com";

    expect(getExternalDocs(runner.program, Test)?.url).toBe("https://example.com/docs");
  });

  it("keeps the recorded tags, examples, correlation id and extensions safe", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ OrderCreated }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ description: "Order events." })
      @correlationId("$message.header#/correlationId")
      @messageExample(#{ payload: #{ id: "1" } }, #{ name: "first" })
      @jsonSchemaExtension("unevaluatedProperties", false)
      model ${t.model("OrderCreated")} {
        id: string;
      }
    `);

    expectDiagnosticEmpty(diagnostics);
    const tags = getAsyncTags(runner.program, OrderCreated);
    const examples = getMessageExamples(runner.program, OrderCreated);
    const extensions = getJsonSchemaExtensions(runner.program, OrderCreated);
    const correlationId = getCorrelationId(runner.program, OrderCreated);
    if (correlationId === undefined) throw new Error("The fixture must record a correlation id.");

    tags[0].name = "changed";
    examples[0].name = "changed";
    extensions[0].key = "changed";
    correlationId.location = "$message.payload#/changed";

    expect(getAsyncTags(runner.program, OrderCreated)[0].name).toBe("orders");
    expect(getMessageExamples(runner.program, OrderCreated)[0].name).toBe("first");
    expect(getJsonSchemaExtensions(runner.program, OrderCreated)[0].key).toBe(
      "unevaluatedProperties",
    );
    expect(getCorrelationId(runner.program, OrderCreated)?.location).toBe(
      "$message.header#/correlationId",
    );
  });
});
