# 09 — Protocol bindings for every other protocol

One MQTT telemetry service. AsyncAPI puts a `bindings` object on four things:
a server, a channel, an operation, and a message. This example carries a
`@binding` on three of them. The channel carries none, because MQTT defines no
channel binding. That case is explained under
[It validates nothing](#it-validates-nothing).

Example 08 uses the four Kafka decorators. Kafka is the one protocol this
library types. MQTT, WebSocket, AMQP and HTTP have no decorator here. The
generic `@binding` carries all of them.

## Run it

Both steps run once, from the root of the repository. The emitter runs from
`dist/`, so `main.tsp` cannot resolve it before a build.

```bash
pnpm install
pnpm build
```

Then compile this example.

```bash
cd examples/09-protocol-bindings
tsp compile .
```

If `tsp` is not on your path, call `../../node_modules/.bin/tsp` instead.

## The signature

```typespec
extern dec binding(target: unknown, protocol: valueof string, config: valueof unknown);
```

`protocol` becomes the key inside the `bindings` object. `config` is written
exactly as given. `target` is supplied by the position of the decorator. You
never write it yourself.

## The level comes from the target

`@binding` names no level. The target of the decorator decides where the
binding lands. That is why the target type is `unknown`. All four positions
are reachable, and one decorator serves them all.

| Target                                    | Where the binding lands |
| ----------------------------------------- | ----------------------- |
| the service namespace                     | every server of it      |
| an interface or namespace with `@channel` | the channel             |
| an operation with `@send` or `@receive`   | the operation           |
| a model with `@message`                   | the message             |

A target that emits no such object reports `binding-outside-document`.

**One namespace can reach two levels.** A namespace can be both the service
namespace and a channel target. Put `@channel` on the service namespace, and a
`@binding` there reaches the server and the channel at once.

This example keeps the two apart. The service namespace `DeviceTelemetry`
carries no `@channel`. The channel sits on the interface
`DeviceTelemetryChannel` instead. When only one of the two levels is meant,
use the protocol-specific decorator.

## Every server gets a copy

The server binding sits on the service namespace. Every server that namespace
declares gets its own copy of it. `@server` is repeatable and keyed by name,
so no decorator target can single one server out.

This example declares one server, so one copy is written. Two servers of two
protocols in one namespace cannot carry two different server bindings. Split
them into two documents when they need to.

## You write the binding version

```yaml
servers:
  mqtt-prod:
    bindings:
      mqtt:
        clientId: telemetry-gateway
        cleanSession: false
        keepAlive: 60
        lastWill:
          topic: devices/status
          qos: 1
          message: gateway offline
          retain: false
        bindingVersion: 0.2.0
```

`bindingVersion: "0.2.0"` is written in `main.tsp`. `@binding` adds no version
of its own. It never reads the shape of the config, so it cannot know which
version the fields belong to.

The Kafka decorators of example 08 always write `bindingVersion: 0.5.0`. Those
decorators know their fields. This one does not.

## It validates nothing

The emitter checks two things about a raw binding. The protocol name must not
be blank, and the config must be an object. A blank name reports
`empty-binding-protocol`. A config that is not an object reports
`invalid-binding-config`. Both drop the whole binding.

Nothing inside the config is checked. No field name, no value, no type.

Read the binding specification of your protocol before you write the fields.
That is the only check there is.

The channel here shows what that costs. MQTT version `0.2.0` reserves its
channel binding object for future use. That object must contain no property at
all. `bindingVersion` is a property, so even the version is not allowed. So
this example writes no channel binding, and the emitted document has no
`bindings` under `channels.DeviceTelemetryChannel`.

The emitter would have accepted one. Write this and the document compiles:

```typespec
@binding("mqtt", #{ qos: 1, bindingVersion: "0.2.0" })
@channel("devices/{deviceId}/telemetry")
interface DeviceTelemetryChannel {}
```

Both fields then land on the channel object. `qos` is an MQTT operation field,
not a channel field. `bindingVersion` is a field the channel binding object
forbids. A validator rejects the result, and the emitter reports nothing.

## One protocol claims one member

One protocol claims one member per object. A second `@binding` for the same
protocol on the same target reports `duplicate-binding`. The emitter never
merges the two configs, and the later one never replaces the earlier one.

The rule holds across the two kinds of decorator. `@binding("kafka", ...)` on
a model that already carries `@kafkaMessage` reports `duplicate-binding`, and
so does the reverse order.

## Using `@binding` for Kafka

`@binding` is also the way to write a Kafka field the typed decorators do not
carry. A newer version of the Kafka bindings may add one. The typed decorators
accept the fields listed in [the bindings reference](../../docs/reference/bindings.md)
and no others.

Write the whole Kafka binding with `@binding("kafka", ...)` in that case, and
write `bindingVersion` yourself. Both decorators on one object collide, so the
typed decorator has to come off that object. It stays legal on the other three
levels, because the rule is per object.

## Previous

Read [08-kafka-user-signup](../08-kafka-user-signup/) for the four typed Kafka
bindings in one realistic contract.
