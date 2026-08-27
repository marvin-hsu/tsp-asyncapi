import { describe, it, expect, vi } from "vitest";
import { lowerBindings } from "#emitter/lower/bindings.js";
import { lowerServers } from "#emitter/lower/servers.js";
import { surveyDocument } from "#emitter/lower/components/survey.js";
import type { AsyncAPIService, ServerNode } from "#core/resolve/service.js";
import { KAFKA_BINDING_VERSION } from "#core/constants.js";
import { RENDERERS } from "../../../utils/renderers.js";
import { present } from "../../../utils/document.js";

describe("Unit: lowering the bindings of one object", () => {
  it("omits the section when there is no node", () => {
    // An empty Bindings Object states nothing, so the field is omitted. "No
    // node" is a single point, so it is stated rather than drawn; the
    // non-empty half — every key arrives, none invented — is the keying
    // property in `test/property-based/lower-transforms.test.ts`.
    expect(lowerBindings([])).toBeUndefined();
  });

  it("keeps the prototype of the built map untouched", () => {
    // `__proto__` and `constructor` are the two member names whose plain
    // assignment does something other than adding a member. They are the
    // whole input space of this claim, plus one ordinary name to show the
    // map still carries normal members.
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
   * One case per renderer, enumerated from the table itself. A property once
   * drew renderers at random and then asserted it had seen every one — which
   * is a `for` loop written as sampling plus a counter.
   *
   * The version table itself is not asserted against. Thirteen unit files
   * already pin their protocol's version literal, and a test comparing the
   * output with the same table the code reads would assert that a lookup
   * equals itself. What is stated here is the shape of the rendering:
   * `verbatim` adds nothing, every other renderer appends exactly one field,
   * and the recorded config reaches the document unchanged.
   *
   * The config is fixed per shape, and deliberately so. A protocol config
   * never carries a `bindingVersion` of its own, because no protocol
   * decorator accepts one, so giving it one here would test an input resolve
   * cannot produce. The generic `@binding` takes plain JSON, so its config
   * carries one on purpose: that is the case where copying through and
   * appending give different answers. Field copying over open configs stays
   * a property, the verbatim one in
   * `test/property-based/lower-transforms.test.ts`.
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
    const server: ServerNode = {
      target: { kind: "Namespace", name: "Stub" } as unknown as ServerNode["target"],
      name: "production",
      host: "broker.example.com",
      protocol: "kafka",
      security: [],
      tags: [],
      bindings: [{ protocol: "kafka", renderer: "kafka", config: { schemaRegistryUrl: "u" } }],
    };
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
