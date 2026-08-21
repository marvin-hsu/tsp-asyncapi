---
title: "Messages"
description: "Marks a model as an AsyncAPI message. Each marked model becomes an entry in `components.messages`, with its `payload` referencing the model's schema."
---

# Messages

## `@message`

```typespec
extern dec message(target: Model, name?: valueof string);
```

Marks a model as an AsyncAPI message. Each marked model becomes an entry in `components.messages`, with its `payload` referencing the model's schema.

The target must be a `Model`. A message whose payload is a single scalar has to wrap that scalar in a model.

```typespec
@message
model OrderCreated {
  orderId: string;
  amount: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      payload:
        $ref: "#/components/schemas/OrderCreated"
  schemas:
    OrderCreated:
      type: object
      properties:
        orderId:
          type: string
        amount:
          type: number
          format: double
      required:
        - orderId
        - amount
```

The optional argument overrides the key:

```typespec
@message("order.created.v1")
model OrderCreated {
  orderId: string;
}
```

Two points worth knowing:

- **Only reachable models are emitted.** `components.schemas` holds the models a message reaches, directly or through its properties. A model no message references is left out.
- **A message key drops the namespace prefix that a schema key keeps.** A `@message model Ev` inside `namespace Sales` produces the message key `Ev` and the schema key `Sales.Ev`. When a message key happens to match a different type's schema key, the emitter reports [`message-key-shadows-schema-key`](../diagnostics#message-key-shadows-schema-key).

## `@contentType`

```typespec
extern dec contentType(target: Model, contentType: valueof string);
```

Sets the media type of a message payload. Without it the field is left out, and the document-level `defaultContentType` applies.

```typespec
@message
@contentType("application/avro")
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      contentType: application/avro
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

The emitter passes the string through untouched. It never parses the media type or changes the payload schema because of it.

Apply the decorator once per model. A message carries one content type, so a second application is reported as [`duplicate-content-type-decorator`](../diagnostics#duplicate-content-type-decorator).

The media type must not be empty. A blank one names no format, so it is reported as [`empty-content-type`](../diagnostics#empty-content-type) and dropped. The message then falls back to the document-level `defaultContentType`.

## `@header`

```typespec
extern dec header(target: ModelProperty);
```

Marks one field of a message model as a message header. The emitter lifts every marked field out of the payload schema and collects them into the message's `headers` schema. The payload keeps the fields that carry no mark.

```typespec
@message
model OrderCreated {
  @header
  correlationId: string;

  @header
  retryCount?: int32;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
          retryCount:
            type: integer
            format: int32
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
  schemas:
    OrderCreatedPayload:
      type: object
      properties:
        orderId:
          type: string
      required:
        - orderId
```

Five points worth knowing:

- **It takes no name argument.** `@typespec/http`'s `@header` has one because HTTP renames a field to kebab-case. AsyncAPI application headers have no such convention. Use [`@encodedName`](#built-in-decorators-the-emitter-reads) to give a header a key that is not a TypeSpec identifier, the same way you rename a payload field.
- **Only a top-level field of a `@message` model is lifted.** A mark further down the payload is reported as [`nested-header-ignored`](../diagnostics#nested-header-ignored), and the field stays in the payload. Use `@headers` for a headers object with nesting of its own.
- **`extends` and `...` differ here.** A spread, `...Base`, copies the properties into the message model, so a marked property is the message's own field and it is lifted. An `extends Base` keeps the property on the base model, which the payload refers to through `allOf`. Lifting it would change every other model that extends the same base, so the emitter leaves it in place and reports [`inherited-header-ignored`](../diagnostics#inherited-header-ignored).
- **The payload gets a component of its own.** Lifting is local to the message. The model's own `components.schemas` entry keeps every field, so a subtype, another message's field, and any other reader still see the whole shape. The message points at a second component keyed `<Model>Payload`, which holds the fields that stayed. A model you already named `<Model>Payload` yourself is reported as [`duplicate-schema-key`](../diagnostics#duplicate-schema-key), and the message falls back to the model's own component.
- **A header field named `content-type` conflicts with `@contentType`.** AsyncAPI has one field for the content type, so the emitter reports [`content-type-header-conflict`](../diagnostics#content-type-header-conflict) rather than picking a source.

## `@headers`

```typespec
extern dec headers(target: Model, headers: Model);
```

Sets the whole `headers` schema of a message from a separate model. Use it when the headers are a model of their own, and when they nest. The emitter emits that model into `components.schemas` and references it, so several messages can share one headers definition.

```typespec
model MqmdFields {
  CorrelId: string;
}

model ShippingHeaders {
  MQMD: MqmdFields;
}

@message
@headers(ShippingHeaders)
model OrderShipped {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderShipped:
      name: OrderShipped
      headers:
        $ref: "#/components/schemas/ShippingHeaders"
      payload:
        $ref: "#/components/schemas/OrderShipped"
```

The model must be an object type. AsyncAPI requires the headers schema to describe a key/value map, so an array-backed model is reported as [`headers-not-object`](../diagnostics#headers-not-object).

Do not mix this with a field-level `@header` or a `@rawHeaders` on the same message. Two sources for one headers object have no obvious winner, so the emitter reports [`duplicate-message-headers`](../diagnostics#duplicate-message-headers) and emits neither.

A `content-type` property of the headers model conflicts with `@contentType` on the message, exactly as a field-level `@header` of that name does. The emitter reports [`content-type-header-conflict`](../diagnostics#content-type-header-conflict). Inherited properties of the headers model are checked too.

## `@rawPayload`

```typespec
extern dec rawPayload(target: Model, schemaFormat: valueof string, schema: valueof unknown);
```

Describes the payload of a message with a schema of another format, such as Avro or Protobuf. AsyncAPI calls the result a Multi Format Schema Object. The emitter writes `schemaFormat` and `schema` into the message, and it emits `schema` exactly as written.

The emitter never reads inside the schema. So it cannot check the schema against the format, and it cannot check it against the model.

```typespec
@message
@contentType("application/avro")
@rawPayload(
  "application/vnd.apache.avro;version=1.9.0",
  #{
    type: "record",
    name: "OrderCreated",
    fields: #[#{ name: "orderId", type: "string" }],
  }
)
model OrderCreated {}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      contentType: application/avro
      payload:
        schemaFormat: application/vnd.apache.avro;version=1.9.0
        schema:
          type: record
          name: OrderCreated
          fields:
            - name: orderId
              type: string
```

The model describes nothing that reaches this message. It stops being a root of the schema walk, so it claims no `components.schemas` key of its own. Neither do the models it refers to. It is not exempt from that walk. Another message that reaches this model, or one it refers to, still collects it. The collected model then gets its ordinary `components.schemas` entry, properties and all. The model is a carrier for the message decorators, so give it an empty body.

The raw schema is written into the message itself, never into `components.schemas`. So two messages cannot share one raw schema yet.

`schema` is a value of any shape. An object value is the usual form. A string and an array are legal too, because AsyncAPI types the field as `any`.

An Avro field named `namespace` needs backticks, because `namespace` is a TypeSpec keyword: ``#{ `namespace`: "com.example" }``.

The `schemaFormat` values AsyncAPI requires or recommends are accepted without a word. Any other value is emitted too, with the [`unknown-schema-format`](../diagnostics#unknown-schema-format) warning. A blank value is reported as [`empty-schema-format`](../diagnostics#empty-schema-format), and the message then falls back to the schema built from the model.

Two rules hold between the format and the schema, and the emitter reports both. A format that is not JSON based, such as Protobuf, needs its schema written as a string; an object is reported as [`non-string-raw-schema`](../diagnostics#non-string-raw-schema). A top-level `$ref` that starts with `#/` points into this document, where every schema is an AsyncAPI Schema Object; any other format is reported as [`raw-schema-local-ref`](../diagnostics#raw-schema-local-ref). The schema is emitted as written in both cases.

A top-level `$ref` is resolved as well, in every format. A reference that reaches nothing in the finished document is reported as [`unresolved-raw-schema-ref`](../diagnostics#unresolved-raw-schema-ref).

Do not mix this with a field-level `@header` on the same message. A lifted field leaves the payload schema, and the emitter cannot take a field out of a schema it does not read. It reports [`raw-payload-lifted-header`](../diagnostics#raw-payload-lifted-header) and emits both halves. Describe the headers with `@headers` or `@rawHeaders` instead. Both combine with this decorator, and neither is reported.

Apply this decorator only once per model. A second application is reported as [`duplicate-raw-payload-decorator`](../diagnostics#duplicate-raw-payload-decorator).

## `@rawHeaders`

```typespec
extern dec rawHeaders(target: Model, schemaFormat: valueof string, schema: valueof unknown);
```

Describes the headers of a message with a schema of another format. It fills the `headers` field with the same Multi Format Schema Object that `@rawPayload` fills `payload` with, and it follows the same rules for `schemaFormat` and `schema`.

```typespec
@message
@rawHeaders(
  "application/vnd.apache.avro;version=1.9.0",
  #{
    type: "record",
    name: "OrderHeaders",
    fields: #[#{ name: "traceId", type: "string" }],
  }
)
model OrderCreated {
  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        schemaFormat: application/vnd.apache.avro;version=1.9.0
        schema:
          type: record
          name: OrderHeaders
          fields:
            - name: traceId
              type: string
      payload:
        $ref: "#/components/schemas/OrderCreated"
```

This is the third way to describe the headers of a message. The other two are a field-level `@header` and a model given to `@headers`. Use one of the three. A message that names more than one is reported as [`duplicate-message-headers`](../diagnostics#duplicate-message-headers), and no `headers` are emitted at all.

Raw headers lift nothing out of the payload. So the payload still describes every field of the model.

Apply this decorator only once per model. A second application is reported as [`duplicate-raw-headers-decorator`](../diagnostics#duplicate-raw-headers-decorator).

## `@correlationId`

```typespec
extern dec correlationId(target: Model, location: valueof string, description?: valueof string);
```

Sets the message's `correlationId`. `location` is a runtime expression that names where the correlation value sits at runtime.

```typespec
@message
@correlationId("$message.header#/correlationId", "Ties a reply to its request.")
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      headers:
        type: object
        properties:
          correlationId:
            type: string
        required:
          - correlationId
      payload:
        $ref: "#/components/schemas/OrderCreatedPayload"
      correlationId:
        location: "$message.header#/correlationId"
        description: Ties a reply to its request.
```

A legal `location` is `$message.header#` or `$message.payload#`, each optionally followed by a JSON Pointer. Everything below is legal:

| Location                         | Meaning                           |
| -------------------------------- | --------------------------------- |
| `$message.header#`               | The headers object itself         |
| `$message.header#/correlationId` | One header                        |
| `$message.header#/MQMD/CorrelId` | A header nested two levels down   |
| `$message.payload#/order/id`     | A field nested inside the payload |

The `#` is required. The prose ABNF of the specification reads as if it were optional, but the normative JSON Schema of the specification requires it, and the official AsyncAPI parser rejects a document that carries the bare `$message.header`.

Anything else is reported as [`invalid-correlation-id-location`](../diagnostics#invalid-correlation-id-location), and no `correlationId` is emitted.

The emitter checks the format and nothing else. It does not check that the pointer names a field the headers or payload schema declares. AsyncAPI states no such requirement, and its own examples point at paths their schemas never define.

Apply the decorator once per model. A second application is reported as [`duplicate-correlation-id-decorator`](../diagnostics#duplicate-correlation-id-decorator).

## `@messageExample`

```typespec
extern dec messageExample(
  target: Model,
  example: valueof MessageExampleValue,
  options?: valueof MessageExampleOptions
);
```

Adds one worked example to a message. The argument's shape:

| Field             | Type              | Required |
| ----------------- | ----------------- | -------- |
| `example.headers` | `Record<unknown>` | no       |
| `example.payload` | `unknown`         | no       |
| `options.name`    | `string`          | no       |
| `options.summary` | `string`          | no       |

`headers` is a key/value map, because the AsyncAPI Message Example Object types it as `Map[string, any]`. `payload` is free-form, because the specification types it as `any`, so a scalar payload is legal.

Repeatable: each application adds one entry to the `examples` array, and the entries keep their source order. AsyncAPI's `examples` is an array, so one message can show several situations, each with its own `name`.

```typespec
@message
@messageExample(
  #{ headers: #{ correlationId: "abc-123" }, payload: #{ orderId: "o-1", total: 12.5 } },
  #{ name: "smallOrder", summary: "One line, already paid." }
)
@messageExample(#{ payload: #{ orderId: "o-2", total: 999.0 } }, #{ name: "largeOrder" })
model OrderCreated {
  @header
  correlationId: string;

  orderId: string;
  total: float64;
}
```

```yaml
components:
  messages:
    OrderCreated:
      name: OrderCreated
      examples:
        - name: smallOrder
          summary: One line, already paid.
          headers:
            correlationId: abc-123
          payload:
            orderId: o-1
            total: 12.5
        - name: largeOrder
          payload:
            orderId: o-2
            total: 999
```

Two points worth knowing:

- **Every example carries at least one of `headers` and `payload`.** An example with neither shows nothing about the message, so it is reported as [`empty-message-example`](../diagnostics#empty-message-example) and dropped.
- **The content is not checked against the message schema.** The value is emitted as written. A value the emitter cannot serialize to JSON, such as a custom scalar constructor, drops that whole entry and reports [`unserializable-message-example`](../diagnostics#unserializable-message-example).
