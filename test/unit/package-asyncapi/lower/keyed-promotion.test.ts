import { describe, expect, it } from "vitest";
import { emitDocument } from "../../../utils/test-host.js";
import { channelsOf, serversOf } from "../../../utils/document.js";
import { validateAsyncAPI } from "../../../utils/spec-validation.js";

/**
 * Where a Parameter Object and a Server Variable Object are written.
 *
 * Neither object carries its own name. The author writes it as the key of
 * the map it sits in, so the key is the name, and one use is enough to earn
 * a component. The key also joins the identity: two parameters with the
 * same shape but different names stay two separate fragments. A document
 * with both `{tenant}` and `{region}` as `{}` writes two components,
 * never one pointing at the other.
 */
describe("Unit: promoting parameters and server variables", () => {
  it("shares one parameter between the channels that address it", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Placed {
        id: string;
      }

      @channel("orders.{region}.placed")
      interface OrderChannel {
        @send
        op place(@doc("The region.") region: string, event: Placed): void;
      }

      @channel("orders.{region}.audited")
      interface AuditChannel {
        @send
        op audit(@doc("The region.") region: string, event: Placed): void;
      }
    `);

    expect(doc.components?.parameters).toStrictEqual({
      region: { description: "The region." },
    });
    const reference = { region: { $ref: "#/components/parameters/region" } };
    expect(channelsOf(doc)["orders.{region}.placed"].parameters).toStrictEqual(reference);
    expect(channelsOf(doc)["orders.{region}.audited"].parameters).toStrictEqual(reference);
    expect(await validateAsyncAPI(doc)).toBeNull();
  });

  /**
   * A parameter with nothing to say is `{}` whatever it is called, so
   * structure alone cannot tell two of them apart. Without the name in the
   * identity, `{tenant}` would point at a component named `region`.
   */
  it("keeps two empty parameters of different names apart", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Placed {
        id: string;
      }

      @channel("orders.{region}.{tenant}.placed")
      interface OrderChannel {
        @send
        op place(region: string, tenant: string, event: Placed): void;
      }
    `);

    expect(doc.components?.parameters).toStrictEqual({ region: {}, tenant: {} });
    expect(channelsOf(doc)["orders.{region}.{tenant}.placed"].parameters).toStrictEqual({
      region: { $ref: "#/components/parameters/region" },
      tenant: { $ref: "#/components/parameters/tenant" },
    });
    expect(await validateAsyncAPI(doc)).toBeNull();
  });

  /**
   * Two parameters of one name that disagree are two fragments asking for
   * one key, and neither is shared.
   */
  it("leaves both in place when two parameters of one name disagree", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      namespace Test;

      @message
      model Placed {
        id: string;
      }

      @channel("orders.{region}.placed")
      interface OrderChannel {
        @send
        op place(@doc("The region.") region: string, event: Placed): void;
      }

      @channel("orders.{region}.audited")
      interface AuditChannel {
        @send
        op audit(@doc("Where the audit ran.") region: string, event: Placed): void;
      }
    `);

    expect(doc.components?.parameters).toBeUndefined();
    expect(channelsOf(doc)["orders.{region}.placed"].parameters).toStrictEqual({
      region: { description: "The region." },
    });
  });

  it("shares one server variable between two servers", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{tenant}.kafka.example.com",
        protocol: "kafka",
        variables: #{ tenant: #{ default: "acme" } },
      })
      @server("sit", #{
        host: "{tenant}.kafka.sit.example.com",
        protocol: "kafka",
        variables: #{ tenant: #{ default: "acme" } },
      })
      namespace Test;
    `);

    expect(doc.components?.serverVariables).toStrictEqual({ tenant: { default: "acme" } });
    const reference = { tenant: { $ref: "#/components/serverVariables/tenant" } };
    expect(serversOf(doc).production.variables).toStrictEqual(reference);
    expect(serversOf(doc).sit.variables).toStrictEqual(reference);
    expect(await validateAsyncAPI(doc)).toBeNull();
  });
});
