/**
 * The committed Protobuf example, read as a consumer reads it.
 *
 * `examples/16-protobuf-payloads` is compiled by two emitters over one
 * source. The official one writes the `.proto` files. This one writes the
 * AsyncAPI document, and every payload in it is proto3 text this emitter
 * rendered from the same decorator state.
 *
 * So the example is a parity case that no test host produced. The files below
 * are the committed output of a real compile, and the two sides have to
 * describe one wire format. A drift between this emitter's mapping and the
 * official one shows up here as a descriptor that differs.
 *
 * The document is also parsed. The validation helper registers the official
 * AsyncAPI Protobuf schema parser, so a payload that is not proto3 a reader
 * can root is an error and not a string nobody looked at.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { descriptorOf } from "../utils/protobuf-parity.js";

/** The example directory, as a URL the reads below resolve against. */
const EXAMPLE = new URL("../../examples/16-protobuf-payloads/", import.meta.url);

/** The document the AsyncAPI emitter wrote. */
const DOCUMENT = parseYaml(readFileSync(new URL("asyncapi.yaml", EXAMPLE), "utf8")) as ExampleDoc;

/** The AsyncAPI schema format of proto3 text. */
const PROTOBUF = "application/vnd.google.protobuf;version=3";

/** Each package of the example, and the file the official emitter wrote for it. */
const PACKAGES = [
  ["com.example.orders", "proto/com/example/orders.proto"],
  ["com.example.billing", "proto/com/example/billing.proto"],
] as const;

/** The two guide pages that quote the output of the example. */
const GUIDES = [
  "docs/guide/protobuf-payloads.md",
  "docs/zh-tw/guide/protobuf-payloads.md",
] as const;

/** As much of the document as this suite reads. */
interface ExampleDoc {
  components?: {
    messages?: Record<string, { payload?: { schemaFormat?: string; schema?: string } }>;
  };
}

/** One node of a descriptor tree, which holds either children or a definition. */
interface DescriptorNode {
  nested?: Record<string, DescriptorNode>;
}

/**
 * Flattens a descriptor tree into one definition per qualified name.
 *
 * A payload and a `.proto` file nest their declarations under the package,
 * and comparing the trees whole would compare the packages too. Flattening
 * gives one entry per declaration, so the declarations of two texts can be
 * compared even when one text holds fewer of them.
 *
 * @param text - The proto3 text to read
 * @returns Each declaration of that text, by its qualified name
 */
function declarationsOf(text: string): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const walk = (node: DescriptorNode, path: string): void => {
    if (node.nested === undefined) {
      found.set(path, node);
      return;
    }
    for (const [name, child] of Object.entries(node.nested)) {
      walk(child, path === "" ? name : `${path}.${name}`);
    }
  };
  walk(descriptorOf(text) as DescriptorNode, "");
  return found;
}

/**
 * Every payload the document carries for one Protobuf package.
 *
 * @param packageName - The package declaration to match
 * @returns The proto3 text of each payload of that package
 */
function payloadsOf(packageName: string): string[] {
  const messages = Object.values(DOCUMENT.components?.messages ?? {});
  const texts: string[] = [];
  for (const message of messages) {
    const payload = message.payload;
    if (payload?.schemaFormat !== PROTOBUF || payload.schema === undefined) continue;
    if (payload.schema.includes(`package ${packageName};`)) texts.push(payload.schema);
  }
  return texts;
}

/**
 * Reads one fenced block out of a documentation page.
 *
 * @param page - The whole page
 * @param language - The language the fence names, such as `yaml`
 * @param starts - The first line of the block the caller wants
 * @returns The content of that block, without the fences
 */
function blockOf(page: string, language: string, starts: string): string {
  const opening = `\`\`\`${language}\n${starts}`;
  const from = page.indexOf(opening);
  expect(from, `${language} block starting with '${starts}'`).toBeGreaterThan(-1);
  const body = page.slice(from + language.length + 4);
  return body.slice(0, body.indexOf("\n```") + 1);
}

describe("Integration: the committed Protobuf example", () => {
  it("carries a generated payload for every message", () => {
    const messages = Object.values(DOCUMENT.components?.messages ?? {});
    expect(messages).toHaveLength(3);
    for (const message of messages) {
      expect(message.payload?.schemaFormat).toBe(PROTOBUF);
    }
  });

  it.each(PACKAGES)("describes %s as the official emitter does", (packageName, file) => {
    const official = declarationsOf(readFileSync(new URL(file, EXAMPLE), "utf8"));

    // Every payload of the package is a slice of that package. Together the
    // slices declare what the file declares, and each declaration has to say
    // the same thing on both sides.
    const ours = new Map<string, unknown>();
    for (const text of payloadsOf(packageName)) {
      for (const [name, declaration] of declarationsOf(text)) ours.set(name, declaration);
    }

    const byName = (a: string, b: string): number => a.localeCompare(b);
    expect([...ours.keys()].sort(byName)).toEqual([...official.keys()].sort(byName));
    for (const [name, declaration] of ours) {
      expect(declaration, `${name} differs from ${file}`).toStrictEqual(official.get(name));
    }
  });

  /**
   * A model reached only through a field is part of the payload that reaches
   * it, and of no other. `Money` is such a model: `OrderPlaced` names it and
   * `OrderShipped` does not.
   */
  it("puts a field-only model in the one payload that reaches it", () => {
    const carrying = payloadsOf("com.example.orders").filter((text) => text.includes("Money"));

    expect(carrying).toHaveLength(1);
    expect(carrying[0]).toContain("message OrderPlaced {");
    expect(DOCUMENT.components?.messages?.Money).toBeUndefined();
  });

  /**
   * The guide quotes the output of this example. A quote that drifts from the
   * committed files teaches a reader something the emitter does not do.
   */
  it.each(GUIDES)("is quoted verbatim by %s", (guide) => {
    const page = readFileSync(new URL(`../../${guide}`, import.meta.url), "utf8");

    const document = readFileSync(new URL("asyncapi.yaml", EXAMPLE), "utf8");
    expect(document).toContain(blockOf(page, "yaml", "components:"));

    const orders = readFileSync(new URL("proto/com/example/orders.proto", EXAMPLE), "utf8");
    expect(orders).toContain(blockOf(page, "proto", "// Generated by"));
  });

  it("passes the parser with the Protobuf schema parser registered", async () => {
    await expect(DOCUMENT).toBeValidAsyncAPI();
  });
});
