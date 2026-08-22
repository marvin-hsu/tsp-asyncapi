// A raw schema `$ref` whose array index is not what RFC 6901 spells.
//
// Fixed in 0.3.0. The reader passed the index token to `Number`, which reads
// `"0x1"` as 1, `"01"` as 1, and `""` and `" "` as 0. So a `$ref` carrying any
// of those was reported as resolving, and the author was told a pointer was
// fine when a reader would not follow it. An index is now only `0`, or a digit
// run with no leading zero.
//
// The case reports, and the document it still produces is the half worth
// pinning: the `$ref` stays exactly as written, because the author decides
// what to change and nothing already written disappears while the error is
// open. See `raw-ref-array-index.options.json` for the code it must report.

@service(#{ title: "Order Events" })
namespace Orders;

@message
@rawPayload("application/vnd.aai.asyncapi+json;version=3.1.0", #{
  `$ref`: "#/components/schemas/Wrapper/oneOf/0x1"
})
model OrderCreated {}

@channel("orders.created")
interface Orders2 {
  @send op publish(event: OrderCreated): void;
}
