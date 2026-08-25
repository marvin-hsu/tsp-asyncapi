import "../dist/src/tsp-index.js";

using TypeSpec.Reflection;

namespace Avro;

extern dec `namespace`(target: Namespace, name: valueof string);
extern dec `record`(target: Model);
extern dec aliases(target: Model | ModelProperty | Enum, ...names: valueof string[]);
extern dec order(target: ModelProperty, mode: valueof string);
extern dec fixed(target: Model | Scalar, size: valueof int32);
extern dec logicalType(target: Scalar | ModelProperty, name: valueof string);
extern dec decimal(target: Scalar | ModelProperty, precision: valueof int32, scale?: valueof int32);
extern dec enumDefault(target: Enum, member: valueof string);
