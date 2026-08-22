// The service namespace, its metadata, and the two options that only reach
// the root of the document.
//
// Emitted twice, once per serializer. Without the JSON variant the JSON half
// of the serialize stage has no baseline at all, and YAML is the default so
// nothing else would reach it. See `info.options.json`.

  @service(#{ title: "Order Events" })
  @info(#{
    version: "1.4.2",
    description: "Every event the order system publishes.",
    termsOfService: "https://example.com/terms",
    contact: #{ name: "API Team", url: "https://example.com/team", email: "team@example.com" },
    license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
  })
  @tag("orders")
  @asyncTag("orders", #{
    description: "The order domain as a whole.",
    externalDocs: #{ url: "https://example.com/orders", description: "The order guide." }
  })
  @asyncTag("public")
  @externalDocs("https://example.com/docs", "The whole documentation set.")
  namespace Orders;
