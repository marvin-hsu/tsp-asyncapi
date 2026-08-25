/**
 * The identity the Protobuf provider gives each artifact.
 *
 * The identity never reaches the document, so no case that reads the emitted
 * file can see it. It tells two artifacts apart, and a diagnostic uses it to
 * say which tool claimed a model. Two messages of one program can carry one
 * name and differ by package, so the package belongs in the identity whenever
 * the package declares one.
 */

import { describe, expect, it } from "vitest";
import type { Model } from "@typespec/compiler";
import type { ExternalSchemaArtifact } from "tsp-asyncapi-core";
import { createProtobufProvider } from "#emitter/schema-artifacts/protobuf.js";
import { compileWithProtobuf } from "../../../../utils/protobuf-parity.js";

/**
 * One message in a package that declares a name, and one in a package that
 * declares none. Both models carry `@AsyncAPI.message`, so the document asks
 * for a payload for each of them.
 */
const SOURCE = `
  @Protobuf.package({ name: "com.example.orders" })
  namespace Orders {
    @message
    @Protobuf.message
    model OrderPlaced {
      @Protobuf.field(1) orderId: string;
    }
  }

  @Protobuf.package
  namespace Loose {
    @message
    @Protobuf.message
    model Ping {
      @Protobuf.field(1) at: string;
    }
  }
`;

/**
 * Runs the provider over one source and reads the identity of each artifact.
 *
 * @param source - The TypeSpec source of the case
 * @returns The identity of every artifact, by the name of its model
 */
async function identitiesOf(source: string): Promise<Map<string, string>> {
  const program = await compileWithProtobuf(source);
  const collected = await createProtobufProvider().collect(program);

  expect(collected.refused).toBe(false);
  const found = new Map<string, string>();
  const payloads: ReadonlyMap<Model, ExternalSchemaArtifact> = collected.artifacts.payloadFor;
  for (const [model, artifact] of payloads) found.set(model.name, artifact.identity);
  return found;
}

describe("Unit: the identity of a Protobuf artifact", () => {
  it("qualifies a message with the name its package declares", async () => {
    const identities = await identitiesOf(SOURCE);

    expect(identities.get("OrderPlaced")).toBe("com.example.orders.OrderPlaced");
  });

  it("names a message alone when its package declares no name", async () => {
    const identities = await identitiesOf(SOURCE);

    expect(identities.get("Ping")).toBe("Ping");
  });
});
