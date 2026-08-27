/**
 * The committed Avro payload example, read as a consumer reads it.
 *
 * `examples/18-avro-payloads` is compiled by two emitters over one source.
 * `tsp-avro` writes the `.avsc` files. This one writes the AsyncAPI document,
 * and every payload in it is the schema that same walk returned.
 *
 * So the example is a parity case that no test host produced. The files below
 * are the committed output of a real compile, and the two sides have to carry
 * one schema. A drift between the file on disk and the payload in the document
 * shows up here as an object that differs.
 *
 * The document is also parsed. The validation helper registers the official
 * AsyncAPI Avro schema parser, so a payload that is not Avro a reader can
 * build is an error and not an object nobody looked at.
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
 * The block keeps its own indentation and its trailing newline, so it is the
 * text a reader would copy. That is what makes each assertion below a
 * substring test rather than a comparison of two normalized things.
 *
 * @param page - The whole page
 * @param from - The index of the first character of the body
 * @param language - The language the fence names, for the failure message
 * @returns The content of that block, without the fences
 */
function bodyAt(page: string, from: number, language: string): string {
  const body = page.slice(from);
  const closing = body.indexOf("\n```");
  // A fence that is never closed makes `indexOf` answer -1, and the slice
  // would then be the empty string. Every check below passes on the empty
  // string, so a malformed page would read as a page that quotes the example.
  if (closing === -1) throw new Error(`A \`${language}\` block on the page is never closed.`);
  return body.slice(0, closing + 1);
}

/**
 * Reads one fenced block out of a documentation page, by its first line.
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
  return bodyAt(page, from + language.length + 4, language);
}

/**
 * Every fenced block of one language on a page.
 *
 * @param page - The whole page
 * @param language - The language the fence names, such as `typespec`
 * @returns The content of each such block, in the order the page holds them
 */
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
   * The payload and the file are one schema. The Avro emitter writes the walk
   * out as JSON text, and this emitter inlines the same walk as an object. So
   * parsing the file has to give exactly what the document carries.
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
   * The reader of the quote assertions below. An empty block is a substring of
   * everything, so a page that lost the body of a block would otherwise read
   * as a page that quotes the example.
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
   * The Avro library is an optional peer, pinned to one minor range. That
   * range is enforced at install time, by the package manager alone. The
   * emitter reads no version: it calls whatever `tsp-avro` resolves to. So the
   * guides have to name the range the manifest declares, or a reader installs
   * a library this release was never tried against. The manifest is the one
   * place that range is decided.
   */
  it.each(GUIDES)("names the supported range of the Avro library in %s", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");

    expect(page).toContain(SUPPORTED_RANGE);
  });

  it("passes the parser with the Avro schema parser registered", async () => {
    await expect(DOCUMENT).toBeValidAsyncAPI();
  });
});
