import { describe, expect, it } from "vitest";
import { emitDocument } from "../../../utils/test-host.js";
import { channelsOf, messagesOf, serversOf } from "../../../utils/document.js";
import { validateAsyncAPI } from "../../../utils/spec-validation.js";

/**
 * Where a Tag Object is written.
 *
 * A tag carries the name its author wrote, so one use is enough to earn a
 * component. The key is the author's own word, not the site that happened
 * to meet it first, even though a tag is a fragment rather than a
 * declaration.
 *
 * How two applications of `@asyncTag` merge, and which fields survive, is
 * pinned in `messages/tags.test.ts` through `resolveTags`. This suite does
 * not restate that rule.
 */
describe("Unit: promoting tags into components", () => {
  it("writes one component and a reference from every site", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @asyncTag("edge", #{ description: "At the boundary." })
      @server("production", #{ host: "a.example.com", protocol: "kafka" })
      namespace Test;

      @message
      @asyncTag("edge", #{ description: "At the boundary." })
      model Placed {
        id: string;
      }

      @channel("orders")
      @asyncTag("edge", #{ description: "At the boundary." })
      interface OrderChannel {
        @send
        op place(event: Placed): void;
      }
    `);

    expect(doc.components?.tags).toStrictEqual({
      edge: { name: "edge", description: "At the boundary." },
    });
    const reference = [{ $ref: "#/components/tags/edge" }];
    expect(doc.info.tags).toStrictEqual(reference);
    expect(serversOf(doc).production.tags).toStrictEqual(reference);
    expect(channelsOf(doc).orders.tags).toStrictEqual(reference);
    expect(messagesOf(doc).Placed.tags).toStrictEqual(reference);
    expect(await validateAsyncAPI(doc)).toBeNull();
  });

  /** One use is enough, because the author wrote the name. */
  it("promotes a tag only one site carries", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @asyncTag("edge")
      namespace Test;
    `);

    expect(doc.components?.tags).toStrictEqual({ edge: { name: "edge" } });
    expect(doc.info.tags).toStrictEqual([{ $ref: "#/components/tags/edge" }]);
  });

  /**
   * Two Tag Objects can share a name and differ in everything else. They are
   * two fragments asking for one key, and picking a winner would silently
   * give one site the other site's text.
   */
  it("leaves both in place when two tags of one name disagree", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @asyncTag("edge", #{ description: "At the boundary." })
      namespace Test;

      @message
      @asyncTag("edge")
      model Placed {
        id: string;
      }

      @channel("orders")
      interface OrderChannel {
        @send
        op place(event: Placed): void;
      }
    `);

    expect(doc.components?.tags).toBeUndefined();
    expect(doc.info.tags).toStrictEqual([{ name: "edge", description: "At the boundary." }]);
    expect(messagesOf(doc).Placed.tags).toStrictEqual([{ name: "edge" }]);
    expect(await validateAsyncAPI(doc)).toBeNull();
  });

  /**
   * A key has to match the character set every `components` map states, and
   * a tag name is free text. The encoding is `sanitizeDeclarationName`, the
   * same one `components.schemas` uses, so two names that differ never
   * collapse onto one key.
   */
  it("cleans a tag name that is not a legal component key", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @asyncTag("orders/v1 beta")
      namespace Test;
    `);

    expect(Object.keys(doc.components?.tags ?? {})).toStrictEqual(["OrdersSep47V1Sep32Beta"]);
    expect(doc.info.tags).toStrictEqual([{ $ref: "#/components/tags/OrdersSep47V1Sep32Beta" }]);
    expect(await validateAsyncAPI(doc)).toBeNull();
  });
});
