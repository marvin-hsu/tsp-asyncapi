import { describe, it, expect, beforeEach } from "vitest";
import { AsyncAPITester } from "#emitter/testing.js";
import { TesterInstance } from "@typespec/compiler/testing";
import { documentFrom } from "../../../../utils/test-host.js";

describe("Unit: Messages — source order", () => {
  let runner: TesterInstance;

  beforeEach(async () => {
    runner = await AsyncAPITester.createInstance();
  });

  /**
   * `components.messages` follows the source, not the order the compiler
   * happened to check each model in.
   */
  async function messageKeys(code: string): Promise<string[]> {
    await runner.compile(code);
    const doc = documentFrom(runner.program);
    return Object.keys(doc.components?.messages ?? {});
  }

  it("keeps declaration order when no message refers to another", async () => {
    expect(
      await messageKeys(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message model Alpha { x: string; }
        @message model Beta { x: string; }
        @message model Gamma { x: string; }
      `),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("keeps declaration order when a message refers to one declared later", async () => {
    // The compiler checks `Gamma` while checking `Alpha`'s property, so
    // `@message` runs on `Gamma` first. Reading the state map in its own
    // order would emit `Gamma, Alpha, Beta` here, and adding this one
    // reference would reorder the whole of `components.messages`.
    expect(
      await messageKeys(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message model Alpha { g: Gamma; }
        @message model Beta { x: string; }
        @message model Gamma { x: string; }
      `),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("puts a message the service namespace declares later after an earlier one", async () => {
    // A chain of references, so every model is checked before the one that
    // names it. Only a sort by source position recovers the written order.
    expect(
      await messageKeys(`
        @service(#{ title: "Orders" })
        namespace Test;

        @message model First { s: Second; }
        @message model Second { t: Third; }
        @message model Third { x: string; }
      `),
    ).toEqual(["First", "Second", "Third"]);
  });
});
