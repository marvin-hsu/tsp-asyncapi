import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "../../src/testing/index.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { listServices } from "@typespec/compiler";
import { buildAsyncAPIDocument } from "../../src/builders/document.js";

describe("Unit: Message tags and externalDocs (Phase 3.6)", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  it("emits a full Tag Object for a tagged message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{
        description: "Everything about orders.",
        externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
      })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      {
        name: "orders",
        description: "Everything about orders.",
        externalDocs: {
          url: "https://example.com/orders",
          description: "The order guide.",
        },
      },
    ]);
  });

  it("emits a tag with only the fields the metadata declares", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders")
      @asyncTag("billing", #{ description: "Money moves." })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // A field the metadata leaves out is absent, rather than present and
    // empty.
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      { name: "orders" },
      { name: "billing", description: "Money moves." },
    ]);
  });

  it("keeps the tags of one message in source order", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("first")
      @asyncTag("second")
      @asyncTag("third")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // Decorators run bottom-up, so the recorded order is the reverse of what
    // the reader sees. The emitted array follows the source.
    expect(doc.components?.messages?.OrderCreated.tags?.map((tag) => tag.name)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("emits the external docs of a message", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @externalDocs("https://example.com/order-created", "How this message is used.")
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated.externalDocs).toEqual({
      url: "https://example.com/order-created",
      description: "How this message is used.",
    });
  });

  it("leaves out tags and externalDocs when the message declares neither", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const message = doc.components?.messages?.OrderCreated ?? {};
    expect(Object.keys(message)).toEqual(["name", "payload"]);
  });

  it("rejects the built-in @tag on a message model", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @tag("orders")
      model OrderCreated {
        id: string;
      }
    `);

    // The built-in @tag cannot target a Model, which is why @asyncTag
    // exists. The compiler rejects the application itself, so no tag of this
    // kind can ever reach a message.
    const diagnostic = diagnostics.find((d) => d.code === "decorator-wrong-target");
    expect(diagnostic?.severity).toBe("error");
  });

  it("merges a built-in @tag and an @asyncTag of the same name on one target", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      @tag("orders")
      @asyncTag("orders", #{ description: "Everything about orders." })
      namespace Test;
    `);

    const doc = buildAsyncAPIDocument(runner.program, listServices(runner.program)[0], {});

    // One name means one Tag Object. The built-in @tag carries a name and
    // nothing that could disagree, so the metadata wins without an error.
    expect(doc.info.tags).toEqual([{ name: "orders", description: "Everything about orders." }]);
  });

  it("keeps a built-in @tag that no @asyncTag names", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      @tag("orders")
      @asyncTag("billing", #{ description: "Money moves." })
      namespace Test;
    `);

    const doc = buildAsyncAPIDocument(runner.program, listServices(runner.program)[0], {});

    expect(doc.info.tags).toEqual([
      { name: "orders" },
      { name: "billing", description: "Money moves." },
    ]);
  });

  it("merges two @asyncTag of one name that set different fields", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ description: "Everything about orders." })
      @asyncTag("orders", #{ externalDocs: #{ url: "https://example.com/orders" } })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // Neither application says anything the other contradicts, so the two
    // merge into one Tag Object.
    expect(diagnostics.filter((d) => d.code === "tsp-asyncapi/conflicting-tag-metadata")).toEqual(
      [],
    );
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      {
        name: "orders",
        description: "Everything about orders.",
        externalDocs: { url: "https://example.com/orders" },
      },
    ]);
  });

  it("merges two @asyncTag of one name that repeat the same value", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ description: "Everything about orders." })
      @asyncTag("orders", #{ description: "Everything about orders." })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      { name: "orders", description: "Everything about orders." },
    ]);
  });

  it("reports an error when two @asyncTag of one name give different descriptions", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ description: "The first description." })
      @asyncTag("orders", #{ description: "The second description." })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/conflicting-tag-metadata",
    );
    expect(diagnostic?.severity).toBe("error");
    expect(String(diagnostic?.message)).toMatch(/Tag 'orders' is declared more than once/);
    expect(String(diagnostic?.message)).toMatch(/'description'/);
    // The first application in source order keeps the field.
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      { name: "orders", description: "The first description." },
    ]);
  });

  it("reports an error when two @asyncTag of one name give different external docs", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ externalDocs: #{ url: "https://example.com/one" } })
      @asyncTag("orders", #{ externalDocs: #{ url: "https://example.com/two" } })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/conflicting-tag-metadata",
    );
    expect(diagnostic?.severity).toBe("error");
    expect(String(diagnostic?.message)).toMatch(/'externalDocs'/);
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      { name: "orders", externalDocs: { url: "https://example.com/one" } },
    ]);
  });

  it("accepts one tag name with different metadata on two messages", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ description: "As the order service sees it." })
      model OrderCreated {
        id: string;
      }

      @message
      @asyncTag("orders", #{ description: "As the billing service sees it." })
      model OrderBilled {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // AsyncAPI gives every object its own `tags` array, and those arrays are
    // independent. So one name may describe itself differently per message.
    expect(diagnostics.filter((d) => d.code === "tsp-asyncapi/conflicting-tag-metadata")).toEqual(
      [],
    );
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      { name: "orders", description: "As the order service sees it." },
    ]);
    expect(doc.components?.messages?.OrderBilled.tags).toEqual([
      { name: "orders", description: "As the billing service sees it." },
    ]);
  });
  it("rejects an @asyncTag with an empty name", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("")
      @asyncTag("orders")
      model OrderCreated {
        id: string;
      }
    `);

    const reported = diagnostics.filter((d) => d.code === "tsp-asyncapi/empty-tag-name");
    expect(reported).toHaveLength(1);
    expect(reported[0]?.severity).toBe("error");

    // `name` is required on a Tag Object, and a blank one names nothing a
    // consumer can match. The rejected tag reaches no document, and the tag
    // beside it is unaffected.
    const doc = buildAsyncAPIDocument(runner.program, undefined, {});
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([{ name: "orders" }]);
  });

  it("emits one entry when the built-in @tag repeats a name", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      @tag("orders")
      @tag("orders")
      @tag("events")
      namespace Test;
    `);

    const doc = buildAsyncAPIDocument(runner.program, listServices(runner.program)[0], {});

    // AsyncAPI requires the names in one `tags` array to be unique. The
    // built-in tags keep the order the compiler records them in, and the
    // repeated name collapses to one entry.
    expect(doc.info.tags).toEqual([{ name: "events" }, { name: "orders" }]);
  });

  it("merges the fields of two externalDocs that name one url", async () => {
    const [, diagnostics] = await runner.compileAndDiagnose(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ externalDocs: #{ url: "https://example.com/orders" } })
      @asyncTag("orders", #{
        externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
      })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The two applications agree about the only field both of them set. A
    // field that only one of them sets is taken from that one, the same rule
    // the other tag fields follow.
    expect(diagnostics).toEqual([]);
    expect(
      runner.program.diagnostics.filter((d) => d.code === "tsp-asyncapi/conflicting-tag-metadata"),
    ).toHaveLength(0);
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      {
        name: "orders",
        externalDocs: { url: "https://example.com/orders", description: "The order guide." },
      },
    ]);
  });

  it("reports a conflict when two externalDocs descriptions disagree", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{
        externalDocs: #{ url: "https://example.com/orders", description: "The first guide." }
      })
      @asyncTag("orders", #{
        externalDocs: #{ url: "https://example.com/orders", description: "The second guide." }
      })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/conflicting-tag-metadata",
    );
    expect(diagnostic?.severity).toBe("error");
    expect(String(diagnostic?.message)).toMatch(/'externalDocs'/);
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      {
        name: "orders",
        externalDocs: { url: "https://example.com/orders", description: "The first guide." },
      },
    ]);
  });
  it("keeps a field only the later application sets while reporting a conflict", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{ description: "The first prose." })
      @asyncTag("orders", #{
        description: "The second prose.",
        externalDocs: #{ url: "https://example.com/orders" }
      })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // The two applications disagree about `description` only. The first one
    // in source order keeps that field. Nothing disagrees about
    // `externalDocs`, so the field only the second one sets is still taken
    // from it. The merge is field by field, so one conflict does not discard
    // a whole application.
    const diagnostic = runner.program.diagnostics.find(
      (d) => d.code === "tsp-asyncapi/conflicting-tag-metadata",
    );
    expect(diagnostic?.severity).toBe("error");
    expect(String(diagnostic?.message)).toMatch(/'description'/);
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      {
        name: "orders",
        description: "The first prose.",
        externalDocs: { url: "https://example.com/orders" },
      },
    ]);
  });

  it("leaves out a tag field the metadata sets to an empty string", async () => {
    await runner.compile(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      @asyncTag("orders", #{
        description: "",
        externalDocs: #{ url: "https://example.com/orders", description: "" }
      })
      model OrderCreated {
        id: string;
      }
    `);

    const doc = buildAsyncAPIDocument(runner.program, undefined, {});

    // A blank description says nothing. It claims the tag has an empty
    // description rather than none, so the emitter leaves the field out.
    expect(doc.components?.messages?.OrderCreated.tags).toEqual([
      { name: "orders", externalDocs: { url: "https://example.com/orders" } },
    ]);
  });
});
