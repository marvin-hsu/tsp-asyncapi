# 05 — Channels and parameters

Addressing. Four channels, each showing one part of it.

It is also the first example with `@receive`, on the one channel this
application receives on.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/05-channels-and-parameters
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

## The four channels

| Channel key      | Declared on                | What it shows                       | Operation            |
| ---------------- | -------------------------- | ----------------------------------- | -------------------- |
| `DeviceReadings` | `interface DeviceReadings` | a templated address with parameters | `sendDeviceReading`  |
| `device-alarms`  | `interface DeviceAlarms`   | an explicit channel id              | `sendDeviceAlarm`    |
| `device-replies` | `interface DeviceReplies`  | `@dynamicChannel`, address unknown  | `onDeviceReply`      |
| `Firmware`       | `namespace Firmware`       | a channel on a namespace scope      | `sendFirmwareReport` |

## Where a channel can sit

`@channel` targets an interface or a namespace. Both are scopes. The channel
owns the operations declared directly inside its own scope.

A nested interface is a separate scope. A namespace nested inside a namespace
is a separate scope too. Each of them may carry a channel of its own, so a
namespace-level channel never absorbs everything below it.

## Schema keys under a nested namespace

`namespace Firmware` is the first nested namespace in this series, so this is
the first emitted document with a qualified schema key.

`model FirmwareReport` sits inside `Firmware`. Its `components.schemas` key
is `Firmware.FirmwareReport`. Its `components.messages` key is
`FirmwareReport`, with no prefix, and the payload `$ref` of that message
points at the dotted schema key.

The two keys are built by different rules. A schema key carries the
enclosing namespaces. A message key does not. Example 02 states both rules in
full, under "How a schema key is named".

## The channel key

The key in the emitted `channels` map is the declaration name of the
interface or the namespace. The second argument of `@channel` overrides it.

`interface DeviceAlarms` carries `@channel("telemetry.alarms",
"device-alarms")`, so the key is `device-alarms`.

## Address parameters

An address may hold `{name}` expressions. Each name must be declared by a
parameter of an operation the channel owns. The match runs both ways.

- A `{name}` with no declaration is reported as `missing-channel-param`.
- A declaration the address never uses is reported as
  `unused-channel-param`.

A parameter whose type carries `@message` is a message declaration. It takes
no part in the matching in either direction. That is why `event` is not
treated as an address parameter.

That rule does not depend on the action. `sendDeviceReading` mixes two
address parameters with one message parameter, and the emitted channel still
carries `region` and `deviceId` under `parameters`.

A channel parameter must be required, and its type must be a string type. An
optional one is reported, and so is a non-string one.

Two operations of one channel may declare the same parameter. The two
declarations must agree. Each field they disagree about is reported, and the
first declaration in source order is the one that reaches the document.

## What fills a Parameter Object

AsyncAPI 3 defines five fields on a channel parameter. Here is where each one
comes from.

| Field         | Source                                                    |
| ------------- | --------------------------------------------------------- |
| `enum`        | the declared type, when it names a limited set of strings |
| `default`     | the TypeSpec default value of the parameter               |
| `description` | `@doc`, or a `/** ... */` doc comment                     |
| `examples`    | `@example`, one entry per application, in source order    |
| `location`    | `@parameterLocation`                                      |

An enum, a union of string literals, and a string literal each name a limited
set, so each one produces `enum`. A plain `string` names no limited set, so it
produces no `enum` at all. `deviceId` shows that case.

There is no `schema` field on an AsyncAPI 3 channel parameter. The declared
type reaches the document through `enum` and nothing else.

## `@parameterLocation`

The argument is a runtime expression, such as
`$message.payload#/deviceId`. It names where the parameter value sits at
runtime.

The emitter checks the shape of the expression. It does not check that the
pointer names a field any schema declares. `@correlationId` follows the same
rule.

## `@dynamicChannel`

Use it when the address is only known at runtime. The emitted channel carries
the literal `address: null`, which AsyncAPI reads as "unknown".

It is a separate decorator, and not a `@channel` with the address left out.
That keeps "the address is unknown" apart from "the address was forgotten".

The only argument is the channel id. It is not an address. It overrides the
key in the emitted `channels` map, the way the second argument of `@channel`
does. So `@dynamicChannel("device-replies")` on `interface DeviceReplies`
gives the key `device-replies`.

A dynamic channel has no address, so it never carries `parameters`.

Apply `@channel` and `@dynamicChannel` to one target, and the emitter reports
it. Apply either of them twice to one target, and it reports that too.

## `@useServer`

`@useServer` limits a channel to the servers it names. It is repeatable, and
the references keep their source order.

The emitted `servers` array holds references into the root `servers` map. A
channel with no `@useServer` carries no `servers` field, which AsyncAPI reads
as "available on every server".

The name is not checked against the declared servers. A name that no
`@server` declares produces a reference that resolves to nothing.

A `@useServer` on a target that carries no channel reaches no part of the
document. The emitter reports that as `use-server-without-channel`.

## The four operations

Every operation here carries an action decorator, so each one reaches the
`operations` map.

Three of them carry `@send`. `sendDeviceReading`, `sendDeviceAlarm` and
`sendFirmwareReport` are the messages this application produces.

`onDeviceReply` carries `@receive`, because a dynamic reply channel is one
this application receives on.

**The signature rule.** For `@send` the parameters are the messages sent, and
the return type is the messages of the reply. For `@receive` the parameters
are the messages of the reply, and the return type is the messages received.

So `onDeviceReply` is written `op onDeviceReply(): DeviceAlarm;`. It takes no
parameter, and `DeviceAlarm` sits in the return type. Example 07 uses the
inverted form again, where the reply is the subject.

The key of an emitted operation is the name of the operation, and that key is
document-wide. A name shared by two operations reports
`duplicate-operation-id`, and the first one in source order keeps the key. The
channel scope makes no difference, so `sendFirmwareReport` in
`namespace Firmware` needs a name no other operation uses. Pass an argument to
`@send` or `@receive` to set the key yourself.

## Next

Read [06-servers-and-security](../06-servers-and-security/) for the
connection side.
