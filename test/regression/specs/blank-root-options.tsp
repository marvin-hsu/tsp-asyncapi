// The two root options, given blank and given padding.
//
// Fixed in 0.3.0. `asyncapi-id` and `default-content-type` were read with a
// bare truthiness test, so a blank option reached the document as a blank
// value and a padded one kept its padding. Every other text field already
// answered to one rule: absent when blank, trimmed when it says something.
//
// The options schema sets no minimum length, so an author can write either.
// See `blank-root-options.options.json`: `asyncapi-id` is blank and has to
// vanish, `default-content-type` is padded and has to arrive trimmed.

@service(#{ title: "Order Events" })
namespace Orders;

@message
model OrderCreated {
  id: string;
}

@channel("orders.created")
interface Orders2 {
  @send op publish(event: OrderCreated): void;
}
