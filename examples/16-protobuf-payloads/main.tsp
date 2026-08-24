// One contract, two emitters, one Protobuf definition.
// The models below carry the official `TypeSpec.Protobuf` decorators. The
// official emitter writes them out as a `.proto` file. This emitter takes
// the same text and puts it in the AsyncAPI payload, so the document and the
// `.proto` file cannot drift apart.
//
// The `protobuf` preview feature turns that on. It is set in
// `tspconfig.yaml`, and it is off by default.
import "tsp-asyncapi";
import "@typespec/protobuf";

using AsyncAPI;

// Protobuf describes the data. It does not describe the channels, the
// direction of a message, or the operations. So `@channel`, `@send` and
// `@message` are still written here.
@service(#{ title: "Orders Service" })
@info(#{
  version: "1.0.0",
  description: "Order events, carried as protobuf on Kafka.",
})
namespace OrdersService;

// `@Protobuf.package` marks the namespace that becomes one `.proto` file.
// The name here is the `package` declaration of that file. It is independent
// of the TypeSpec namespace name.
@Protobuf.package({ name: "com.example.orders" })
namespace Contracts {
  /**
   * One order a customer placed.
   */
  // Two decorators named `message` are in scope. The AsyncAPI one marks a
  // model as a message of the document. The Protobuf one marks it as a
  // message of the `.proto` file. The Protobuf one is written qualified.
  @message
  @Protobuf.message
  model OrderPlaced {
    // Every property of a Protobuf message needs a field index.
    @Protobuf.field(1)
    orderId: string;

    @Protobuf.field(2)
    amountCents: int32;
  }

  /**
   * One order that left the warehouse.
   */
  @message
  @Protobuf.message
  model OrderShipped {
    @Protobuf.field(1)
    orderId: string;

    @Protobuf.field(2)
    carrier: string;
  }
}

// The payload of a message is the proto3 text of its whole package, not the
// fragment of one message. A `.proto` file needs its `syntax`, its `package`
// and every message it declares to be read on its own.
//
// Both models below belong to one package, so both payloads are the same
// text. The emitter writes that text once under `components.schemas` and
// points both messages at it.
@channel("orders.placed")
interface Placed {
  @send
  op placed(event: Contracts.OrderPlaced): void;
}

@channel("orders.shipped")
interface Shipped {
  @send
  op shipped(event: Contracts.OrderShipped): void;
}
