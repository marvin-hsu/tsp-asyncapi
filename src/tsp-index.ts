import {
  $asyncTag,
  $binding,
  $kafkaChannel,
  $kafkaMessage,
  $kafkaOperation,
  $kafkaServer,
  $channel,
  $contentType,
  $correlationId,
  $dynamicChannel,
  $externalDocs,
  $header,
  $headers,
  $info,
  $jsonSchemaExtension,
  $message,
  $messageExample,
  $oneOf,
  $parameterLocation,
  $rawHeaders,
  $rawPayload,
  $receive,
  $replyAddress,
  $replyChannel,
  $securityScheme,
  $send,
  $server,
  $useSecurity,
  $useServer,
} from "./decorators/index.js";

export { $lib } from "./lib.js";

/**
 * The decorator implementations, for the compiler rather than for a
 * consumer of this package.
 *
 * `lib/main.tsp` imports this file, which is how the compiler binds each
 * `extern dec` to the function that runs it. Keeping the binding here, and
 * out of `src/index.ts`, means the published API is a decision rather than
 * a side effect of which file happens to export what.
 *
 * @internal
 */
export const $decorators = {
  AsyncAPI: {
    info: $info,
    server: $server,
    securityScheme: $securityScheme,
    useSecurity: $useSecurity,
    externalDocs: $externalDocs,
    asyncTag: $asyncTag,
    oneOf: $oneOf,
    jsonSchemaExtension: $jsonSchemaExtension,
    message: $message,
    contentType: $contentType,
    header: $header,
    headers: $headers,
    rawPayload: $rawPayload,
    rawHeaders: $rawHeaders,
    correlationId: $correlationId,
    messageExample: $messageExample,
    channel: $channel,
    dynamicChannel: $dynamicChannel,
    useServer: $useServer,
    parameterLocation: $parameterLocation,
    send: $send,
    receive: $receive,
    replyChannel: $replyChannel,
    replyAddress: $replyAddress,
    binding: $binding,
    kafkaServer: $kafkaServer,
    kafkaChannel: $kafkaChannel,
    kafkaOperation: $kafkaOperation,
    kafkaMessage: $kafkaMessage,
  },
};
