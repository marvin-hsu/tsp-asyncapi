/**
 * The committed Avro example, read as a consumer reads it.
 *
 * `examples/17-avro-schemas` holds the output of a real `tsp compile`. This
 * suite recompiles the committed source and compares the bytes, so an
 * unintended change to the walk or the renderer shows up here.
 *
 * It also hands every committed file to `avsc`, since a schema a reader
 * cannot build is worse than no example at all.
 *
 * The guide pages and the diagnostics tables are checked against these files
 * and against the library, so neither can drift from the emitter without a
 * failure here.
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
 * The host writes its own import line, and TypeSpec requires imports first.
 * This drops the file's import line and changes nothing else.
 */
function hostSource(): string {
  return committedSource().replace('import "tsp-avro";', "");
}

/**
 * Every fenced block of one language on a page.
 *
 * Each block keeps its indentation and trailing newline, matching what a
 * reader would copy. This lets the checks below use substring comparisons
 * instead of normalized text.
 */
function blocksOf(page: string, language: string): string[] {
  const blocks: string[] = [];
  const opening = `\`\`\`${language}\n`;
  let from = page.indexOf(opening);
  while (from !== -1) {
    const body = page.slice(from + opening.length);
    const closing = body.indexOf("\n```");
    // An unclosed fence makes `indexOf` return -1, and the slice becomes
    // empty. An empty block would pass every check below, so this throws
    // instead of letting a malformed page read as a correct one.
    if (closing === -1) {
      throw new Error(`A \`${language}\` block on the page is never closed.`);
    }
    blocks.push(body.slice(0, closing + 1));
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

  /**
   * An empty block is a substring of everything, so it would pass the quote
   * checks below silently. This confirms `blocksOf` throws instead.
   */
  it("refuses a block the page never closes", () => {
    expect(() => blocksOf('```json\n{ "a": 1 }\n', "json")).toThrow(/never closed/);
  });

  it.each(GUIDES)("%s quotes the source of the example", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");
    const blocks = blocksOf(page, "typespec");
    const source = committedSource();

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).not.toBe("");
      expect(source).toContain(block);
    }
  });

  it.each(GUIDES)("%s quotes the output of the example", (guide) => {
    const page = readFileSync(new URL(guide, ROOT), "utf8");
    const blocks = blocksOf(page, "json");
    const files = SCHEMAS.map(committedText);

    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block).not.toBe("");
      expect(files.some((file) => file.includes(block))).toBe(true);
    }
  });
});

/**
 * The pages that carry a table of every diagnostic this package reports.
 *
 * Guides only, not the README: a README helps a reader decide whether to
 * install the package, not what a diagnostic code means.
 */
const DIAGNOSTIC_PAGES = [...GUIDES] as const;

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

/**
 * The pages that tell a reader this package is experimental.
 *
 * None may quote an exact version: the next release changes the number, but
 * the prose would not update with it. "Experimental" and `0.x` both survive
 * a release, so the pages use those instead.
 */
const VERSION_PAGES = [...DIAGNOSTIC_PAGES, "README.md", "README.zh-TW.md"] as const;

/**
 * Pages that must carry the notice but may name a version.
 *
 * A changelog names versions by design, but its first-release entry must
 * still call the package experimental.
 */
const NOTICE_PAGES = [...VERSION_PAGES, "packages/tsp-avro/CHANGELOG.md"] as const;

/** The version the package declares, read as the pages would have to. */
function declaredVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL("packages/tsp-avro/package.json", ROOT), "utf8"),
  );
  const version = (manifest as { version?: unknown }).version;
  if (typeof version !== "string") {
    throw new Error("The package manifest declares no version.");
  }
  return version;
}

/** The version the pages must not quote. */
const VERSION = declaredVersion();

describe("Integration: the Avro experimental notice", () => {
  it.each(VERSION_PAGES)("%s quotes no exact version", (page) => {
    const text = readFileSync(new URL(page, ROOT), "utf8");

    expect(text, `${page} states version ${VERSION}, which the next release breaks`).not.toContain(
      VERSION,
    );
  });

  /** Dropping the version must not drop the notice it sat inside. */
  it.each(NOTICE_PAGES)("%s still calls the package experimental", (page) => {
    const text = readFileSync(new URL(page, ROOT), "utf8");

    expect(/experimental|實驗性/i.test(text), `${page} carries no experimental notice`).toBe(true);
  });
});

/**
 * Mainland terms this repository writes another way, paired with the
 * Taiwanese term it uses instead. A failure names the correct word.
 */
const MAINLAND_TERMS: readonly (readonly [string, string])[] = [
  ["對象", "物件"],
  ["協議", "通訊協定"],
  ["字段", "欄位"],
  ["函數", "函式"],
  ["接口", "介面"],
  ["數組", "陣列"],
  ["缺省", "預設"],
];

/** The Chinese pages this package owns. */
const CHINESE_PAGES = [
  "packages/tsp-avro/README.zh-TW.md",
  "docs/zh-tw/guide/avro-schemas.md",
] as const;

describe("Integration: the Avro Chinese pages", () => {
  it.each(CHINESE_PAGES)("%s uses the Taiwanese term throughout", (page) => {
    const text = readFileSync(new URL(page, ROOT), "utf8");
    const found = MAINLAND_TERMS.filter(([mainland]) => text.includes(mainland)).map(
      ([mainland, taiwanese]) => `${mainland} -> ${taiwanese}`,
    );

    expect(found, `${page} uses a term this repository writes another way`).toEqual([]);
  });
});
