import { describe, it, expect, vi } from "vitest";
import { lowerBindings } from "#emitter/lower/bindings.js";
import { lowerServers } from "#emitter/lower/servers.js";
import { surveyDocument } from "#emitter/lower/components/survey.js";
import type { AsyncAPIService, ServerNode } from "#core/resolve/service.js";
import { KAFKA_BINDING_VERSION } from "#core/constants.js";
import { RENDERERS } from "../../../utils/renderers.js";
import { stubServerNode } from "../../../utils/ir-stubs.js";
import { present } from "../../../utils/document.js";

describe("Unit: lowering the bindings of one object", () => {
  it("omits the section when there is no node", () => {
    // An empty Bindings Object states nothing, so the field is omitted.
    // The property test in `test/property-based/lower-transforms.test.ts`
    // covers the non-empty case: every key arrives, none are invented.
    expect(lowerBindings([])).toBeUndefined();
  });

  it("keeps the prototype of the built map untouched", () => {
    // `__proto__` and `constructor` are the only member names where plain
    // assignment does not add a member. `orders` is an ordinary name, added
    // to confirm normal members still work.
    const names = ["__proto__", "constructor", "orders"];

    const bindings = lowerBindings(
      names.map((protocol) => ({ protocol, renderer: "verbatim", config: { q: 1 } }) as const),
    ) as object;

    // A plain assignment of `__proto__` runs the inherited setter: the entry
    // is lost and the map's prototype is replaced.
    expect(Object.getPrototypeOf(bindings)).toBe(Object.prototype);
    for (const name of names) expect(Object.hasOwn(bindings, name)).toBe(true);
  });

  /**
   * One case per renderer, taken from the table itself, not sampled at
   * random.
   *
   * The version table is not asserted against; other unit files already pin
   * each protocol's version literal. This checks only the shape: `verbatim`
   * adds nothing, every other renderer appends exactly one field, and the
   * recorded config reaches the document unchanged.
   *
   * A protocol config never carries its own `bindingVersion`, since no
   * protocol decorator accepts one, so this test gives it none. The generic
   * `@binding` config takes plain JSON and does carry one, which is the case
   * where copying through and appending give different answers.
   */
  it.each(RENDERERS)(
    "appends the version last for %s, or passes plain JSON through",
    (renderer) => {
      const config =
        renderer === "verbatim" ? { ack: true, bindingVersion: "9.9.9" } : { ack: true };

      const lowered = lowerBindings([{ protocol: "p", renderer, config }]) as Record<
        string,
        object
      >;
      const member = lowered.p;
      const keys = Object.getOwnPropertyNames(member);

      if (renderer === "verbatim") {
        // The generic `@binding` holds plain JSON. A version this emitter
        // never checked the fields against would be a claim about them.
        expect(member).toEqual(config);
        expect(keys).toEqual(["ack", "bindingVersion"]);
        return;
      }

      // The specification lists the version last, and every example in the
      // AsyncAPI binding repository writes it there.
      expect(keys).toEqual(["ack", "bindingVersion"]);
      const version = (member as { bindingVersion: unknown }).bindingVersion;
      expect(typeof version).toBe("string");
      expect((member as Record<string, unknown>).ack).toBe(true);
    },
  );
});

describe("Unit: rendering the Bindings Object of one site", () => {
  /** A service whose only content is one server carrying one binding. */
  function serviceWith(server: ServerNode): AsyncAPIService {
    return {
      info: { title: "Test", version: "0.0.0", tags: [], extensions: {} },
      servers: [server],
      securitySchemes: [],
      messages: [],
      messageKeys: new Map(),
      channels: [],
      operations: [],
    };
  }

  it("renders one node list once for the survey and the site together", () => {
    const server = stubServerNode({
      name: "production",
      host: "broker.example.com",
      protocol: "kafka",
      security: [],
      tags: [],
      bindings: [{ protocol: "kafka", renderer: "kafka", config: { schemaRegistryUrl: "u" } }],
    });
    // Rendering walks the node list. Counting that walk counts the renders,
    // whatever the two stages do around it.
    const walked = vi.spyOn(server.bindings, "map");

    const promotions = surveyDocument(serviceWith(server), { claimDerived: () => true });
    const servers = present(lowerServers([server], promotions), "servers");

    expect(servers.production.bindings).toEqual({
      kafka: { schemaRegistryUrl: "u", bindingVersion: KAFKA_BINDING_VERSION },
    });
    // The survey asks what this site writes, and the site then writes it.
    // Both read one rendered object.
    expect(walked).toHaveBeenCalledTimes(1);
  });
});
