import { describe, it, expect } from "vitest";
import { expectDiagnosticEmpty, expectDiagnostics, t } from "@typespec/compiler/testing";
import { AsyncAPITester } from "#emitter/testing.js";
import { buildServersFrom } from "../../utils/servers.js";
import { getServers } from "#core/decorators/index.js";
import { emitDocument, emitDocumentWithDiagnostics } from "../../utils/test-host.js";
import { present, serversOf } from "../../utils/document.js";
import { resolveServerVariables } from "../../utils/document.js";

describe("Unit: server variables", () => {
  it("emits a variable used by a host template", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com:9092",
        protocol: "kafka",
        variables: #{
          env: #{
            default: "prod",
            \`enum\`: #["prod", "sit"],
            description: "The environment.",
            examples: #["prod"]
          }
        }
      })
      namespace Test;
    `);

    // A variable is named by the key of the map it sits in, so it is written
    // once in `components.serverVariables` and the server points at it.
    expect(serversOf(doc).production).toEqual({
      host: "{env}.kafka.example.com:9092",
      protocol: "kafka",
      variables: { env: { $ref: "#/components/serverVariables/env" } },
    });
    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      env: {
        enum: ["prod", "sit"],
        default: "prod",
        description: "The environment.",
        examples: ["prod"],
      },
    });
  });

  it("emits a variable that only a pathname template uses", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "kafka.example.com:9092",
        protocol: "kafka",
        pathname: "/{tenant}/orders",
        variables: #{ tenant: #{ default: "acme" } }
      })
      namespace Test;
    `);

    expect(serversOf(doc).production.pathname).toBe("/{tenant}/orders");
    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      tenant: { default: "acme" },
    });
  });

  it("reads the templates of host and pathname as one set", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        pathname: "/{tenant}/{stage}",
        variables: #{
          env: #{ default: "prod" },
          tenant: #{ default: "acme" },
          stage: #{ default: "v1" }
        }
      })
      namespace Test;
    `);

    expect(Object.keys(present(serversOf(doc).production.variables, "server variables"))).toEqual([
      "env",
      "tenant",
      "stage",
    ]);
  });

  it("emits a variable with no field at all as an empty object", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{ env: #{} }
      })
      namespace Test;
    `);

    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({ env: {} });
  });

  it("emits each variable field on its own, without the other three", async () => {
    // The builder writes `enum`, `default`, `description` and `examples`
    // one at a time, each behind its own guard. The first test above passes
    // all four fields, and the test above passes none. Neither shape can
    // tell the four guards apart. Four variables that each carry one field
    // pin them separately. `enum` alone must not pull in a `default`, and a
    // lone `description` must survive with no sibling.
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{a}.{b}.{c}.{d}.example.com",
        protocol: "kafka",
        variables: #{
          a: #{ \`enum\`: #["one", "two"] },
          b: #{ default: "only-default" },
          c: #{ description: "Only a description." },
          d: #{ examples: #["only-example"] }
        }
      })
      namespace Test;
    `);

    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      a: { enum: ["one", "two"] },
      b: { default: "only-default" },
      c: { description: "Only a description." },
      d: { examples: ["only-example"] },
    });
  });

  it("omits the variables field when the server declares none", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{ host: "kafka.example.com", protocol: "kafka" })
      namespace Test;
    `);

    expect(serversOf(doc).production).not.toHaveProperty("variables");
  });

  it("trims a variable field and drops it when it is blank", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{
          env: #{ default: "  prod  ", description: "   ", \`enum\`: #[" prod ", "  "] }
        }
      })
      namespace Test;
    `);

    // The blank entry of the list is reported. The variable itself survives,
    // so the diagnostic is a warning and the document is still written.
    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/blank-server-variable-value",
        severity: "warning",
        message: /The `enum` of the server variable 'env' holds an entry that is blank/,
      },
    ]);
    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      env: { enum: ["prod"], default: "prod" },
    });
  });

  it("emits the examples of a variable", async () => {
    const doc = await emitDocument(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{
          env: #{ examples: #["prod", "sit"], default: "prod" }
        }
      })
      namespace Test;
    `);

    // `examples` carries no `uniqueItems` in the specification, unlike
    // `enum`, so it is emitted as written.
    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      env: { examples: ["prod", "sit"], default: "prod" },
    });
  });

  it("drops a repeated enum value and reports it", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{
          env: #{ \`enum\`: #["prod", "prod", "sit"], default: "prod" }
        }
      })
      namespace Test;
    `);

    // AsyncAPI declares `enum` with `uniqueItems`, so a repeat makes the
    // whole document fail validation. The first entry wins, which keeps the
    // order the author wrote.
    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-server-variable-value",
        severity: "warning",
        message: /names 'prod' more than once/,
      },
    ]);
    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      env: { enum: ["prod", "sit"], default: "prod" },
    });
  });

  it("reports a value that repeats three times only once", async () => {
    // A repeat is one mistake, however many times it is written. The
    // reporter remembers the values it has already named, so the third
    // occurrence adds no second diagnostic. Two occurrences never reach
    // that guard, so this needs a third one.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{
          env: #{ \`enum\`: #["prod", "prod", "prod", "sit"], default: "prod" }
        }
      })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-server-variable-value",
        severity: "warning",
        message: /names 'prod' more than once/,
      },
    ]);
    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      env: { enum: ["prod", "sit"], default: "prod" },
    });
  });

  it("reports a repeat that only the trim creates", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{
          env: #{ \`enum\`: #["prod", " prod "], default: "prod" }
        }
      })
      namespace Test;
    `);

    // The author wrote two different strings, so nothing looks wrong at the
    // call site. The trim makes them one value, and without this report the
    // document would fail validation with no mistake the author could see.
    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/duplicate-server-variable-value",
        severity: "warning",
        message: /names 'prod' more than once/,
      },
    ]);
    expect(resolveServerVariables(doc, serversOf(doc).production.variables)).toEqual({
      env: { enum: ["prod"], default: "prod" },
    });
  });

  it("trims the examples of a variable and drops the blank ones", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{ env: #{ default: "prod", examples: #[" v1 ", "  "] } }
      })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/blank-server-variable-value",
        severity: "warning",
        message: /The `examples` of the server variable 'env' holds an entry that is blank/,
      },
    ]);
    expect(resolveServerVariables(doc, serversOf(doc).production.variables).env.examples).toEqual([
      "v1",
    ]);
  });

  it("reports and drops the examples field when every entry is blank", async () => {
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{ env: #{ default: "prod", examples: #["  ", ""] } }
      })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/blank-server-variable-value",
        severity: "warning",
        message: /The `examples` of the server variable 'env' holds an entry that is blank/,
      },
    ]);
    expect(present(serversOf(doc).production.variables, "server variables").env).not.toHaveProperty(
      "examples",
    );
  });

  it("reports an enum whose entries are all blank, rather than dropping it in silence", async () => {
    // The list vanishes here, so the variable ends up with no constraint at
    // all. That is the opposite of what the author wrote. The whole list is
    // also what the `default`-not-in-`enum` check reads, so a silent drop
    // would take that check out as well.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com:9092",
        protocol: "kafka",
        variables: #{ env: #{ default: "prod", \`enum\`: #["  ", ""] } }
      })
      namespace Test;
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/blank-server-variable-value",
        severity: "warning",
        message: /The `enum` of the server variable 'env' holds an entry that is blank/,
      },
    ]);
    expect(resolveServerVariables(doc, serversOf(doc).production.variables).env).toEqual({
      default: "prod",
    });
  });

  it("never receives a variable named __proto__, because the compiler drops the key", async () => {
    // A server name and a security scheme name are plain string arguments,
    // so `__proto__` reaches this emitter and both maps keep it. A variable
    // name is an object key instead. The compiler marshals an object value
    // with `result[key] = ...`, so `__proto__` writes the prototype and the
    // entry is gone before any decorator of this library runs.
    //
    // This test pins that boundary. It fails if the compiler starts to
    // carry the key through, which is the moment the maps below have to be
    // checked for a real entry rather than for none.
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{__proto__}.kafka.example.com",
        protocol: "kafka",
        variables: #{ \`__proto__\`: #{ default: "prod" } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    // The template survives, and it has nothing to point at.
    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/undeclared-server-variable",
        severity: "warning",
        message: /The template '\{__proto__\}' in this server has no matching entry/,
      },
    ]);
    const server = buildServersFrom(runner.program, Test)?.production;
    expect(server).not.toHaveProperty("variables");
  });

  it("reports a template that has no matching variable and keeps the server", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        pathname: "/{tenant}",
        variables: #{ env: #{ default: "prod" } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/undeclared-server-variable",
        severity: "warning",
        message: /The template '\{tenant\}' in this server has no matching entry/,
      },
    ]);
    // The server survives, the other variable stays, and the template text
    // is left exactly as the author wrote it.
    expect(buildServersFrom(runner.program, Test)).toEqual({
      production: {
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        pathname: "/{tenant}",
        variables: { env: { default: "prod" } },
      },
    });
  });

  it("reports a variable that no template uses and still emits it", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "kafka.example.com",
        protocol: "kafka",
        variables: #{ env: #{ default: "prod" } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/unused-server-variable",
        severity: "warning",
        message: /The variable 'env' is declared on this server/,
      },
    ]);
    expect(buildServersFrom(runner.program, Test)?.production.variables).toEqual({
      env: { default: "prod" },
    });
  });

  it("reports a default that the enum of the same variable forbids", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{ env: #{ default: "uat", \`enum\`: #["prod", "sit"] } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnostics(diagnostics, [
      {
        code: "tsp-asyncapi/server-variable-default-not-in-enum",
        severity: "warning",
        message: /The variable 'env' has the default 'uat'/,
      },
    ]);
    expect(buildServersFrom(runner.program, Test)?.production.variables).toEqual({
      env: { enum: ["prod", "sit"], default: "uat" },
    });
  });

  it("emits a variable that carries no default", async () => {
    // The builder writes each variable field on its own, and only when the
    // field holds a value. Every other case here gives the variable a
    // `default`, so the absent side of that one guard is never taken. A
    // variable with no `default` is legal AsyncAPI: the enum still
    // constrains the value, and the reader must then supply one.
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{
          env: #{
            \`enum\`: #["prod", "sit"],
            description: "The environment.",
            examples: #["prod"]
          }
        }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    expect(buildServersFrom(runner.program, Test)?.production.variables).toEqual({
      env: {
        enum: ["prod", "sit"],
        description: "The environment.",
        examples: ["prod"],
      },
    });
  });

  it("omits the variables field when the map is written but holds no entry", async () => {
    // The resolver returns `undefined` when no variable survives, and the
    // server then carries no `variables` key at all. An empty map is the
    // shortest input that reaches that return: the host has no template, so
    // nothing is reported, and the map contributes no entry either.
    const { doc, diagnostics } = await emitDocumentWithDiagnostics(`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "kafka.example.com:9092",
        protocol: "kafka",
        variables: #{}
      })
      namespace Test;
    `);

    expectDiagnosticEmpty(diagnostics);
    expect(serversOf(doc).production).not.toHaveProperty("variables");
  });

  it("keeps the recorded variables safe from a change to the returned copy", async () => {
    const runner = await AsyncAPITester.createInstance();
    const [{ Test }, diagnostics] = await runner.compileAndDiagnose(t.code`
      @service(#{ title: "Orders" })
      @server("production", #{
        host: "{env}.kafka.example.com",
        protocol: "kafka",
        variables: #{ env: #{ default: "prod", \`enum\`: #["prod"] } }
      })
      namespace ${t.namespace("Test")} {}
    `);

    expectDiagnosticEmpty(diagnostics);
    const first = getServers(runner.program, Test);
    const recorded = first[0].variables?.env ?? {};
    recorded.default = "mutated";
    recorded.enum?.push("mutated");

    expect(getServers(runner.program, Test)[0].variables).toEqual({
      env: { enum: ["prod"], default: "prod" },
    });
  });
});
