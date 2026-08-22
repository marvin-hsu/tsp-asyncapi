// `@info` names its fields out of table order.
//
// The emitted order is the Info Object table of the specification, not the
// order the author happened to type inside `#{ ... }`. Two documents
// describing one service must not differ by how a literal was written.

        @service(#{ title: "Order Events" })
        @info(#{
          license: #{ name: "MIT" },
          description: "Every event the order system publishes.",
          version: "1.4.2",
          contact: #{ name: "API Team" },
          termsOfService: "https://example.com/terms"
        })
        namespace Orders;

        @message model Order { id: string; }
      