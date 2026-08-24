import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { channelsOf, resolveExternalDocs, resolveTags } from "../../utils/document.js";

/**
 * A promoted fragment still says what its site said.
 *
 * The suites beside this one ask whether a `$ref` resolves. That is the
 * weaker half. A key claimed by two fragments resolves too, and points the
 * site at the wrong one — which is the shape of the defect this phase
 * actually shipped and then fixed.
 *
 * So the claim here is fidelity, not resolvability: after every reference is
 * followed, each site carries the fragment the source gave it. The generator
 * draws from a small pool, so two sites carrying one fragment is common and
 * two carrying different ones is common in the same document.
 *
 * Two kinds are covered together, because they follow the two different
 * promotion rules and share one survey. A tag carries the name its author
 * wrote, so it is promoted on the first use. An External Documentation
 * Object carries no name, so it waits for the second.
 */

/** The pools. Small, so a repeat inside one document is likely. */
const TAGS = ["alpha", "beta", "gamma"];
const DOCS = ["https://example.com/a", "https://example.com/b", "https://example.com/c"];

/** One channel: which tag it carries, and which link. */
interface Site {
  tag: string;
  docs: string;
}

const sites = fc.array(
  fc.record({ tag: fc.constantFrom(...TAGS), docs: fc.constantFrom(...DOCS) }),
  { minLength: 1, maxLength: 4 },
);

/** Builds one program: a message, and one channel per site. */
function sourceOf(drawn: readonly Site[]): string {
  const channels = drawn
    .map(
      (site, index) => `
      @channel("orders.${String(index)}")
      @asyncTag("${site.tag}")
      @externalDocs("${site.docs}")
      interface Channel${String(index)} {
        @send
        op send${String(index)}(event: Placed): void;
      }`,
    )
    .join("\n");
  return `
    @service(#{ title: "Orders" })
    namespace Test;

    @message
    model Placed {
      id: string;
    }
    ${channels}
  `;
}

describe("Property: a promoted fragment still says what its site said", () => {
  it("gives every channel back the tag and the link its source wrote", async () => {
    let withSharedTag = 0;
    let withSharedDocs = 0;
    let withLoneDocs = 0;

    await fc.assert(
      fc.asyncProperty(sites, async (drawn) => {
        const { doc, diagnostics } = await emitDocumentWithDiagnostics(sourceOf(drawn));
        // An error here means the generator built illegal TypeSpec. Fail
        // loudly rather than skipping, so the property cannot starve.
        expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);

        const usedTags = new Map<string, number>();
        const usedDocs = new Map<string, number>();
        for (const site of drawn) {
          usedTags.set(site.tag, (usedTags.get(site.tag) ?? 0) + 1);
          usedDocs.set(site.docs, (usedDocs.get(site.docs) ?? 0) + 1);
        }
        if ([...usedTags.values()].some((uses) => uses > 1)) withSharedTag++;
        if ([...usedDocs.values()].some((uses) => uses > 1)) withSharedDocs++;
        if ([...usedDocs.values()].some((uses) => uses === 1)) withLoneDocs++;

        drawn.forEach((site, index) => {
          const channel = channelsOf(doc)[`orders.${String(index)}`];
          expect(resolveTags(doc, channel.tags)).toEqual([{ name: site.tag }]);
          expect(resolveExternalDocs(doc, channel.externalDocs)).toEqual({ url: site.docs });
        });

        // A tag is named, so every distinct one earns a component and no
        // second component says the same thing.
        expect(Object.keys(doc?.components?.tags ?? {}).sort((a, b) => a.localeCompare(b))).toEqual(
          [...usedTags.keys()].sort((a, b) => a.localeCompare(b)),
        );

        // A link is not named, so exactly the repeated ones earn a component.
        const shared = [...usedDocs.entries()].filter(([, uses]) => uses > 1);
        expect(Object.keys(doc?.components?.externalDocs ?? {})).toHaveLength(shared.length);
      }),
      { numRuns: 60, seed: 20260824 },
    );

    // Each half of both rules has to be reached, or the property passes by
    // never meeting the case it is about.
    expect(withSharedTag).toBeGreaterThan(0);
    expect(withSharedDocs).toBeGreaterThan(0);
    expect(withLoneDocs).toBeGreaterThan(0);
  });
});
