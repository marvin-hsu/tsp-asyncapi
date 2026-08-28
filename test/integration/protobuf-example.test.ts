/**
 * The committed Protobuf example, read as a reader reads it.
 *
 * `examples/16-protobuf-payloads` is compiled by two emitters over one
 * source. The official emitter writes the `.proto` files, and this emitter
 * renders the same decorator state as proto3 text in the AsyncAPI document.
 *
 * The committed files are a parity case no test host produced: a drift
 * between this emitter's mapping and the official one shows up here as a
 * differing descriptor.
 *
 * The document is also parsed, with the official AsyncAPI Protobuf schema
 * parser registered, so a payload that is not valid proto3 is an error here.
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

/** The manifest of the emitter package, which declares the supported range. */
const MANIFEST = JSON.parse(
  readFileSync(new URL("../../packages/tsp-asyncapi/package.json", import.meta.url), "utf8"),
) as { peerDependencies: Record<string, string> };

/** The range of the official library this release supports. */
const SUPPORTED_RANGE = MANIFEST.peerDependencies["@typespec/protobuf"];

/** As much of the document as this suite reads. */
interface ExampleDoc {
  components?: {
    messages?: Record<string, { payload?: { schemaFormat?: string; schema?: string } }>;
  };
}

/**
 * One node of a descriptor tree. A node can hold children, a definition, or
 * both, because a message can declare types inside itself.
 */
interface DescriptorNode {
  nested?: Record<string, DescriptorNode>;
  fields?: Record<string, unknown>;
  values?: Record<string, unknown>;
  methods?: Record<string, unknown>;
}

/**
 * Flattens a descriptor tree into one definition per qualified name.
 *
 * A payload and a `.proto` file nest their declarations under the package,
 * and comparing the trees whole would compare the packages too. Flattening
 * gives one entry per declaration, so declarations from two texts compare
 * even when one text holds fewer of them.
 */
function declarationsOf(text: string): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const walk = (node: DescriptorNode, path: string): void => {
    // A message that declares a type inside itself holds a definition and
    // children at once. Both halves are recorded, so such a message is
    // compared and not skipped.
    const defines =
      node.fields !== undefined || node.values !== undefined || node.methods !== undefined;
    if (defines) found.set(path, node);
    for (const [name, child] of Object.entries(node.nested ?? {})) {
      walk(child, path === "" ? name : `${path}.${name}`);
    }
  };
  walk(descriptorOf(text) as DescriptorNode, "");
  return found;
}

/** Every payload the document carries for one Protobuf package. */
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

/** Reads one fenced block out of a documentation page. */
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

  /**
   * A message that declares a type inside itself carries fields and children
   * at once. The judge above compares one entry per declaration, so it has to
   * record such a message as well as walk into it. A judge that only walked
   * would pass while the two sides disagreed about that message.
   */
  it("records a message that declares a type inside itself", () => {
    const text = `
      syntax = "proto3";
      package com.example.nesting;
      message Outer {
        string label = 1;
        message Inner { string value = 1; }
      }
    `;

    expect([...declarationsOf(text).keys()].sort((a, b) => a.localeCompare(b))).toEqual([
      "com.example.nesting.Outer",
      "com.example.nesting.Outer.Inner",
    ]);
  });

  /**
   * The guide quotes the source of the example as well as its output. The
   * excerpt is two contiguous runs of `main.tsp`, with the namespace closed
   * between them. A run that drifts from the file shows a reader a model the
   * repository does not hold.
   */
  it.each(GUIDES)("quotes the source of the example in %s", (guide) => {
    const page = readFileSync(new URL(`../../${guide}`, import.meta.url), "utf8");
    const source = readFileSync(new URL("main.tsp", EXAMPLE), "utf8");

    const [models, channel] = blockOf(page, "typespec", "@Protobuf.package").split("\n}\n\n");
    expect(source).toContain(models);
    expect(source).toContain(channel);
  });

  /**
   * The official library is an optional peer, pinned to one minor range. A
   * reader who installs another range gets decorators whose state this emitter
   * refuses to read. So each guide names the range next to the install
   * command, and the manifest is the one place that range is decided.
   */
  it.each(GUIDES)("names the supported range of the official library in %s", (guide) => {
    const page = readFileSync(new URL(`../../${guide}`, import.meta.url), "utf8");

    expect(page).toContain(SUPPORTED_RANGE);
  });

  it("passes the parser with the Protobuf schema parser registered", async () => {
    await expect(DOCUMENT).toBeValidAsyncAPI();
  });
});
