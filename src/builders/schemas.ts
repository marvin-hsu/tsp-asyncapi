import {
  Program,
  Type,
  Model,
  Scalar,
  isArrayModelType,
  isRecordModelType,
} from "@typespec/compiler";
import { SchemaObject, ReferenceObject } from "../types/index.js";
import { reportDiagnostic } from "../lib.js";

/**
 * Builder for converting TypeSpec types to AsyncAPI Schema Objects.
 */
export class SchemaBuilder {
  private schemas: Record<string, SchemaObject> = {};

  constructor(private program: Program) {}

  public getSchemas(): Record<string, SchemaObject> {
    return this.schemas;
  }

  public buildSchema(type: Type): SchemaObject | ReferenceObject {
    switch (type.kind) {
      case "Model":
        return this.buildModelSchema(type);
      case "Scalar":
        return this.buildScalarSchema(type);
      case "Enum":
        // return this.buildEnumSchema(type);
        return { type: "string" };
      case "Union":
        // return this.buildUnionSchema(type);
        return {};
      default:
        return {};
    }
  }

  private building = new Set<Model>();
  private builtModels = new Map<string, Model>();
  private reportedCollisions = new Set<string>();

  private buildModelSchema(model: Model): SchemaObject | ReferenceObject {
    if (isArrayModelType(model)) {
      return {
        type: "array",
        items: this.buildSchema(model.indexer.value),
      };
    }

    if (isRecordModelType(model)) {
      return {
        type: "object",
        additionalProperties: this.buildSchema(model.indexer.value),
      };
    }

    if (model.name) {
      if (
        this.builtModels.has(model.name) &&
        this.builtModels.get(model.name) !== model &&
        !this.reportedCollisions.has(model.name)
      ) {
        this.reportedCollisions.add(model.name);
        reportDiagnostic(this.program, {
          code: "duplicate-schema-name",
          target: model,
          format: { name: model.name },
        });
      }

      if (Object.hasOwn(this.schemas, model.name) || this.building.has(model)) {
        return { $ref: `#/components/schemas/${model.name}` };
      }
      this.building.add(model);
      this.builtModels.set(model.name, model);
    }

    const schema: SchemaObject = {
      type: "object",
      properties: {},
    };
    const required: string[] = [];

    for (const prop of model.properties.values()) {
      const propSchema = this.buildSchema(prop.type);
      if (schema.properties) {
        schema.properties[prop.name] = propSchema;
      }
      if (!prop.optional) {
        required.push(prop.name);
      }
    }

    if (required.length > 0) {
      schema.required = required;
    }

    if (model.name) {
      this.schemas[model.name] = schema;
      this.building.delete(model);
      return { $ref: `#/components/schemas/${model.name}` };
    } else {
      return schema;
    }
  }

  private buildScalarSchema(scalar: Scalar): SchemaObject {
    switch (scalar.name) {
      case "string":
        return { type: "string" };
      case "boolean":
        return { type: "boolean" };
      case "int8":
        return { type: "integer", format: "int8" };
      case "int16":
        return { type: "integer", format: "int16" };
      case "int32":
        return { type: "integer", format: "int32" };
      case "int64":
      case "safeint":
        return { type: "integer", format: "int64" };
      case "uint8":
        return { type: "integer", format: "uint8" };
      case "uint16":
        return { type: "integer", format: "uint16" };
      case "uint32":
        return { type: "integer", format: "uint32" };
      case "uint64":
        return { type: "integer", format: "uint64" };
      case "float32":
        return { type: "number", format: "float" };
      case "float64":
        return { type: "number", format: "double" };
      case "decimal":
        return { type: "number", format: "decimal" };
      case "decimal128":
        return { type: "number", format: "decimal128" };
      case "bytes":
        return { type: "string", format: "byte" };
      case "plainDate":
        return { type: "string", format: "date" };
      case "plainTime":
        return { type: "string", format: "time" };
      case "utcDateTime":
      case "offsetDateTime":
        return { type: "string", format: "date-time" };
      case "duration":
        return { type: "string", format: "duration" };
      case "url":
        return { type: "string", format: "uri" };
      case "unknown":
        return {};
      default:
        // Default to checking base scalars if it's a derived scalar
        if (scalar.baseScalar) {
          return this.buildScalarSchema(scalar.baseScalar);
        }
        return { type: "string" }; // Fallback
    }
  }
}
