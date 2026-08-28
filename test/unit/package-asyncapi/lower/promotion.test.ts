import { describe, expect, it } from "vitest";
import { Promoter } from "#emitter/lower/components/promotion.js";

/** A fragment shape with no name of its own, like a Bindings Object. */
interface Fragment {
  a?: string;
  b?: number;
}

/** The `"repeated"` policy: nothing named it, so the second use decides. */
function repeated(): Promoter<Fragment> {
  return new Promoter<Fragment>({ when: "repeated", key: (_value, site) => site });
}

/** The `"named"` policy: the author wrote the name, so one use is enough. */
function named(): Promoter<{ name: string }> {
  return new Promoter<{ name: string }>({ when: "named", key: (value) => value.name });
}

describe("Unit: Promoter", () => {
  describe("the repeated policy", () => {
    it("leaves a fragment used once where it is", () => {
      const promoter = repeated();
      promoter.survey({ a: "x" }, "orders");
      promoter.freeze();

      expect(promoter.keyFor({ a: "x" })).toBeUndefined();
      expect(promoter.entries().size).toBe(0);
    });

    it("promotes a fragment used twice", () => {
      const promoter = repeated();
      promoter.survey({ a: "x" }, "orders");
      promoter.survey({ a: "x" }, "shipments");
      promoter.freeze();

      expect(promoter.keyFor({ a: "x" })).toBe("orders");
      expect([...promoter.entries()]).toStrictEqual([["orders", { a: "x" }]]);
    });

    /** Three sites are still one component, not two. */
    it("promotes a fragment used three times once", () => {
      const promoter = repeated();
      for (const site of ["a", "b", "c"]) promoter.survey({ a: "x" }, site);
      promoter.freeze();

      expect(promoter.entries().size).toBe(1);
    });

    /** The first site names it. A later site cannot rename it. */
    it("names the component after the site that met it first", () => {
      const promoter = repeated();
      promoter.survey({ a: "x" }, "first");
      promoter.survey({ a: "x" }, "second");
      promoter.freeze();

      expect(promoter.keyFor({ a: "x" })).toBe("first");
    });
  });

  describe("the named policy", () => {
    it("promotes on the first use", () => {
      const promoter = named();
      promoter.survey({ name: "public" }, "orders");
      promoter.freeze();

      expect(promoter.keyFor({ name: "public" })).toBe("public");
      expect(promoter.entries().size).toBe(1);
    });
  });

  describe("identity", () => {
    /**
     * Two fragments built in different orders are the same fragment. The
     * emitted bytes would be identical, so sharing them is not a guess.
     */
    it("ignores the order the members were written in", () => {
      const promoter = repeated();
      promoter.survey({ a: "x", b: 1 }, "first");
      promoter.survey({ b: 1, a: "x" }, "second");
      promoter.freeze();

      expect(promoter.entries().size).toBe(1);
    });

    /** A member that differs makes a different fragment. */
    it("keeps fragments that differ apart", () => {
      const promoter = repeated();
      promoter.survey({ a: "x" }, "first");
      promoter.survey({ a: "y" }, "second");
      promoter.freeze();

      expect(promoter.entries().size).toBe(0);
    });

    /** Nesting is compared too, not only the top level. */
    it("compares nested members", () => {
      const nested = new Promoter<{ inner: { deep: string } }>({
        when: "repeated",
        key: (_value, site) => site,
      });
      nested.survey({ inner: { deep: "x" } }, "first");
      nested.survey({ inner: { deep: "x" } }, "second");
      nested.freeze();

      expect(nested.entries().size).toBe(1);
    });
  });

  describe("order", () => {
    /**
     * The entries come out in the order the survey met them. The survey walks
     * the resolved model, whose lists are already in source order, so this is
     * what makes the emitted section deterministic without a sort.
     */
    it("keeps the entries in survey order", () => {
      const promoter = repeated();
      for (const site of ["zeta", "alpha", "middle"]) {
        promoter.survey({ a: site }, site);
        promoter.survey({ a: site }, site + "-again");
      }
      promoter.freeze();

      expect([...promoter.entries().keys()]).toStrictEqual(["zeta", "alpha", "middle"]);
    });
  });

  describe("the survey and the build are separate phases", () => {
    it("refuses a survey after freezing", () => {
      const promoter = repeated();
      promoter.freeze();

      expect(() => {
        promoter.survey({ a: "x" }, "late");
      }).toThrow(/survey is closed/);
    });

    /**
     * Reading a key before the survey closes would answer from a count that
     * is still going up, so a site could write the fragment inline and a
     * later one write a reference to a component nothing emitted.
     */
    it("refuses a key read before freezing", () => {
      const promoter = repeated();
      promoter.survey({ a: "x" }, "orders");

      expect(() => promoter.keyFor({ a: "x" })).toThrow(/survey is open/);
      expect(() => promoter.entries()).toThrow(/survey is open/);
    });
  });
  describe("the identity of one fragment", () => {
    /**
     * The survey and the site pass the same object, and reading its identity
     * walks the whole fragment. Walking it once per object is what keeps the
     * cost of promotion linear in the size of the document rather than in
     * the number of times a site is asked about.
     */
    it("reads one object once, however many times it is asked about", () => {
      let reads = 0;
      const fragment: Fragment = {
        a: "x",
        get b(): number {
          reads += 1;
          return 1;
        },
      };
      const promoter = repeated();

      promoter.survey(fragment, "orders");
      promoter.survey(fragment, "shipments");
      promoter.freeze();
      expect(promoter.keyFor(fragment)).toBe("orders");

      expect(reads).toBe(1);
    });

    /** Two objects are still two walks, and equal ones still match. */
    it("gives two equal objects one identity", () => {
      const promoter = repeated();
      promoter.survey({ a: "x", b: 1 }, "orders");
      promoter.survey({ b: 1, a: "x" }, "shipments");
      promoter.freeze();

      expect(promoter.entries().size).toBe(1);
    });
  });
});
