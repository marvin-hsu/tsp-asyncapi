import { describe, expect, it } from "vitest";
import { findDiagnostic } from "../../../../utils/diagnostics.js";
import { refusePayload, renderPayload } from "../../../../utils/protobuf-parity.js";

/** The package declaration every case here shares. */
const PACKAGE = '@Protobuf.package({ name: "com.example.render" })';

/**
 * The printer, and the dead ends of the walk that feeds it.
 *
 * Parity says the two emitters mean the same thing. It says nothing about the
 * text this one writes, because a descriptor carries no comment and no
 * layout. These cases cover that half.
 *
 * They also cover the other outcome of the walk. A construct with no proto3
 * form ends the walk, and the walk then yields nothing at all. Nothing here
 * asserts on a half built payload, because there is no such thing.
 */
describe("Unit: Protobuf payload rendering (Phase 16 W1)", () => {
  it("writes the syntax line, the package, and the fields in source order", async () => {
    const text = await renderPayload(
      `
      ${PACKAGE}
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(3) third: string;
        @Protobuf.field(1) first: int32;
      }
    `,
      "Event",
    );

    expect(text).toBe(
      [
        'syntax = "proto3";',
        "",
        "package com.example.render;",
        "",
        "message Event {",
        "  string third = 3;",
        "  int32 first = 1;",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("writes documentation as leading comments", async () => {
    const text = await renderPayload(
      `
      ${PACKAGE}
      namespace Render;

      @doc("The event a channel carries.")
      @Protobuf.message
      model Event {
        @doc("When it happened.")
        @Protobuf.field(1)
        at: int64;
      }
    `,
      "Event",
    );

    expect(text).toContain("// The event a channel carries.\nmessage Event {");
    expect(text).toContain("  // When it happened.\n  int64 at = 1;");
  });

  it("writes an empty message on one line", async () => {
    const text = await renderPayload(
      `
      ${PACKAGE}
      namespace Render;

      @Protobuf.message
      model Ping {}
    `,
      "Ping",
    );

    expect(text).toContain("message Ping {}");
  });

  it("writes an alias option when two variants share a value", async () => {
    const text = await renderPayload(
      `
      ${PACKAGE}
      namespace Render;

      enum Status { Unknown: 0, Active: 1, Running: 1 }

      @Protobuf.message
      model Job {
        @Protobuf.field(1) status: Status;
      }
    `,
      "Job",
    );

    expect(text).toContain("enum Status {\n  option allow_alias = true;\n  Unknown = 0;");
  });

  it("writes no package line when the package declares no name", async () => {
    const text = await renderPayload(
      `
      @Protobuf.package
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) id: string;
      }
    `,
      "Event",
    );

    expect(text.startsWith('syntax = "proto3";\n\nmessage Event {')).toBe(true);
  });

  /**
   * Each case below is a dead end of the walk. The helper asserts the walk
   * yielded nothing, and the assertion here names which report it made.
   */
  it("refuses a model with no package above it", async () => {
    const diagnostics = await refusePayload(
      `
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) id: string;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "no namespace above it carries @Protobuf.package",
    );
  });

  it("refuses a property with no field number", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) id: string;
        unnumbered: string;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "no @Protobuf.field number",
    );
  });

  it("refuses a scalar whose chain reaches no proto3 type", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      scalar Moment extends utcDateTime;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) at: Moment;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "has no proto3 type",
    );
  });

  it("refuses a union property", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) either: string | int32;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "of kind Union",
    );
  });

  it("refuses an anonymous model property", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) inline: { @Protobuf.field(1) id: string };
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "an anonymous model",
    );
  });

  it("refuses a template instantiation", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      model Box<T> {
        @Protobuf.field(1) value: T;
      }

      @Protobuf.message
      model Event {
        @Protobuf.field(1) boxed: Box<string>;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "a template instantiation",
    );
  });

  it("refuses a well known type that needs an import", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) nothing: Protobuf.WellKnown.Empty;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "@Protobuf.externRef",
    );
  });

  it("refuses a Protobuf map until the walk learns to write one", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      @Protobuf.message
      model Event {
        @Protobuf.field(1) labels: Protobuf.Map<string, string>;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "a Protobuf.Map type",
    );
  });

  it("refuses an enum whose first variant is not zero", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      enum Status { Active: 1, Retired: 2 }

      @Protobuf.message
      model Event {
        @Protobuf.field(1) status: Status;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "whose first variant is not zero",
    );
  });

  it("refuses an enum whose variants are not integers", async () => {
    const diagnostics = await refusePayload(
      `
      ${PACKAGE}
      namespace Render;

      enum Status { Unknown: "none" }

      @Protobuf.message
      model Event {
        @Protobuf.field(1) status: Status;
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "not an integer",
    );
  });

  it("refuses a model of another package, which would need an import", async () => {
    const diagnostics = await refusePayload(
      `
      @Protobuf.package({ name: "com.example.other" })
      namespace Other {
        model Shared {
          @Protobuf.field(1) id: string;
        }
      }

      ${PACKAGE}
      namespace Render {
        @Protobuf.message
        model Event {
          @Protobuf.field(1) shared: Other.Shared;
        }
      }
    `,
      "Event",
    );

    expect(findDiagnostic(diagnostics, "protobuf-artifact-unavailable").message).toContain(
      "another Protobuf package",
    );
  });
});
