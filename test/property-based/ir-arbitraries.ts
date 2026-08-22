import fc from "fast-check";

import type { DiagnosticTarget, Model } from "@typespec/compiler";
import type { BindingRenderer } from "../../src/decorators/bindings/state.js";
import type {
  AsyncAPIService,
  BindingNode,
  ChannelMessageNode,
  ChannelNode,
  ChannelParameterNode,
  InfoNode,
  JsonObject,
  MessageNode,
  MessageRefNode,
  OperationNode,
  SecuritySchemeNode,
  ServerNode,
  ServerVariableNode,
} from "../../src/resolve/service.js";
import type { SecuritySchemeObject } from "../../src/types/index.js";

/**
 * Generators of hand-written semantic model nodes.
 *
 * The architecture buys one thing first: the lower stage reads
 * `AsyncAPIService` and nothing else, so it can be driven without compiling
 * TypeSpec. This module is the first user of that slot. Two property files
 * share it, so the node shapes have one owner.
 *
 * Every node here obeys the model's own rules. A list with no member is an
 * empty array, a single value with no answer is absent rather than
 * `undefined`, and each key a section is keyed by is unique inside its
 * section. A generator that broke one of those would test an input resolve
 * cannot produce.
 *
 * What the generators do reach, and a TypeSpec program does not, is the key
 * charset. A `@useServer` name and a binding protocol are bare strings the
 * emitter never checks, so `__proto__`, `~`, and `/` all arrive. Those are
 * exactly the keys where building a map and writing a pointer decide the
 * answer.
 */

/**
 * A source location the lower stage never reads.
 *
 * Every node carries a target, and the lower half of the pipeline only
 * reports against one after schema expansion. Nothing these properties drive
 * expands a schema, so one shared stub serves every node.
 */
const stubTarget = { kind: "Namespace", name: "Stub" } as unknown as DiagnosticTarget;

/** Builds a distinct stub model, so identity comparisons stay meaningful. */
function stubModel(name: string): Model {
  return { kind: "Model", name } as unknown as Model;
}

/** Spreads a field only when it has an answer, the way resolve builds a node. */
function optional<K extends string, V>(key: K, value: V | undefined): Record<K, V> | object {
  return value === undefined ? {} : { [key]: value };
}

/**
 * A field value in the three states resolve produces.
 *
 * The blank arm matters on its own. A field the author left out and a field
 * the author wrote spaces into take two different paths through
 * `optional-fields`, and only the second one reaches the trimming.
 */
const optionalText = fc.oneof(
  { arbitrary: fc.string({ minLength: 1 }).filter((value) => value.trim() !== ""), weight: 4 },
  { arbitrary: fc.constantFrom(" ", "   ", "\t", "\n  "), weight: 1 },
  { arbitrary: fc.constant(undefined), weight: 2 },
);

/** Text that says something, for a field the model states as required. */
export const requiredText = fc.string({ minLength: 1 }).filter((value) => value.trim() !== "");

/** The characters a JSON Pointer token has to escape. */
const escapeNeedingKey = fc.constantFrom("a~b", "a/b", "~", "/", "a~1b", "x/~/y", "~0");

/** The names every object inherits, which are still legal AsyncAPI keys. */
const inheritedKey = fc.constantFrom("__proto__", "constructor", "toString", "valueOf");

/**
 * A key of a document section.
 *
 * The plain arm carries the shape a TypeSpec program produces. The other two
 * carry the keys only a bare string reaches: a name that collides with the
 * prototype chain, and a name that a pointer has to escape.
 */
const documentKey = fc.oneof(
  { arbitrary: fc.stringMatching(/^[A-Za-z]\w{0,7}$/), weight: 6 },
  { arbitrary: inheritedKey, weight: 1 },
  { arbitrary: escapeNeedingKey, weight: 2 },
);

/**
 * Every binding renderer, taken from a record keyed by the union.
 *
 * The record is the enforcement. A renderer added to the union without a line
 * here fails the build, so the sampling cannot silently miss one.
 */
const RENDERER_TABLE: Record<BindingRenderer, null> = {
  verbatim: null,
  kafka: null,
  websocket: null,
  mqtt: null,
  http: null,
  amqp: null,
  nats: null,
  pulsar: null,
  googlepubsub: null,
  sqs: null,
  anypointmq: null,
  jms: null,
  ibmmq: null,
  solace: null,
};

/** The renderer names, in the order the table lists them. */
export const RENDERERS = Object.keys(RENDERER_TABLE) as readonly BindingRenderer[];

/**
 * A recorded binding configuration. It is already plain JSON.
 *
 * `bindingVersion` is not among the keys. Every protocol decorator declares
 * its config as the emitted object without that field, so the checker rejects
 * a program that writes one. Only the generic `@binding` can carry it, and
 * the version-table enumeration in `lower-transforms` covers that case with a
 * fixed config.
 */
const bindingConfig: fc.Arbitrary<JsonObject> = fc.dictionary(
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,6}$/),
  fc.oneof(fc.string(), fc.integer(), fc.boolean()),
  { maxKeys: 4 },
);

/**
 * The `x-` extensions of one document object.
 *
 * Resolve rejects a key outside the specification pattern, so every key drawn
 * here is one that reaches the document. The empty map carries most of the
 * weight, and it has to stay reachable: the lower stage emits no field at all
 * for it.
 */
const extensions: fc.Arbitrary<JsonObject> = fc.oneof(
  { weight: 2, arbitrary: fc.constant<JsonObject>({}) },
  {
    weight: 1,
    arbitrary: fc.dictionary(
      fc.stringMatching(/^x-[a-z][a-zA-Z0-9-]{0,6}$/),
      fc.oneof(fc.string(), fc.integer(), fc.boolean()),
      { maxKeys: 3 },
    ),
  },
);

/** One protocol binding of one document object. */
const bindingNode: fc.Arbitrary<BindingNode> = fc.record({
  protocol: documentKey,
  renderer: fc.constantFrom(...RENDERERS),
  config: bindingConfig,
});

/** A binding list whose protocols are unique, the way resolve leaves it. */
export const bindingNodes = (maxLength = 4): fc.Arbitrary<BindingNode[]> =>
  fc.uniqueArray(bindingNode, { maxLength, selector: (node) => node.protocol });

/** One variable of a server address. */
const serverVariableNode: fc.Arbitrary<ServerVariableNode> = fc
  .record({
    enumValues: fc.option(fc.array(requiredText, { maxLength: 3 }), { nil: undefined }),
    defaultValue: fc.option(requiredText, { nil: undefined }),
    description: optionalText,
    examples: fc.option(fc.array(requiredText, { maxLength: 3 }), { nil: undefined }),
  })
  .map((draw) => ({
    ...optional("enum", draw.enumValues),
    ...optional("default", draw.defaultValue),
    ...optional("description", draw.description),
    ...optional("examples", draw.examples),
  }));

/**
 * Further reading about one object.
 *
 * The optional field is spread in rather than set to `undefined`. A node
 * resolve built has no such key at all, and a key holding `undefined` is a
 * shape only a generator can make.
 */
const externalDocsNode = fc
  .record({ url: requiredText, description: fc.option(requiredText, { nil: undefined }) })
  .map((draw) => ({ url: draw.url, ...optional("description", draw.description) }));

/** One tag, after `@tag` and `@asyncTag` were merged. */
const tagNode = fc.record({ name: requiredText });

/** One server of the application. */
const serverNode: fc.Arbitrary<ServerNode> = fc
  .record({
    name: documentKey,
    host: requiredText,
    protocol: requiredText,
    protocolVersion: optionalText,
    pathname: optionalText,
    title: optionalText,
    summary: optionalText,
    description: optionalText,
    variables: fc.option(
      fc.uniqueArray(fc.tuple(documentKey, serverVariableNode), {
        maxLength: 3,
        selector: (entry) => entry[0],
      }),
      { nil: undefined },
    ),
    security: fc.uniqueArray(documentKey, { maxLength: 3 }),
    externalDocs: fc.option(externalDocsNode, { nil: undefined }),
    tags: fc.array(tagNode, { maxLength: 2 }),
    bindings: bindingNodes(3),
  })
  .map((draw) => ({
    target: stubTarget,
    name: draw.name,
    host: draw.host,
    protocol: draw.protocol,
    ...optional("protocolVersion", draw.protocolVersion),
    ...optional("pathname", draw.pathname),
    ...optional("title", draw.title),
    ...optional("summary", draw.summary),
    ...optional("description", draw.description),
    ...optional("variables", draw.variables ? new Map(draw.variables) : undefined),
    security: draw.security,
    ...optional("externalDocs", draw.externalDocs),
    tags: draw.tags,
    bindings: draw.bindings,
  }));

/** A server list whose names are unique, the way resolve leaves it. */
export const serverNodes = (maxLength = 4, minLength = 0): fc.Arbitrary<ServerNode[]> =>
  fc.uniqueArray(serverNode, { maxLength, minLength, selector: (node) => node.name });

/** The document head. */
export const infoNode: fc.Arbitrary<InfoNode> = fc
  .record({
    // Resolve applies a default for both, so neither ever arrives blank.
    title: requiredText,
    version: requiredText,
    description: optionalText,
    termsOfService: optionalText,
    contact: fc.option(
      fc
        .record({
          name: fc.option(requiredText, { nil: undefined }),
          url: fc.option(requiredText, { nil: undefined }),
          email: fc.option(requiredText, { nil: undefined }),
        })
        .map((draw) => ({
          ...optional("name", draw.name),
          ...optional("url", draw.url),
          ...optional("email", draw.email),
        })),
      { nil: undefined },
    ),
    license: fc.option(
      fc
        .record({ name: requiredText, url: fc.option(requiredText, { nil: undefined }) })
        .map((draw) => ({ name: draw.name, ...optional("url", draw.url) })),
      { nil: undefined },
    ),
    tags: fc.array(tagNode, { maxLength: 3 }),
    externalDocs: fc.option(externalDocsNode, { nil: undefined }),
    extensions,
  })
  .map((draw) => ({
    title: draw.title,
    version: draw.version,
    ...optional("description", draw.description),
    ...optional("termsOfService", draw.termsOfService),
    ...optional("contact", draw.contact),
    ...optional("license", draw.license),
    tags: draw.tags,
    ...optional("externalDocs", draw.externalDocs),
    extensions: draw.extensions,
  }));

/**
 * One entry of `components.securitySchemes`.
 *
 * The scheme itself is a constant. These properties ask which keys reach the
 * document, and the scheme body is copied through untouched.
 */
const securityScheme: SecuritySchemeObject = { type: "userPassword" };

/** One entry of `components.securitySchemes`. */
const securitySchemeNode: fc.Arbitrary<SecuritySchemeNode> = documentKey.map((name) => ({
  target: stubTarget,
  name,
  scheme: securityScheme,
}));

/**
 * One entry of `components.messages`, with a raw payload.
 *
 * The payload is raw on purpose. A model payload is expanded by the schema
 * builder, and expansion is the one part of the lower stage that needs the
 * program. A raw payload is copied as written, so the assembly properties run
 * against a stub program.
 *
 * The raw schema carries no `$ref`. A reference into the document is checked
 * by `reportUnresolvedRawSchemaRefs`, which reports through the program, and
 * a stub program has nothing to report through.
 */
const messageNode = (key: string): fc.Arbitrary<MessageNode> =>
  fc
    .record({
      title: optionalText,
      description: optionalText,
      contentType: optionalText,
      tags: fc.array(tagNode, { maxLength: 2 }),
      bindings: bindingNodes(2),
      extensions,
    })
    .map((draw) => ({
      target: stubModel(key),
      key,
      ...optional("title", draw.title),
      ...optional("description", draw.description),
      ...optional("contentType", draw.contentType),
      headers: { kind: "none" as const },
      payload: {
        kind: "raw" as const,
        schema: {
          schemaFormat: "application/vnd.aai.asyncapi+json;version=3.0.0",
          schema: { type: "object" },
        },
      },
      examples: [],
      tags: draw.tags,
      bindings: draw.bindings,
      extensions: draw.extensions,
    }));

/** A message list whose keys are unique, the way resolve leaves it. */
const messageNodes = (maxLength = 3, minLength = 0): fc.Arbitrary<MessageNode[]> =>
  fc
    .uniqueArray(documentKey, { maxLength, minLength })
    .chain((keys) => fc.tuple(...keys.map((key) => messageNode(key))))
    .map((nodes) => [...nodes]);

/** One parameter of a channel address. */
const channelParameterNode = (name: string): fc.Arbitrary<ChannelParameterNode> =>
  fc
    .record({
      enumValues: fc.option(fc.array(requiredText, { maxLength: 3 }), { nil: undefined }),
      defaultValue: fc.option(requiredText, { nil: undefined }),
      description: optionalText,
      location: fc.option(fc.constant("$message.header#/x"), { nil: undefined }),
    })
    .map((draw) => ({
      target: stubTarget,
      name,
      ...optional("enumValues", draw.enumValues),
      ...optional("default", draw.defaultValue),
      ...optional("description", draw.description),
      ...optional("location", draw.location),
    }));

/** The parameters of one channel, keyed uniquely. */
const channelParameterNodes = fc
  .uniqueArray(documentKey, { maxLength: 2 })
  .chain((names) => fc.tuple(...names.map((name) => channelParameterNode(name))))
  .map((nodes) => [...nodes]);

/** The messages one channel carries, keyed uniquely. */
const channelMessageNodes = fc
  .uniqueArray(documentKey, { maxLength: 3 })
  .map((keys): ChannelMessageNode[] => keys.map((key) => ({ model: stubModel(key), key })));

/** One entry of the root `channels` map. */
const channelNode = (key: string): fc.Arbitrary<ChannelNode> =>
  fc
    .record({
      address: fc.oneof(requiredText, fc.constant(null)),
      title: optionalText,
      description: optionalText,
      servers: fc.uniqueArray(documentKey, { maxLength: 2 }),
      parameters: channelParameterNodes,
      messages: channelMessageNodes,
      tags: fc.array(tagNode, { maxLength: 2 }),
      bindings: bindingNodes(2),
      extensions,
    })
    .map((draw) => ({
      target: stubTarget,
      key,
      address: draw.address,
      ...optional("title", draw.title),
      ...optional("description", draw.description),
      servers: draw.servers,
      parameters: draw.parameters,
      messages: draw.messages,
      messageKeys: new Map(draw.messages.map((message) => [message.model, message.key])),
      tags: draw.tags,
      bindings: draw.bindings,
      extensions: draw.extensions,
    }));

/** A channel list whose keys are unique, the way resolve leaves it. */
const channelNodes = (maxLength = 3, minLength = 0): fc.Arbitrary<ChannelNode[]> =>
  fc
    .uniqueArray(documentKey, { maxLength, minLength })
    .chain((keys) => fc.tuple(...keys.map((key) => channelNode(key))))
    .map((nodes) => [...nodes]);

/** Draws a message reference that the given channels really carry. */
const messageRefs = (
  channels: readonly ChannelNode[],
  maxLength: number,
): fc.Arbitrary<MessageRefNode[]> => {
  const pairs: MessageRefNode[] = channels.flatMap((channel) =>
    channel.messages.map((message) => ({ channelKey: channel.key, messageKey: message.key })),
  );
  if (pairs.length === 0) return fc.constant([]);
  return fc.uniqueArray(fc.constantFrom(...pairs), {
    maxLength,
    selector: (ref) => `${ref.channelKey}\u0000${ref.messageKey}`,
  });
};

/**
 * One entry of the root `operations` map.
 *
 * The channel is drawn from the channels already generated, and each message
 * from the messages that channel carries. That is the resolve output
 * contract: an operation never names a channel or a message the document does
 * not hold.
 */
const operationNode = (
  key: string,
  channels: readonly ChannelNode[],
): fc.Arbitrary<OperationNode> => {
  const channel = fc.constantFrom(...channels);
  return channel.chain((own) =>
    fc
      .record({
        action: fc.constantFrom("send" as const, "receive" as const),
        title: optionalText,
        description: optionalText,
        security: fc.uniqueArray(documentKey, { maxLength: 2 }),
        tags: fc.array(tagNode, { maxLength: 2 }),
        bindings: bindingNodes(2),
        extensions,
        messages: messageRefs([own], 2),
        reply: fc.option(
          fc
            .record({
              replyChannel: fc.constantFrom(...channels),
            })
            .chain((draw) =>
              messageRefs([draw.replyChannel], 2).map((messages) => ({
                channelKey: draw.replyChannel.key,
                messages,
              })),
            ),
          { nil: undefined },
        ),
      })
      .map((draw) => ({
        target: stubModel(key) as unknown as OperationNode["target"],
        key,
        action: draw.action,
        channelKey: own.key,
        ...optional("title", draw.title),
        ...optional("description", draw.description),
        security: draw.security,
        tags: draw.tags,
        bindings: draw.bindings,
        extensions: draw.extensions,
        messages: draw.messages,
        ...optional("reply", draw.reply),
      })),
  );
};

/**
 * A whole semantic model.
 *
 * The operations are drawn last, so every channel reference they carry names a
 * channel the same model holds.
 *
 * @param minSection - The smallest length of every section. Zero lets each
 * one reach empty, which is where the omission decisions live. One forces a
 * model where every section is filled.
 */
export const service = (minSection = 0): fc.Arbitrary<AsyncAPIService> =>
  fc
    .record({
      info: infoNode,
      servers: serverNodes(3, minSection),
      securitySchemes: fc.uniqueArray(securitySchemeNode, {
        maxLength: 3,
        minLength: minSection,
        selector: (node) => node.name,
      }),
      messages: messageNodes(3, minSection),
      channels: channelNodes(3, minSection),
      operationKeys: fc.uniqueArray(documentKey, { maxLength: 4, minLength: minSection }),
    })
    .chain((draw) => {
      const operations =
        draw.channels.length === 0
          ? fc.constant<OperationNode[]>([])
          : fc
              .tuple(...draw.operationKeys.map((key) => operationNode(key, draw.channels)))
              .map((nodes) => [...nodes]);
      return operations.map((nodes) => ({
        info: draw.info,
        servers: draw.servers,
        securitySchemes: draw.securitySchemes,
        messages: draw.messages,
        messageKeys: new Map(draw.messages.map((message) => [message.target, message.key])),
        channels: draw.channels,
        operations: nodes,
      }));
    });
