import { describe, it, expect } from "vitest";
import { diagnosticsWith, findDiagnostic } from "../../../utils/diagnostics.js";
import { emitDocumentWithDiagnostics } from "../../../utils/test-host.js";

/**
 * The name `@useServer` takes becomes the key half of a Reference Object, so
 * it has to be a legal key and it has to name a server the document holds.
 * Neither was checked, and a blank name reached the document as
 * `#/servers/`.
 */
describe("Unit: @useServer name checks", () => {
  const source = (useServer: string) => `
      @service(#{ title: "Orders" })
      @server("primary", #{ host: "kafka.example.com:9092", protocol: "kafka" })
      namespace Test;

      @message
      model OrderCreated {
        id: string;
      }

      @channel("orders.created")
      ${useServer}
      interface OrderChannel {
        publish(event: OrderCreated): void;
      }
    `;

  it("drops a blank name and reports it", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(source(`@useServer("")`));

    expect(findDiagnostic(diagnostics, "invalid-use-server-name").message).toContain("''");
  });

  it("drops a name the author padded with spaces and reports it", async () => {
    // `@server` tests the key it declares as written, so a padded name is
    // rejected there too. Both halves of one name follow the same rule, and
    // the author writes the name the same way on each side.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(
      source(`@useServer("  primary  ")`),
    );

    expect(findDiagnostic(diagnostics, "invalid-use-server-name").message).toContain(
      "'  primary  '",
    );
    expect(doc?.channels?.["orders.created"].servers).toBeUndefined();
  });

  it("drops a name outside the server name charset and reports it", async () => {
    const { diagnostics } = await emitDocumentWithDiagnostics(source(`@useServer("kafka prod")`));

    expect(findDiagnostic(diagnostics, "invalid-use-server-name").message).toContain(
      "'kafka prod'",
    );
  });

  it("drops a name that no @server declares and reports it", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(source(`@useServer("nope")`));

    expect(findDiagnostic(diagnostics, "undeclared-used-server").message).toContain("'nope'");
    expect(doc?.channels?.["orders.created"].servers).toBeUndefined();
  });

  it("keeps a declared name beside an undeclared one", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(
      source(`@useServer("nope")
      @useServer("primary")`),
    );

    expect(diagnosticsWith(diagnostics, "undeclared-used-server")).toHaveLength(1);
    expect(doc?.channels?.["orders.created"].servers).toEqual([{ $ref: "#/servers/primary" }]);
  });
});
