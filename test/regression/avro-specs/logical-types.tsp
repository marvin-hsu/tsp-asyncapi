// The annotations that survive as Avro keywords: a logical type on a scalar
// and on a property, a decimal with its precision and scale, a fixed size,
// an enum with the symbol a reader falls back to, and the aliases a reader
// of older data needs.
//
// What this pins is where each keyword lands and in which order the keys are
// written. A logical type that moved from the scalar to the field, or a
// `precision` written after `scale`, is a change every reader sees.

@Avro.avroNamespace("com.example.audit")
namespace Audit;

/** A moment in time, as the milliseconds since the Unix epoch. */
@Avro.logicalType("timestamp-millis")
scalar Timestamp extends int64;

/** A 16 byte digest. */
@Avro.fixed(16)
scalar Digest extends bytes;

/** What a reader does with an entry it does not recognise. */
@Avro.enumDefault("Unknown")
enum Outcome {
  Unknown,
  Allowed,
  Denied,
}

/** One decision, as it was recorded. */
@Avro.avroRecord
model AuditEntry {
  /** The identifier of the entry. */
  @Avro.logicalType("uuid")
  id: string;

  /** When the decision was taken. */
  at: Timestamp;

  /** What was decided. */
  outcome: Outcome;

  /** The digest of the request the decision was taken over. */
  fingerprint: Digest;

  /** What the decision cost, in the currency of the account. */
  @Avro.decimal(12, 2)
  cost: bytes;

  /** The account the decision was taken for. */
  @Avro.aliases("tenantId", "customerId")
  accountId: string;
}
