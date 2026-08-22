// A runtime expression whose JSON Pointer token holds a line terminator.
//
// Fixed in 0.3.0. The pattern that checks a runtime expression ended with `$`,
// and JavaScript's `$` without the `s` flag refuses to look past a line
// terminator, so `$message.header#/a\nb` was rejected. RFC 6901 puts no
// character outside a reference token, and both JSON and YAML carry one inside
// a member name, so the emitter was refusing a legal pointer.
//
// The baseline pins how the pointer is written out: the emitted `correlationId`
// has to carry the terminator through, not swallow or escape it away.

@service(#{ title: "Order Events" })
namespace Orders;

@message
@correlationId("$message.header#/odd\nname")
model OrderCreated {
  id: string;
}

@channel("orders.created")
interface Orders2 {
  @send op publish(event: OrderCreated): void;
}
