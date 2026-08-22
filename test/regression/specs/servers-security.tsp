// Servers, server variables, and securitySchemes.

        @service(#{ title: "Order Events" })
        @tag("edge")
        @asyncTag("region", #{ description: "Where the broker runs." })
        @securityScheme("kafka-scram", #{
          type: "scramSha512",
          description: "SASL/SCRAM over TLS."
        })
        @securityScheme("api-key", #{
          type: "httpApiKey",
          name: "X-Api-Key",
          in: "header"
        })
        @securityScheme("oauth", #{
          type: "oauth2",
          scopes: #["orders:read"],
          flows: #{
            clientCredentials: #{
              tokenUrl: "https://example.com/token",
              refreshUrl: "https://example.com/refresh",
              availableScopes: #{ `orders:read`: "Read orders" }
            },
            authorizationCode: #{
              authorizationUrl: "https://example.com/authorize",
              tokenUrl: "https://example.com/token",
              availableScopes: #{ `orders:write`: "Write orders" }
            }
          }
        })
        @useSecurity("kafka-scram")
        @useSecurity("oauth")
        @server("production", #{
          host: "{tenant}.kafka.example.com:9092",
          protocol: "kafka-secure",
          protocolVersion: "3.5.0",
          pathname: "/{stage}",
          title: "Production",
          summary: "The production cluster.",
          description: "One cluster per tenant.",
          variables: #{
            tenant: #{ default: "acme", `enum`: #["acme", "globex"], description: "The tenant." },
            stage: #{ default: "v1", examples: #["v1"] }
          }
        })
        @server("sit", #{ host: "kafka.sit.example.com:9092", protocol: "kafka" })
        namespace Orders;
      