/**
 * The committed Avro example, read as a consumer reads it.
 *
 * `examples/17-avro-schemas` holds the output of a real `tsp compile`. The
 * files are in the repository so that a reader sees an input and its output
 * side by side, and that only helps while the two agree. This suite is what
 * makes them agree. It compiles the committed source again and compares the
 * bytes, so a change to the walk or to the renderer that nobody meant to make
 * shows up here.
 *
 * It also hands every committed file to `avsc`. A schema file no reader can
 * build is worse than no example at all, because a reader would copy it.
 *
 * The two guide pages quote the example. Every block they quote is checked
 * against the files rather than against a copy of them, so a page cannot
 * drift from the emitter without a failure here.
 *
 * The four pages that list the diagnostics are checked against the library
 * for the same reason. A reader looks a code up, and a table that names a
 * code nothing reports sends that reader nowhere.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emitAvro, expectInstanceRoundTrip } from "../utils/avro.js";
import { $lib } from "#avro/lib.js";

/** The example directory, as a URL the reads below resolve against. */
const EXAMPLE = new URL("../../examples/17-avro-schemas/", import.meta.url);

/** The repository root, for the guide pages. */
const ROOT = new URL("../../", import.meta.url);

/** Each committed schema, by the path the emitter chose under the output dir. */
const SCHEMAS = [
  "com/example/orders/OrderPlaced.avsc",
  "com/example/orders/OrderFulfilmentChanged.avsc",
] as const;

/** The two guide pages that quote the example. */
const GUIDES = ["docs/guide/avro-schemas.md", "docs/zh-tw/guide/avro-schemas.md"] as const;

/** Reads one committed schema file as text. */
function committedText(path: string): string {
  return readFileSync(new URL(`schemas/${path}`, EXAMPLE), "utf8");
}

/** The TypeSpec source of the example, as committed. */
function committedSource(): string {
  return readFileSync(new URL("main.tsp", EXAMPLE), "utf8");
}

/**
 * The source of the example, ready for the test host.
 *
 * The host writes the import line itself, and TypeSpec wants every import
 * first. So the one the file carries is dropped, and nothing else is touched.
 */
function hostSource(): string {
  return committedSource().replace('import "tsp-avro";', "");
}

/**
 * Every fenced block of one language on a page.
 *
 * A block is returned with its own indentation and its trailing newline, so
 * it is the text a reader would copy. That is what makes the assertion below
 * a substring test rather than a comparison of two normalized things.
 */
function blocksOf(page: string, language: string): string[] {
  const blocks: string[] = [];
  const opening = `\`\`\`${language}\n`;
  let from = page.indexOf(opening);
  while (from !== -1) {
    const body = page.slice(from + opening.length);
    blocks.push(body.slice(0, body.indexOf("\n```") + 1));
    from = page.indexOf(opening, from + opening.length);
  }
  return blocks;
}

describe("Integration: the Avro example", () => {
  it("writes the committed bytes again", async () => {
    const result = await emitAvro(hostSource());

    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([]);
    expect(Object.keys(result.texts).sort((left, right) => left.localeCompare(right))).toEqual(
      [...SCHEMAS].sort((left, right) => left.localeCompare(right)),
    );
    for (const path of SCHEMAS) {
      expect(result.texts[path]).toBe(committedText(path));
    }
  });

  it.each(SCHEMAS)("round-trips an instance of %s", (path) => {
    expectInstanceRoundTrip(JSON.parse(committedText(path)));
  });

  /**
   * The two Avro rules that are easiest to write down the wrong way round.
   * An optional field leads its union with null. An optional field that
   * carries a default leads with the type of that default.
   */
  it("writes both orders a nullable union takes", () => {
    expect(committedText("com/example/orders/OrderPlaced.avsc")).toContain(
      '"type": [\n        "null",\n        "com.example.orders.Address"\n      ],',
    );
    expect(committedText("com/example/orders/OrderFulfilmentChanged.avsc")).toContain(
      '"type": [\n        "string",\n        "null"\n      ],',
    );
  });

  it.each(GUIDES)("%s quotes the source of the example", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");
    const blocks = blocksOf(page, "typespec");
    const source = committedSource();

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(source).toContain(block);
    }
  });

  it.each(GUIDES)("%s quotes the output of the example", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");
    const blocks = blocksOf(page, "json");
    const files = SCHEMAS.map(committedText);

    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(files.some((file) => file.includes(block))).toBe(true);
    }
  });
});

/**
 * The pages that carry a table of every diagnostic this package reports.
 *
 * Both READMEs are here as well as both guides. A README is the only page a
 * reader sees on npm, so it carries the whole table rather than a link.
 */
const DIAGNOSTIC_PAGES = [
  "packages/tsp-avro/README.md",
  "packages/tsp-avro/README.zh-TW.md",
  ...GUIDES,
] as const;

/** Every diagnostic code the library declares, as a reader writes it. */
const CODES = Object.keys($lib.diagnostics).map((code) => `tsp-avro/${code}`);

describe("Integration: the Avro diagnostics tables", () => {
  it.each(DIAGNOSTIC_PAGES)("%s lists every code the library reports", (page) => {
    const text = readFileSync(new URL(page, ROOT), "utf8");

    for (const code of CODES) {
      expect(text, code).toContain(code);
    }
  });

  it.each(DIAGNOSTIC_PAGES)("%s lists no code the library does not report", (page) => {
    const text = readFileSync(new URL(page, ROOT), "utf8");
    const named = [...text.matchAll(/tsp-avro\/[a-z-]+/g)].map((match) => match[0]);

    expect([...new Set(named)].sort((left, right) => left.localeCompare(right))).toEqual(
      [...CODES].sort((left, right) => left.localeCompare(right)),
    );
  });
});
