/**
 * TypeSpec fragments more than one suite declares.
 *
 * Only a fragment that was already a named constant belongs here. A test's
 * input stays readable at the call site, so the inline `@service` header
 * most suites write out stays where it is, however often it repeats. This
 * file only replaces a named constant that several files declared again,
 * identically.
 *
 * A suite whose fragment differs, even by one identifier, keeps its own.
 * The AMQP suite publishes an `EventCreated` rather than an `OrderCreated`,
 * so it declares its own operation.
 */

/** A message model the binding suites publish. */
export const ORDER_CREATED = `
  @message
  model OrderCreated {
    id: string;
  }
`;

/** An operation that sends `ORDER_CREATED`. */
export const PUBLISH_ORDER_CREATED = `
  @send
  op publish(event: OrderCreated): void;
`;

/**
 * A service with one broker server, carrying `ORDER_CREATED`.
 *
 * @param protocol - The `protocol` of the server
 * @returns The source of a service namespace
 */
export function brokerService(protocol: string): string {
  return `
    @service(#{ title: "Orders" })
    @server("prod", #{ host: "broker.example.com", protocol: "${protocol}" })
    namespace Test;

    ${ORDER_CREATED}
  `;
}

/** A service with one Kafka server and no declarations of its own. */
export const KAFKA_SERVICE = `
  @service(#{ title: "Orders" })
  @server("prod", #{ host: "kafka.example.com:9092", protocol: "kafka" })
  namespace Test;
`;
