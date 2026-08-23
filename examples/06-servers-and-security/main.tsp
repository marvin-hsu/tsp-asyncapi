// The connection side: servers, server variables and security schemes.
// This example declares no channel and no message. It emits `channels: {}`,
// which is what the emitter produces when the program declares no channel.
import "tsp-asyncapi";

using AsyncAPI;

@service(#{ title: "Ledger Service" })
@info(#{
  version: "2.1.0",
  description: "Two brokers, four security schemes and document-level tags.",
  contact: #{ name: "Ledger Team", email: "ledger@example.com" },
  license: #{ name: "Apache-2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
})
// `@server` is repeatable. The first argument is the key in the emitted
// `servers` map.
// Apply it to the service namespace. The emitter reads the servers from that
// namespace only, and it reports a server on any other namespace.
// `host` and `pathname` may both hold `{var}` templates. Every name used
// there needs an entry in `variables`, or the emitter reports it.
@server(
  "kafka-dev",
  #{
    host: "{tenant}.dev.kafka.example.com:9092",
    protocol: "kafka",
    protocolVersion: "3.7",
    title: "Development broker",
    description: "One shared cluster for every development tenant.",
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
  "amqp-prod",
  #{
    host: "amqp.example.com:{port}",
    pathname: "/{vhost}",
    protocol: "amqp",
    protocolVersion: "0.9.1",
    title: "Production broker",
    summary: "The production AMQP broker.",
    variables: #{
      port: #{ `enum`: #["5671", "5672"], default: "5671", description: "TLS on 5671." },
      vhost: #{ default: "ledger", description: "The virtual host to open." },
    },
  }
)
// `@securityScheme` defines one entry of `components.securitySchemes`. The
// first argument is the key of that entry. It is repeatable.
// The `type` field picks the shape of the scheme. The type checker then
// rejects a field that belongs to another kind of scheme.
@securityScheme(
  "ledger-oauth",
  #{
    type: "oauth2",
    description: "Machine-to-machine access to the ledger topics.",
    flows: #{
      clientCredentials: #{
        tokenUrl: "https://auth.example.com/oauth2/token",
        refreshUrl: "https://auth.example.com/oauth2/token",
        availableScopes: #{
          `ledger:read`: "Read ledger entries.",
          `ledger:write`: "Append ledger entries.",
        },
      },
      authorizationCode: #{
        authorizationUrl: "https://auth.example.com/oauth2/authorize",
        tokenUrl: "https://auth.example.com/oauth2/token",
        availableScopes: #{ `ledger:read`: "Read ledger entries." },
      },
    },

    // `scopes` names the subset this scheme requires. It is a subset of the
    // scopes the flows declare.
    scopes: #["ledger:read"],
  }
)
@securityScheme(
  "broker-scram",
  #{ type: "scramSha512", description: "SASL/SCRAM-SHA-512 against the broker." }
)
@securityScheme(
  "gateway-key",
  #{
    type: "httpApiKey",
    name: "X-Ledger-Key",
    in: "header",
    description: "A static key checked by the gateway.",
  }
)
@securityScheme(
  "legacy-login",
  #{ type: "userPassword", description: "Kept for the legacy bridge only." }
)
// `@useSecurity` requires one scheme on every server of this namespace. It
// is repeatable.
// AsyncAPI reads the `security` array as OR. A client satisfies one of the
// listed schemes.
// The emitter always writes a `$ref` into `#/components/securitySchemes`.
// A name that no `@securityScheme` defines is reported.
@useSecurity("ledger-oauth")
@useSecurity("broker-scram")
// `@asyncTag` adds one tag with its metadata. It is repeatable, and the tags
// keep their source order.
// It is named `asyncTag` and not `tag`. The built-in `@tag` lives in the
// global `TypeSpec` namespace, and a second `tag` here would make `@tag`
// ambiguous for anyone who writes `using AsyncAPI;`.
@asyncTag("ledger", #{ description: "Everything the ledger publishes." })
@asyncTag(
  "internal",
  #{
    description: "Not exposed outside the platform.",
    externalDocs: #{
      url: "https://example.com/internal/ledger",
      description: "The internal runbook.",
    },
  }
)
// `@externalDocs` fills `info.externalDocs`.
@externalDocs("https://example.com/docs/ledger", "The ledger contract guide.")
namespace LedgerService;
