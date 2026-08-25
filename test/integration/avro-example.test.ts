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
    const closing = body.indexOf("\n```");
    // A fence that is never closed makes `indexOf` answer -1, and the slice
    // that follows would then be the empty string. Every check below this
    // point passes on the empty string, so a malformed page would read as a
    // page that quotes the example correctly. It fails here instead.
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
   * The reader of the two assertions below.
   *
   * An empty block is a substring of everything, so it would pass both of
   * them. A page that lost the body of a block would then read as a page that
   * quotes the example. This is what stops that.
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

    expect(blocks).toHaveLength(3);
    for (const block of blocks) {
      expect(block).not.toBe("");
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

/**
 * The pages that tell a reader this package is experimental.
 *
 * Every one of them says so in prose. None of them may say it by quoting a
 * version, because a version in prose is a claim the next publish falsifies:
 * the changeset raises the number and the prose keeps the old one, in six
 * places at once. The word "experimental" and the range `0.x` both survive a
 * release, so those are what the pages carry.
 */
const VERSION_PAGES = [
  ...DIAGNOSTIC_PAGES,
  "README.md",
  "README.zh-TW.md",
  // The changeset that describes the Avro feature. The library itself carries
  // no changeset while its first release is unpublished, so the page that
  // speaks for it is the one the emitter's release brings.
  ".changeset/avro-preview.md",
] as const;

/**
 * Pages that must carry the notice but may name a version.
 *
 * A changelog names versions; that is what it is for. It still has to say the
 * package is experimental, because a reader who arrives at the entry for the
 * first release learns it there.
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
 * The two decorator names TypeSpec reserves.
 *
 * `namespace` and `record` are reserved words, so a reader has to write
 * `` @Avro.`record` `` with backticks around the name. A page that writes
 * `@Avro.record` hands that reader a line the compiler answers with
 * `reserved-identifier`. Every page carries the backticked form, and this is
 * what keeps a plain one out.
 */
const RESERVED_NAMES = ["namespace", "record"] as const;

describe("Integration: the Avro reserved decorator names", () => {
  it.each([...DIAGNOSTIC_PAGES, "README.md", "README.zh-TW.md"])(
    "%s writes every reserved decorator name in backticks",
    (page) => {
      const text = readFileSync(new URL(page, ROOT), "utf8");
      const plain = RESERVED_NAMES.filter((name) => text.includes(`@Avro.${name}`));

      expect(plain, `${page} writes a name the compiler rejects`).toEqual([]);
    },
  );
});

/**
 * The Chinese pages of this package, in Taiwanese usage.
 *
 * The repository writes one term for one concept, and it writes the Taiwanese
 * term. A mainland term reads as a second name for a thing that already has
 * one. Each entry below is a word this repository has chosen against, paired
 * with the word it uses instead, so a failure says what to write.
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
