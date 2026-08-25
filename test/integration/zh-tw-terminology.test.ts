/**
 * One banned term of the Traditional Chinese glossary, pinned across every
 * page of that locale.
 *
 * The glossary bans 實例 for "instance" and asks for 執行個體. The whole table
 * cannot be scanned this way, because several of its left column entries are
 * correct Taiwanese words in another sense. 文件 is the clearest of them: the
 * glossary bans it for "file" and every page here uses it for "document".
 *
 * 實例 has no such second sense in these pages, so it is safe to forbid
 * outright. It kept coming back one page at a time, which is what a test
 * stops.
 *
 * ## Why the glossary is not read here
 *
 * The glossary lives under `.claude/`, which the repository does not track.
 * A case that read it passed on a machine that has it and failed everywhere
 * else, which is how it reached the default branch. The pair below is the
 * rule this file holds, written where the file can reach it.
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The repository root, as a URL the reads below resolve against. */
const ROOT = new URL("../../", import.meta.url);

/** The term the glossary bans, and the term it asks for. */
const BANNED = "實例";
const PREFERRED = "執行個體";

describe("Integration: the Traditional Chinese glossary", () => {
  it("is followed by every page of that locale", async () => {
    const pages = [...(await markdownUnder("docs/zh-tw")), "README.zh-TW.md"];
    // A walk that found no page would report no offender.
    expect(pages.length).toBeGreaterThan(1);

    const offenders: string[] = [];
    for (const page of pages) {
      const text = await readFile(new URL(page, ROOT), "utf8");
      if (text.includes(BANNED)) offenders.push(page);
    }

    expect(
      offenders,
      `these pages write ${BANNED} where the glossary asks for ${PREFERRED}`,
    ).toEqual([]);
  });
});

/**
 * Every Markdown page below one directory of the repository.
 *
 * @param directory - The directory, as a path from the repository root
 * @returns The path of each page, from the repository root
 */
async function markdownUnder(directory: string): Promise<string[]> {
  const root = fileURLToPath(new URL(directory, ROOT));
  const entries = await readdir(root, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => `${directory}/${entry.parentPath.slice(root.length)}/${entry.name}`)
    .map((path) => path.replaceAll("//", "/"));
}
