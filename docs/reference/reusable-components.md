---
outline: 2
---

# Reusable components

A component in `components` can be referenced from many places with `$ref`. The emitter decides on its own what goes there to be shared.

## `components`

| Section             | What goes there                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `schemas`           | Every named model, enum, union, and user-declared scalar. A schema written in another language, on its second use |
| `serverVariables`   | Every server address variable                                                                                     |
| `messages`          | Every `@message` model                                                                                            |
| `securitySchemes`   | Every `@securityScheme`                                                                                           |
| `parameters`        | Every channel address parameter                                                                                   |
| `correlationIds`    | A `@correlationId` two or more messages state alike                                                               |
| `serverBindings`    | A Bindings Object two or more servers carry alike                                                                 |
| `channelBindings`   | A Bindings Object two or more channels carry alike                                                                |
| `operationBindings` | A Bindings Object two or more operations carry alike                                                              |
| `tags`              | Every tag                                                                                                         |
| `externalDocs`      | An `@externalDocs` two or more places carry alike                                                                 |

`messageBindings` follows the same rule as the other three binding sections.

## How a component is named

The key of a component is the name in the source.

| Component                          | Key                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| Tag                                | The `name` of the `@asyncTag`                                                     |
| Channel parameter, server variable | The name of the parameter or variable                                             |
| Model, enum, union, scalar         | The declaration name                                                              |
| Bindings Object                    | The name of the namespace, interface or model the binding decorator is applied to |
| External Documentation Object      | The name of the first object that carries it                                      |

A name with a character a `components` key does not allow is rewritten by the [schema key rules](./decorators/schemas#how-a-schema-key-is-built).

## When a property writes a scalar in place

A user-declared scalar goes into `components`, and a property that uses it writes a `$ref`.

If the property carries `@doc`, `@summary`, `@example`, `@format` or `@encode` of its own, it writes the scalar in place instead, with the property's own settings on top. A `$ref` cannot override the `description` or `format` the scalar already has.

```typespec
@doc("An RFC 5321 mailbox address.")
scalar Email extends string;

@message
model Signup {
  contact: Email;

  /** Where the receipt goes. */
  receipt: Email;
}
```

```yaml
components:
  schemas:
    Email:
      type: string
      description: An RFC 5321 mailbox address.
    Signup:
      type: object
      properties:
        contact:
          $ref: "#/components/schemas/Email"
        receipt:
          type: string
          description: Where the receipt goes.
```

A property that only constrains the value further still writes a `$ref`. Two constraints on one value both hold, and that is what `allOf` means.

```typespec
@maxLength(254)
scalar Email extends string;

@message
model Signup {
  @maxLength(64)
  short: Email;
}
```

```yaml
short:
  allOf:
    - $ref: "#/components/schemas/Email"
  maxLength: 64
```

## What the emitter does not extract

| Section                     | Why not                                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `servers`                   | AsyncAPI states that a channel's `servers` must point at the root `servers` map. A server in `components` has no reader.                                               |
| `channels`                  | An operation addresses the root `channels` map. Only a channel that no operation points at could go here.                                                              |
| `operations`                | Nothing in one document refers to an operation, so an entry here is text no tool resolves.                                                                             |
| `replies`, `replyAddresses` | Two identical Operation Reply Objects mean two operations share a channel and a set of messages. That is a fact worth reporting to the author, not one to deduplicate. |
