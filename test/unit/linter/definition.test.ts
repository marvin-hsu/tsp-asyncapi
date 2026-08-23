import { describe, expect, it } from "vitest";
import { asyncAPILinter } from "#core/linter.js";
import { LIBRARY_NAME } from "#core/lib.js";

/**
 * Tests of the linter definition itself, rather than of any one rule.
 *
 * A mistyped reference in a rule set is the failure this file exists for.
 * The compiler resolves `enable` keys against registered rule ids, and a key
 * that matches nothing enables nothing. No rule test can catch that: each of
 * them runs its rule directly.
 */
describe("Unit: the linter definition", () => {
  /** The rules `recommended` is expected to enable, written out. */
  const RECOMMENDED = ["missing-service", "channel-without-operation", "operation-without-message"];

  it("gives every rule a unique name", () => {
    const names = asyncAPILinter.rules.map((rule) => rule.name);
    expect(new Set(names).size).toBe(names.length);
  });

  /**
   * Every rule is a warning. The compiler types `severity` as that one
   * literal, so this asserts a fact about the rules rather than about the
   * type: a rule cannot express an error, and a reader of the reference
   * documentation should not have to check each entry to learn that.
   */
  it("declares every rule as a warning", () => {
    for (const rule of asyncAPILinter.rules) {
      expect(rule.severity).toBe("warning");
    }
  });

  it("gives every rule a description", () => {
    for (const rule of asyncAPILinter.rules) {
      expect(rule.description).not.toBe("");
    }
  });

  /**
   * The reference has to name a registered rule, and it has to carry the
   * library prefix. A bare rule name resolves to nothing.
   */
  it("enables only registered rules in recommended", () => {
    const registered = new Set(asyncAPILinter.rules.map((rule) => `${LIBRARY_NAME}/${rule.name}`));
    const enabled = Object.keys(asyncAPILinter.ruleSets?.recommended.enable ?? {});

    expect(enabled.length).toBeGreaterThan(0);
    for (const ref of enabled) {
      expect(registered).toContain(ref);
    }
  });

  /**
   * Promoting a rule into `recommended` is a decision about what a user sees
   * without asking for it. Pinning the set makes that a deliberate diff
   * rather than a side effect of adding a rule.
   */
  it("recommends exactly the expected rules", () => {
    const enabled = Object.keys(asyncAPILinter.ruleSets?.recommended.enable ?? {}).sort((a, b) =>
      a.localeCompare(b),
    );
    const expected = RECOMMENDED.map((name) => `${LIBRARY_NAME}/${name}`).sort((a, b) =>
      a.localeCompare(b),
    );
    expect(enabled).toStrictEqual(expected);
  });

  /**
   * No hand-written `all`. The compiler synthesizes one enabling every rule
   * when a linter does not declare it, and a hand-written list is one more
   * place to forget a rule.
   */
  it("declares no `all` rule set", () => {
    expect(asyncAPILinter.ruleSets).not.toHaveProperty("all");
  });
});
