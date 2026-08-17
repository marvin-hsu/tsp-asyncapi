// Four streaming platforms, and the fields each one makes an author give.
//
// This is the example to read for required binding fields. Pulsar and Google
// Cloud Pub/Sub both refuse to be described without them, and the emitter
// reports `missing-binding-field` and drops the whole binding rather than
// writing a document AsyncAPI would reject.
//
// NATS and Solace require nothing, and are here to show how little some
// bindings say.
import "../..";

using AsyncAPI;

@service(#{ title: "Sensor Stream" })
@info(#{
  version: "1.0.0",
  description: "Sensor readings, streamed over four platforms.",
})
@server(
  "pulsar",
  #{ host: "pulsar.example.com:6650", protocol: "pulsar", title: "Pulsar cluster" }
)
@server(
  "nats",
  #{ host: "nats.example.com:4222", protocol: "nats", title: "NATS cluster" }
)
@server(
  "pubsub",
  #{ host: "pubsub.googleapis.com", protocol: "googlepubsub", title: "Pub/Sub" }
)
@server(
  "solace",
  #{ host: "solace.example.com:55555", protocol: "smf", title: "Solace broker" }
)
// A Pulsar topic is addressed as `<tenant>/<namespace>/<topic>`. The tenant
// is a server field and the namespace is a channel field, so one address is
// split across two objects.
@pulsarServer(#{ tenant: "telemetry" })
// `clientName` is at most 160 characters, which the emitter checks.
//
// The field is `msgVpn`. Version 0.2.0 of the Solace binding spells it
// `msvVpn`, and this library emits 0.4.0, which corrected it.
@solaceServer(#{ msgVpn: "telemetry-vpn", clientName: "sensor-stream" })
namespace SensorStream;

/**
 * One reading from one sensor.
 */
// `orderingKey` is what Pub/Sub uses to keep messages in order within a
// region. `schema` is optional, but a `schema` written without a `name` names
// no schema, so the emitter reports that and drops the object.
@googlePubSubMessage(#{
  orderingKey: "sensorId",
  schema: #{ name: "projects/telemetry/schemas/reading" },
  attributes: #{ source: "field-gateway" },
})
@message
model SensorReading {
  /** The sensor this reading came from. */
  sensorId: string;

  /** What the sensor measured. */
  value: float64;

  /** The unit of that measurement. */
  unit: string;

  /** When the sensor took it, in UTC. */
  readAt: utcDateTime;
}

/**
 * The Pulsar topic every reading is written to.
 */
// `namespace` and `persistence` are both required.
//
// `namespace` is a TypeSpec keyword, so the field name is written in
// backticks. The emitted field is still `namespace`.
//
// `persistence` is `persistent` or `non-persistent`. A rejected value leaves
// the field absent, and the field is required, so the author sees both
// reports: what was wrong, and what is missing because of it.
//
// `geoReplication` is written under that name because a TypeSpec field name
// cannot hold a dash. The emitted field is `geo-replication`.
//
// `retention.time` and `retention.size` are zero or more, and zero disables
// retention on that measure rather than meaning "unset".
@pulsarChannel(#{
  `namespace`: "sensors",
  persistence: "persistent",
  retention: #{ time: 10080, size: 5000 },
  geoReplication: #["us-east", "eu-west"],
  ttl: 86400,
  deduplication: true,
  compaction: 100,
})
@channel("persistent://telemetry/sensors/readings")
@useServer("pulsar")
interface PulsarTopic {
  // NATS defines one object and one field. `queue` names the queue group the
  // subscription joins, and NATS delivers each message to one member of that
  // group rather than to all of them. The name is at most 255 characters.
  @natsOperation(#{ queue: "reading-workers" })
  @receive("consumeReading")
  op consume(): SensorReading;
}

/**
 * The Pub/Sub topic the same readings are published to.
 */
// `schemaSettings` is required, and it requires an `encoding` and a `name` of
// its own. Leave either out and both are reported, not just the first, and
// the whole binding is dropped.
//
// `labels` is an open map. Pub/Sub states no rule about its keys or values,
// so it reaches the document as written.
@googlePubSubChannel(#{
  schemaSettings: #{
    encoding: "json",
    name: "projects/telemetry/schemas/reading",
    firstRevisionId: "rev-1",
  },
  labels: #{ team: "telemetry", tier: "standard" },
  messageRetentionDuration: "86400s",
  messageStoragePolicy: #{ allowedPersistenceRegions: #["us-central1", "europe-west1"] },
})
@channel("sensor-readings")
@useServer("pubsub")
interface PubSubTopic {
  @send("publishReading")
  op publish(event: SensorReading): void;
}

/**
 * The Solace topic the readings fan out on.
 */
@channel("telemetry/readings")
@useServer("solace")
interface SolaceTopic {
  // Each entry of `destinations` may carry a `deliveryMode` of `direct` or
  // `persistent`. Any other value is reported and dropped from that entry,
  // and the rest of the entry survives, because it still names the queue or
  // the topic the author wrote.
  //
  // The rest of an entry reaches the document as written. Solace states two
  // shapes for an entry, and choosing between them here would mean
  // re-implementing a `oneOf` the official parser already applies.
  @solaceOperation(#{
    destinations: #[
      #{
        destinationType: "queue",
        deliveryMode: "persistent",
        queue: #{ name: "readings", accessType: "nonexclusive" },
      }
    ],
    timeToLive: 3600000,
    priority: 4,
    dmqEligible: true,
  })
  @send("fanOutReading")
  op fanOut(event: SensorReading): void;
}
