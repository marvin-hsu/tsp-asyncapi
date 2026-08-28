import { describe, expect, it } from "vitest";
import { expectNoErrors } from "../../utils/diagnostics.js";
import fc from "fast-check";
import { emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import {
  channelsOf,
  resolveExternalDocs,
  resolveParameters,
  resolveTags,
} from "../../utils/document.js";

/**
 * A promoted fragment still says what its site said.
 *
 * The suites beside this one ask whether a `$ref` resolves. That is the
 * weaker half. A key claimed by two fragments resolves too, and can point
 * the site at the wrong fragment.
 *
 * So the claim here is fidelity, not resolvability: after every reference is
 * followed, each site carries the fragment the source gave it. The generator
 * draws from a small pool, so two sites carrying one fragment is common and
 * two carrying different ones is common in the same document.
 *
 * Three kinds are covered together, because they follow all three promotion
 * rules and share one survey.
 *
 * A tag carries the name its author wrote, so it is promoted on the first
 * use. An External Documentation Object carries no name, so it waits for the
 * second. A channel parameter is the third case: its name is the key of the
 * map it sits in rather than a member of the fragment, so the name joins the
 * identity. A parameter with no description is `{}` whatever it is called,
 * and without the name in the identity a `{tenant}` would resolve to the
 * description someone wrote for a `{region}`. The generator draws blank
 * descriptions on purpose, so that case is common.
 */

/** The pools. Small, so a repeat inside one document is likely. */
const TAGS = ["alpha", "beta", "gamma"];
const DOCS = ["https://example.com/a", "https://example.com/b", "https://example.com/c"];
const PARAM_NAMES = ["region", "tenant"];
/** A blank description makes the `{}` parameter that only its name tells apart. */
const PARAM_DOCS = ["", "One", "Two"];

/** One channel: which tag it carries, which link, and which parameter. */
interface Site {
  tag: string;
  docs: string;
  param: string;
  paramDocs: string;
}

const sites = fc.array(
  fc.record({
    tag: fc.constantFrom(...TAGS),
    docs: fc.constantFrom(...DOCS),
    param: fc.constantFrom(...PARAM_NAMES),
    paramDocs: fc.constantFrom(...PARAM_DOCS),
  }),
  { minLength: 1, maxLength: 4 },
);

/** The Parameter Object one site's draw produces. */
function parameterOf(site: Site): Record<string, string> {
  return site.paramDocs === "" ? {} : { description: site.paramDocs };
}

/** Builds one program: a message, and one channel per site. */
function sourceOf(drawn: readonly Site[]): string {
  const channels = drawn
    .map((site, index) => {
      const doc = site.paramDocs === "" ? "" : `@doc("${site.paramDocs}")`;
      return `
      @channel("orders.${String(index)}.{${site.param}}")
      @asyncTag("${site.tag}")
      @externalDocs("${site.docs}")
      interface Channel${String(index)} {
        @send
        op send${String(index)}(${doc} ${site.param}: string, event: Placed): void;
      }`;
    })
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
  it("gives every channel back the tag, the link and the parameter its source wrote", async () => {
    let withSharedTag = 0;
    let withSharedDocs = 0;
    let withLoneDocs = 0;
    let contested = 0;

    await fc.assert(
      fc.asyncProperty(sites, async (drawn) => {
        const { doc, diagnostics } = await emitDocumentWithDiagnostics(sourceOf(drawn));
        // An error here means the generator built illegal TypeSpec. Fail
        // loudly rather than skipping, so the property cannot starve.
        expectNoErrors(diagnostics);

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
          const channel = channelsOf(doc)[`orders.${String(index)}.{${site.param}}`];
          expect(resolveTags(doc, channel.tags)).toEqual([{ name: site.tag }]);
          expect(resolveExternalDocs(doc, channel.externalDocs)).toEqual({ url: site.docs });
          expect(resolveParameters(doc, channel.parameters)).toEqual({
            [site.param]: parameterOf(site),
          });
        });

        // A tag is named, so every distinct one earns a component and no
        // second component says the same thing.
        expect(Object.keys(doc?.components?.tags ?? {}).sort((a, b) => a.localeCompare(b))).toEqual(
          [...usedTags.keys()].sort((a, b) => a.localeCompare(b)),
        );

        // A link is not named, so exactly the repeated ones earn a component.
        const shared = [...usedDocs.entries()].filter(([, uses]) => uses > 1);
        expect(Object.keys(doc?.components?.externalDocs ?? {})).toHaveLength(shared.length);

        // A parameter is named by its map key, so one use is enough. Two
        // parameters of one name that disagree are two fragments asking for
        // one key, and then neither is shared.
        const byName = new Map<string, Set<string>>();
        for (const site of drawn) {
          const seen = byName.get(site.param) ?? new Set<string>();
          seen.add(JSON.stringify(parameterOf(site)));
          byName.set(site.param, seen);
          if (seen.size > 1) contested++;
        }
        const agreed = [...byName.entries()]
          .filter(([, values]) => values.size === 1)
          .map(([name]) => name);
        expect(
          Object.keys(doc?.components?.parameters ?? {}).sort((a, b) => a.localeCompare(b)),
        ).toEqual([...agreed].sort((a, b) => a.localeCompare(b)));
      }),
      { numRuns: 60, seed: 20260824 },
    );

    // Each half of both rules has to be reached, or the property passes by
    // never meeting the case it is about.
    expect(withSharedTag).toBeGreaterThan(0);
    expect(withSharedDocs).toBeGreaterThan(0);
    expect(withLoneDocs).toBeGreaterThan(0);
    expect(contested).toBeGreaterThan(0);
  });
});
