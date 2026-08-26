import { buildPayloadModel } from "#emitter/schema-artifacts/protobuf/model.js";
import { buildAvroRecordWithDiagnostics } from "#avro/unstable.js";
import { compileWithProtobuf, messageModelNamed } from "../utils/protobuf-parity.js";
import { compileAvro, avroModelNamed } from "../utils/avro.js";
import {
  describeWalkConformance,
  type ConformanceCase,
  type WalkOutcome,
} from "../utils/walk-conformance.js";

/**
 * The shared contract, run against both schema walks.
 *
 * The suite itself is in `test/utils/walk-conformance.ts`, along with the
 * reasoning for a shared suite rather than shared code. This file supplies
 * what only each walk can supply: the sources, written in that walk's own
 * decorators, and the call that runs one.
 */

/** The package every Protobuf case here declares. */
const PROTO_PACKAGE = '@Protobuf.package({ name: "com.example.conformance" })';

/** The namespace every Avro case here declares. */
const AVRO_NAMESPACE = '@Avro.avroNamespace("com.example.conformance")';

describeWalkConformance({
  name: "Protobuf",
  async run(one: ConformanceCase): Promise<WalkOutcome> {
    const program = await compileWithProtobuf(one.source);
    const built = buildPayloadModel(program, messageModelNamed(program, one.root));
    if (built !== undefined) return { kind: "built" };
    return { kind: "refused", diagnostics: program.diagnostics.map((one) => one.code) };
  },
  sources: {
    selfRecursion: {
      root: "Node",
      source: `
        ${PROTO_PACKAGE}
        namespace Conformance;

        @Protobuf.message
        model Node {
          @Protobuf.field(1) value: string;
          @Protobuf.field(2) children: Node[];
        }
      `,
    },
    mutualRecursion: {
      root: "Parent",
      source: `
        ${PROTO_PACKAGE}
        namespace Conformance;

        @Protobuf.message
        model Parent {
          @Protobuf.field(1) child: Child;
        }

        model Child {
          @Protobuf.field(1) parent: Parent;
        }
      `,
    },
    nameCollision: {
      root: "Event",
      source: `
        ${PROTO_PACKAGE}
        namespace Conformance {
          namespace One {
            model Detail {
              @Protobuf.field(1) a: string;
            }
          }

          namespace Two {
            model Detail {
              @Protobuf.field(1) b: string;
            }
          }

          @Protobuf.message
          model Event {
            @Protobuf.field(1) first: One.Detail;
            @Protobuf.field(2) second: Two.Detail;
          }
        }
      `,
    },
    crossKindCollision: {
      root: "Event",
      source: `
        ${PROTO_PACKAGE}
        namespace Conformance {
          namespace One {
            model Detail {
              @Protobuf.field(1) a: string;
            }
          }

          namespace Two {
            enum Detail {
              first: 0,
            }
          }

          @Protobuf.message
          model Event {
            @Protobuf.field(1) first: One.Detail;
            @Protobuf.field(2) second: Two.Detail;
          }
        }
      `,
    },
  },
});

describeWalkConformance({
  name: "Avro",
  async run(one: ConformanceCase): Promise<WalkOutcome> {
    const program = await compileAvro(one.source);
    const [built, diagnostics] = buildAvroRecordWithDiagnostics(
      program,
      avroModelNamed(program, one.root),
    );
    if (built !== undefined) return { kind: "built" };
    return { kind: "refused", diagnostics: diagnostics.map((one) => one.code) };
  },
  sources: {
    selfRecursion: {
      root: "Node",
      source: `
        ${AVRO_NAMESPACE}
        namespace Conformance;

        @Avro.avroRecord
        model Node {
          value: string;
          children: Node[];
        }
      `,
    },
    mutualRecursion: {
      root: "Parent",
      source: `
        ${AVRO_NAMESPACE}
        namespace Conformance;

        @Avro.avroRecord
        model Parent {
          child: Child;
        }

        model Child {
          parent: Parent[];
        }
      `,
    },
    nameCollision: {
      root: "Event",
      source: `
        ${AVRO_NAMESPACE}
        namespace Conformance {
          namespace One {
            model Detail {
              a: string;
            }
          }

          namespace Two {
            model Detail {
              b: string;
            }
          }

          @Avro.avroRecord
          model Event {
            first: One.Detail;
            second: Two.Detail;
          }
        }
      `,
    },
    crossKindCollision: {
      root: "Event",
      source: `
        ${AVRO_NAMESPACE}
        namespace Conformance {
          namespace One {
            model Detail {
              a: string;
            }
          }

          namespace Two {
            enum Detail {
              first,
            }
          }

          @Avro.avroRecord
          model Event {
            first: One.Detail;
            second: Two.Detail;
          }
        }
      `,
    },
  },
});
