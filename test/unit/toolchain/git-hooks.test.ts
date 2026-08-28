import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * The commands the git hooks run, checked against the scripts they stand for.
 *
 * A hook runs on a developer machine alone. No CI job reads one, so a hook
 * that reverts to a broken command passes every gate. The failure appears
 * later, on someone else's clean clone.
 */

/** The workspace root, as a path from this file. */
const ROOT = new URL("../../../", import.meta.url);

describe("Unit: the git hooks", () => {
  /**
   * The root project references the three packages. A referenced project
   * whose declarations are missing is reported as TS6305. A bare
   * `tsc --noEmit` builds none of them, so it fails on a clean clone. The
   * `typecheck` script builds the references first, then checks the tests
   * against them.
   */
  it("checks types through the workspace script before a push", async () => {
    const hook = await readFile(new URL(".husky/pre-push", ROOT), "utf8");
    const commands = runnableLines(hook);

    expect(commands, "pre-push type check").toContain("pnpm typecheck || exit 1");
    expect(
      commands.some((line) => /\btsc\b/.test(line)),
      "a bare tsc on the pre-push path",
    ).toBe(false);
  });
});

/**
 * The lines of a shell script that run a command.
 *
 * Comments explain the commands, and one of them names `tsc --noEmit` as the
 * thing the hook avoids. A check over the whole text would read that mention
 * as a command.
 *
 * @param script - The contents of a shell script
 * @returns Every line that is neither blank nor a comment, trimmed
 */
function runnableLines(script: string): string[] {
  return script
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}
