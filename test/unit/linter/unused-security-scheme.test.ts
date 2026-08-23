import { describe, it } from "vitest";
import { unusedSecuritySchemeRule } from "#core/linter/unused-security-scheme.rule.js";
import { createRuleTester } from "../../utils/linter.js";

/**
 * Unit tests of `tsp-asyncapi/unused-security-scheme`.
 *
 * The emitter writes every declared scheme into
 * `components.securitySchemes` whether or not anything names it, so a
 * forgotten `@useSecurity` produces a document that advertises an
 * authentication method nothing requires.
 */
describe("Unit: the unused-security-scheme rule", () => {
  it("stays quiet when a namespace names the scheme", async () => {
    const tester = await createRuleTester(unusedSecuritySchemeRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @securityScheme("kafka-scram", #{ type: "scramSha512" })
        @useSecurity("kafka-scram")
        @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        namespace Test;
      `,
      )
      .toBeValid();
  });

  /** The mistake: the scheme is declared and nothing asks for it. */
  it("reports a scheme no @useSecurity names", async () => {
    const tester = await createRuleTester(unusedSecuritySchemeRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @securityScheme("kafka-scram", #{ type: "scramSha512" })
        @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        namespace Test;
      `,
      )
      .toEmitDiagnostics({ code: "tsp-asyncapi/unused-security-scheme" });
  });

  /**
   * `@useSecurity` also applies to an operation, and the walk has to see
   * that target too. Reading only namespaces would report this scheme.
   */
  it("stays quiet when an operation names the scheme", async () => {
    const tester = await createRuleTester(unusedSecuritySchemeRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @securityScheme("op-scheme", #{ type: "userPassword" })
        @server("prod", #{ host: "broker.example.com", protocol: "kafka" })
        namespace Test;

        @message
        model OrderCreated {
          id: string;
        }

        @channel("orders.created")
        interface OrderChannel {
          @send
          @useSecurity("op-scheme")
          op publish(event: OrderCreated): void;
        }
      `,
      )
      .toBeValid();
  });

  /**
   * A scheme declared in one namespace and used from another is the case
   * the whole-program walk exists for. `components.securitySchemes` is one
   * registry for the document, so where the scheme sits does not matter.
   */
  it("stays quiet when the use is in a different namespace", async () => {
    const tester = await createRuleTester(unusedSecuritySchemeRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        namespace Test;

        @securityScheme("kafka-scram", #{ type: "scramSha512" })
        namespace Test.Declarations {}

        @useSecurity("kafka-scram")
        @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        namespace Test.Runtime {}
      `,
      )
      .toBeValid();
  });

  /** Two unused schemes are two warnings, one on each declaration. */
  it("reports each unused scheme separately", async () => {
    const tester = await createRuleTester(unusedSecuritySchemeRule);
    await tester
      .expect(
        `
        @service(#{ title: "Orders" })
        @securityScheme("kafka-scram", #{ type: "scramSha512" })
        @securityScheme("plain", #{ type: "plain" })
        @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
        namespace Test;
      `,
      )
      .toEmitDiagnostics([
        { code: "tsp-asyncapi/unused-security-scheme" },
        { code: "tsp-asyncapi/unused-security-scheme" },
      ]);
  });
});
