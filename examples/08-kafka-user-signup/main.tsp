// One realistic Kafka contract for a user-signup domain.
// This is the file to copy when you start a real contract. It puts every
// part the earlier examples show one at a time into a single document.
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "User Signup Events" })
@info(#{
  version: "1.4.0",
  description: "The events the signup domain publishes to Kafka.",
  contact: #{
    name: "Identity Platform",
    url: "https://example.com/teams/identity",
    email: "identity@example.com",
  },
  license: #{ name: "Apache-2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
})
// Two brokers. Both hold a `{var}` template, and both declare the variable
// the template uses.
@server(
  "kafka-dev",
  #{
    host: "{tenant}.kafka.dev.example.com:9092",
    protocol: "kafka",
    protocolVersion: "3.7",
    title: "Development broker",
    description: "One cluster shared by every development tenant.",
    variables: #{
      tenant: #{
        default: "sandbox",
        description: "The tenant this client connects as.",
        examples: #["sandbox", "acme"],
      },
    },
  }
)
@server(
  "kafka-prod",
  #{
    host: "{region}.kafka.example.com:9093",
    protocol: "kafka-secure",
    protocolVersion: "3.7",
    title: "Production broker",
    summary: "The production cluster, one deployment per region.",
    variables: #{
      region: #{
        `enum`: #["eu-west-1", "us-east-1"],
        default: "eu-west-1",
        description: "The region of the cluster.",
      },
    },
  }
)
// SASL/SCRAM is what the brokers accept. The OAuth2 scheme is what the
// token service issues for the same topics.
@securityScheme(
  "broker-scram",
  #{ type: "scramSha512", description: "SASL/SCRAM-SHA-512 against the broker." }
)
@securityScheme(
  "signup-oauth",
  #{
    type: "oauth2",
    description: "Machine-to-machine access to the signup topics.",
    flows: #{
      clientCredentials: #{
        tokenUrl: "https://auth.example.com/oauth2/token",
        refreshUrl: "https://auth.example.com/oauth2/token",
        availableScopes: #{
          `signup:read`: "Consume signup events.",
          `signup:write`: "Produce signup events.",
        },
      },
    },
    scopes: #["signup:read"],
  }
)
// `@useSecurity` requires a scheme on every server of this namespace.
// AsyncAPI reads the `security` array as OR. A client satisfies one of the
// two schemes.
// These two requirements are server-wide. `@useSecurity` also targets an
// operation, and the operation below shows that form.
@useSecurity("broker-scram")
@useSecurity("signup-oauth")
@asyncTag("signup", #{ description: "Everything the signup domain publishes." })
@asyncTag(
  "public-contract",
  #{
    description: "Consumed outside the identity platform. Break it with care.",
    externalDocs: #{
      url: "https://example.com/contracts/signup",
      description: "The compatibility policy for this contract.",
    },
  }
)
@externalDocs("https://example.com/docs/signup-events", "The signup event guide.")
// The Kafka server binding. It names the schema registry the brokers use.
// Every server of this namespace gets its own copy of it. `@server` is
// repeatable and keyed by name, so no decorator target can single one server
// out. Both brokers here are Kafka, so one registry for both is truthful.
// `schemaRegistryUrl` is required by the message binding further down. That
// binding sets `schemaIdLocation`, `schemaIdPayloadEncoding` and
// `schemaLookupStrategy`. AsyncAPI forbids those three fields without a
// server-level registry URL. The emitter cannot check the rule, because it
// spans two objects of the document. Set the URL yourself.
@kafkaServer(#{
  schemaRegistryUrl: "https://registry.example.com",
  schemaRegistryVendor: "confluent",
})
namespace UserSignupEvents;

// The domain types every event shares.

@doc("An RFC 5321 mailbox address.")
@maxLength(254)
scalar Email extends string;

@doc("The plan the account is on.")
enum Plan {
  free,
  team,
  enterprise,
}

@doc("How the account was created.")
enum SignupSource {
  web,
  mobile,
  partnerApi,
}

/**
 * The envelope every signup event carries.
 */
// `@discriminator` names the property that tells the subtypes apart. The
// property is defined here, and it is required.
// Each subtype emits `allOf`. The first branch is a `$ref` to this model.
// The second branch holds the fields that subtype adds.
@discriminator("eventType")
model SignupEvent {
  /** The name of the event. It selects the subtype. */
  eventType: string;

  /** The identifier of this event. */
  @format("uuid")
  eventId: string;

  /** When the event happened, in UTC. */
  occurredAt: utcDateTime;

  /** The account the event is about. */
  @format("uuid")
  userId: string;

  /** The tenant the account belongs to. */
  @minLength(1)
  @maxLength(64)
  @pattern("^[a-z0-9][a-z0-9-]*$")
  tenantId: string;
}

model UserRegistered extends SignupEvent {
  eventType: "user.registered";
  email: Email;
  plan: Plan;
  source: SignupSource;

  /** The referral code the account signed up with. */
  referralCode?: string;
}

model EmailVerified extends SignupEvent {
  eventType: "user.emailVerified";
  email: Email;

  /** How many verification mails went out before this one landed. */
  @minValue(1)
  attempt: int32;
}

model SignupAbandoned extends SignupEvent {
  eventType: "user.signupAbandoned";

  /** The step the account stopped at. */
  lastStep: "email" | "password" | "profile";

  /** How long the account stayed in the funnel, in seconds. */
  @minValue(0)
  elapsedSeconds: int32;
}

// `@oneOf` emits `oneOf` instead of the default `anyOf`. The three variants
// are mutually exclusive, because `eventType` differs in each.
@oneOf
union SignupEventEnvelope {
  registered: UserRegistered,
  emailVerified: EmailVerified,
  abandoned: SignupAbandoned,
}

/**
 * One event of the signup funnel.
 */
// One message carries the whole event union. A consumer switches on
// `eventType`.
// The three `@header` fields are lifted out of the payload schema and into
// the message `headers` schema. Their keys there are their wire names, so
// `@encodedName` renames the header too.
// `@correlationId` points at one of those headers. The emitter checks the
// shape of the runtime expression only.
// `@jsonSchemaExtension` writes a raw key into this model's own schema. Use
// it for a JSON Schema keyword this emitter has no decorator for.
// The Kafka message binding. `key` is the partition key of the record.
// It is a Schema Object, written as an object literal. The emitter writes it
// as given, and it checks nothing inside it. The key here is the tenant id.
// Kafka orders records per partition, so one key per tenant keeps the events
// of one tenant in order. The channel binding asks for 12 partitions, and
// this key is what spreads the tenants over them.
// The three schema-registry fields match the `confluent` vendor set on the
// namespace. `schemaIdLocation` is `header` or `payload`, and any other value
// is reported through `invalid-binding-field`.
@kafkaMessage(#{
  key: #{
    type: "string",
    description: "The tenant the event belongs to.",
  },
  schemaIdLocation: "payload",
  schemaIdPayloadEncoding: "confluent",
  schemaLookupStrategy: "TopicIdStrategy",
})
@summary("A signup funnel event")
@message("SignupEventV1")
@contentType("application/json")
@correlationId("$message.header#/correlation-id", "The id of the originating request.")
@jsonSchemaExtension("$comment", "The payload shape is versioned by the topic address.")
@asyncTag("signup", #{ description: "Everything the signup domain publishes." })
@messageExample(
  #{
    headers: #{
      `correlation-id`: "6f9c0f6a-9b18-4a0b-9a6d-3e3f2c1a0b11",
      `x-trace-id`: "1c9f0a2d4e6b8c0a",
      `x-schema-version`: "1",
    },
    payload: #{
      event: #{
        eventType: "user.registered",
        eventId: "0f0d3a1e-2b4c-4f6a-8d0e-1a2b3c4d5e6f",
        occurredAt: "2026-03-04T09:15:00Z",
        userId: "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        tenantId: "acme",
        email: "ada@example.com",
        plan: "team",
        source: "web",
      },
    },
  },
  #{ name: "registered", summary: "A new account on the team plan." }
)
@messageExample(
  #{
    payload: #{
      event: #{
        eventType: "user.signupAbandoned",
        eventId: "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
        occurredAt: "2026-03-04T09:22:31Z",
        userId: "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        tenantId: "acme",
        lastStep: "profile",
        elapsedSeconds: 411,
      },
    },
  },
  #{ name: "abandoned", summary: "The account stopped at the profile step." }
)
model SignupMessage {
  /** Ties this event to the request that caused it. */
  @header
  @encodedName("application/json", "correlation-id")
  @format("uuid")
  correlationId: string;

  /** The trace this event belongs to. */
  @header
  @encodedName("application/json", "x-trace-id")
  @pattern("^[0-9a-f]{16}$")
  traceId: string;

  /** The version of the payload contract. */
  @header
  @encodedName("application/json", "x-schema-version")
  schemaVersion: "1";

  /** The event itself. */
  event: SignupEventEnvelope;
}

/**
 * The signup funnel events of one tenant.
 */
// The address holds the contract version and the tenant. Each `{name}` is
// matched against an operation parameter of this channel.
// `@useServer` lists the servers this channel is available on. A channel
// with no `@useServer` is available on every server.
// `@send` marks the operation as a message this application sends. The
// argument overrides the key of the operation in the emitted `operations`
// map. Without it the key would be `publish`, the bare name of the operation.
// That key is document-wide, so give it a name that says what it does.
// `@useSecurity` on an operation adds one scheme to that operation alone. The
// requirement is added to the server's, and it never replaces it. So the
// emitted operation carries a `security` array of its own, next to the array
// on every server.
// The parameters are the messages sent and the address parameters. `event`
// carries `@message`, so it is the message. `tenantId` does not, so it is an
// address parameter.
// The Kafka channel binding states how the topic is laid out.
// It carries no `topic` field on purpose. The address holds `{tenantId}`, so
// one literal topic name cannot be written down at design time. Set `topic`
// only when the address is a fixed string, or when the topic name differs
// from the address.
// `partitions` and `replicas` are positive integers. A value outside that
// range is reported through `invalid-binding-field`. The field is dropped,
// and the rest of the binding is kept.
// `topicConfiguration` is an open map, because Kafka names its topic settings
// with dots. The emitter checks one entry only. Each value of
// `cleanup.policy` must be `delete` or `compact`. The binding types that
// field as a list.
@kafkaChannel(#{
  partitions: 12,
  replicas: 3,
  topicConfiguration: #{
    `cleanup.policy`: #["delete"],
    `retention.ms`: 1209600000,
  },
})
@channel("signup.v1.{tenantId}.events")
@useServer("kafka-dev")
@useServer("kafka-prod")
interface SignupFunnel {
  // The Kafka operation binding carries `groupId` and `clientId`. Both are
  // Schema Objects, written as object literals.
  // This operation is the producer, so it sets `clientId` alone. A producer
  // joins no consumer group, so a `groupId` here would say nothing true.
  @kafkaOperation(#{
    clientId: #{
      type: "string",
      description: "The producing service instance.",
    },
  })
  @send("publishSignupEvent")
  @useSecurity("signup-oauth")
  op publish(
    /** The tenant whose events this topic carries. */
    @parameterLocation("$message.payload#/event/tenantId")
    @example("acme")
    tenantId: string,

    event: SignupMessage,
  ): void;

  // The consumer side of the same channel. `groupId` belongs here, because
  // only a consumer joins a group. The analytics pipeline reads every event
  // of the funnel under one group.
  // For `@receive` the return type is the messages received, so
  // `SignupMessage` sits in the return type. The parameters are the messages
  // of the reply, and this operation declares none. `tenantId` carries no
  // `@message`, so it stays an address parameter under either action.
  @kafkaOperation(#{
    groupId: #{
      type: "string",
      description: "The consumer group of the analytics pipeline.",
    },
    clientId: #{
      type: "string",
      description: "The consuming service instance.",
    },
  })
  @receive("consumeSignupEvent")
  @useSecurity("signup-oauth")
  op consume(
    /** The tenant whose events this topic carries. */
    @parameterLocation("$message.payload#/event/tenantId")
    @example("acme")
    tenantId: string,
  ): SignupMessage;
}
