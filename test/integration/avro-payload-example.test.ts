/**
 * The committed Avro payload example, read as a reader reads it.
 *
 * `examples/18-avro-payloads` is compiled by two emitters over one source.
 * `tsp-avro` writes the `.avsc` files, and this emitter inlines the same
 * walk as the payload in the AsyncAPI document.
 *
 * The committed files are a parity case no test host produced: a drift
 * between the file on disk and the payload in the document shows up here.
 *
 * The document is also parsed, with the official AsyncAPI Avro schema
 * parser registered, so an unbuildable payload is an error here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/** The example directory, as a URL the reads below resolve against. */
const EXAMPLE = new URL("../../examples/18-avro-payloads/", import.meta.url);

/** The repository root, for the pages that quote the example. */
const ROOT = new URL("../../", import.meta.url);

/** The document the AsyncAPI emitter wrote. */
const DOCUMENT = parseYaml(readFileSync(new URL("asyncapi.yaml", EXAMPLE), "utf8")) as ExampleDoc;

/** The AsyncAPI schema format of an Avro schema. */
const AVRO = "application/vnd.apache.avro;version=1.9.0";

/** Each message of the document, and the file `tsp-avro` wrote for it. */
const RECORDS = [
  ["OrderPlaced", "schemas/com/example/orders/OrderPlaced.avsc"],
  ["OrderCancelled", "schemas/com/example/orders/OrderCancelled.avsc"],
] as const;

/** The two guide pages that quote the output of the example. */
const GUIDES = ["docs/guide/avro-payloads.md", "docs/zh-tw/guide/avro-payloads.md"] as const;

/** The manifest of the emitter package, which declares the supported range. */
const MANIFEST = JSON.parse(
  readFileSync(new URL("packages/tsp-asyncapi/package.json", ROOT), "utf8"),
) as { peerDependencies: Record<string, string> };

/** The range of the Avro library this release supports. */
const SUPPORTED_RANGE = MANIFEST.peerDependencies["tsp-avro"];

/** As much of the document as this suite reads. */
interface ExampleDoc {
  channels?: Record<string, { messages?: Record<string, { $ref?: string }> }>;
  components?: {
    messages?: Record<string, { payload?: { schemaFormat?: string; schema?: unknown } }>;
  };
}

/**
 * The payload of one message of the document.
 *
 * @param name - The `components.messages` key
 * @returns The Multi Format Schema Object under it
 */
function payloadOf(name: string): { schemaFormat?: string; schema?: unknown } {
  const payload = DOCUMENT.components?.messages?.[name]?.payload;
  expect(payload, `message ${name}`).toBeDefined();
  return payload ?? {};
}

/**
 * Reads the content of one fenced block, given where its body starts.
 *
 * Keeps the block's indentation and trailing newline, matching what a
 * reader would copy. This lets callers use substring checks instead of
 * comparing normalized text.
 *
 * @param language - Named in the error if the fence is never closed
 */
function bodyAt(page: string, from: number, language: string): string {
  const body = page.slice(from);
  const closing = body.indexOf("\n```");
  // An unclosed fence makes `indexOf` return -1, so the slice becomes empty.
  // Every check below passes on an empty string, so this throws instead.
  if (closing === -1) throw new Error(`A \`${language}\` block on the page is never closed.`);
  return body.slice(0, closing + 1);
}

/** Reads one fenced block out of a documentation page, by its first line. */
function blockOf(page: string, language: string, starts: string): string {
  const opening = `\`\`\`${language}\n${starts}`;
  const from = page.indexOf(opening);
  expect(from, `${language} block starting with '${starts}'`).toBeGreaterThan(-1);
  return bodyAt(page, from + language.length + 4, language);
}

/** Every fenced block of one language on a page, in the order the page holds them. */
function blocksOf(page: string, language: string): string[] {
  const blocks: string[] = [];
  const opening = `\`\`\`${language}\n`;
  let from = page.indexOf(opening);
  while (from !== -1) {
    blocks.push(bodyAt(page, from + opening.length, language));
    from = page.indexOf(opening, from + opening.length);
  }
  return blocks;
}

describe("Integration: the committed Avro payload example", () => {
  it("carries a generated payload for every message", () => {
    const messages = Object.values(DOCUMENT.components?.messages ?? {});

    expect(messages).toHaveLength(RECORDS.length);
    for (const message of messages) {
      expect(message.payload?.schemaFormat).toBe(AVRO);
    }
  });

  /**
   * The payload and the file share one schema: `tsp-avro` writes it as JSON
   * text, and this emitter inlines the same object. Parsing the file must
   * match the document exactly.
   */
  it.each(RECORDS)("carries in %s the schema written to %s", (name, file) => {
    const written: unknown = JSON.parse(readFileSync(new URL(file, EXAMPLE), "utf8"));

    expect(payloadOf(name).schema).toStrictEqual(written);
  });

  /**
   * One model is one message of the document, whatever names it. Two channels
   * carry `OrderPlaced`, and both reach the one entry rather than a copy.
   */
  it("shares one message component between the two channels that carry it", () => {
    const reference = { $ref: "#/components/messages/OrderPlaced" };

    expect(DOCUMENT.channels?.["orders.placed"]?.messages?.OrderPlaced).toEqual(reference);
    expect(DOCUMENT.channels?.["orders.placed.retry"]?.messages?.OrderPlaced).toEqual(reference);
  });

  /**
   * An empty block is a substring of everything. This confirms `blocksOf`
   * throws instead of returning one.
   */
  it("refuses a block the page never closes", () => {
    expect(() => blocksOf("```json\n{}\n", "json")).toThrow(/never closed/);
  });

  /** The document block. A quote that drifts shows a reader other bytes. */
  it.each(GUIDES)("quotes the document of the example in %s", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");
    const document = readFileSync(new URL("asyncapi.yaml", EXAMPLE), "utf8");

    const quoted = blockOf(page, "yaml", "components:");
    expect(quoted).not.toBe("");
    expect(document).toContain(quoted);
  });

  /** Every source excerpt. Each one is a contiguous run of `main.tsp`. */
  it.each(GUIDES)("quotes the source of the example in %s", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");
    const source = readFileSync(new URL("main.tsp", EXAMPLE), "utf8");

    const blocks = blocksOf(page, "typespec");
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).not.toBe("");
      expect(source).toContain(block);
    }
  });

  /** Every schema excerpt. Each one is a run of a file the Avro emitter wrote. */
  it.each(GUIDES)("quotes the schema files of the example in %s", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");
    const files = RECORDS.map(([, file]) => readFileSync(new URL(file, EXAMPLE), "utf8"));

    const blocks = blocksOf(page, "json");
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).not.toBe("");
      expect(files.some((file) => file.includes(block))).toBe(true);
    }
  });

  /**
   * The Avro library is an optional peer, pinned to one minor range enforced
   * only at install time. The emitter reads no version itself, so the guides
   * must name the range from the manifest, or a reader installs an untried
   * library.
   */
  it.each(GUIDES)("names the supported range of the Avro library in %s", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");

    expect(page).toContain(SUPPORTED_RANGE);
  });

  it("passes the parser with the Avro schema parser registered", async () => {
    await expect(DOCUMENT).toBeValidAsyncAPI();
  });
});
