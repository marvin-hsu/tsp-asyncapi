import { Program, Service, Type } from "@typespec/compiler";
import { BindingPlacements, reportUnattachedBindings } from "./bindings.js";
import { resolveChannels } from "./channels.js";
import { reportExtensionProblems } from "./extensions.js";
import { reportTagConflicts } from "./tags.js";
import { resolveInfo } from "./info.js";
import { resolveMessages } from "./messages.js";
import { resolveOperations } from "./operations.js";
import { resolveSecuritySchemes } from "./security-schemes.js";
import { emptySchemaArtifacts, type SchemaArtifactIndex } from "../schema-artifacts.js";
import {
  reportSecurityUsesWithoutServer,
  reportServersOutsideService,
  declaredServerNames,
  resolveServers,
} from "./servers.js";

import type {
  DiagnosticTarget,
  Model,
  ModelProperty,
  Namespace,
  Operation,
} from "@typespec/compiler";
import type {
  CorrelationIdState,
  OperationAction,
  ReplyAddressState,
} from "../decorators/index.js";
import type { BindingRenderer } from "../decorators/bindings/state.js";
import type {
  MessageExampleObject,
  MultiFormatSchemaObject,
  SecuritySchemeObject,
} from "../types/index.js";

/**
 * The semantic model of one AsyncAPI service.
 *
 * This is the only product of the resolve half. The lower half turns it
 * into an `AsyncAPIDocument`, and needs nothing else except `program` for
 * schema expansion and type lookup.
 *
 * Five rules hold for every type in this file.
 *
 * 1. Immutable. Every field is `readonly`, and every collection is a
 *    `ReadonlyArray`, a `ReadonlyMap`, or a `ReadonlySet`. The compiler is
 *    the enforcement.
 * 2. Already sorted. Source order is applied once, in resolve. Nothing
 *    downstream sorts again.
 * 3. Already validated. Semantic diagnostics were reported in resolve. A
 *    dropped declaration is absent from the model, not marked as dropped.
 * 4. Already named. Every `components` key is assigned in resolve.
 * 5. A payload holds a `Model` reference. It never holds an expanded schema.
 *
 * Every node carries its own `target`. That target is the only source
 * location the lower half may report an expansion-time diagnostic
 * against.
 *
 * Two conventions apply to absent values, and they are used everywhere in
 * this file. A list that has no members is an empty array, never
 * `undefined`. The lower half omits the output field when the array is
 * empty. A single value that has no answer is `undefined`.
 *
 * This type is not part of the public API. The shape of the model will
 * change, and a public shape would make every change a breaking change. The
 * `@internal` tag only affects the api-extractor report. The real defence is
 * that `src/index.ts` never exports this file.
 *
 * @internal
 */
export interface AsyncAPIService {
  /**
   * The service namespace. It anchors any report about the document as a
   * whole, and it is the target the info node describes.
   *
   * It is absent when the program declares no `@service`. Such a program
   * still emits a document: AsyncAPI requires `channels` and `operations`,
   * and a channel is declared program-wide rather than under a service.
   */
  readonly target?: Namespace;
  /** The document head, with every default already applied. */
  readonly info: InfoNode;
  /** The servers of the application, in source order. */
  readonly servers: readonly ServerNode[];
  /** The entries of `components.securitySchemes`, in source order. */
  readonly securitySchemes: readonly SecuritySchemeNode[];
  /** The entries of `components.messages`, in source order. */
  readonly messages: readonly MessageNode[];
  /**
   * The `components.messages` key of every emitted message model.
   *
   * A message that lost a key collision is absent. This is the whole-document
   * view. A channel carries its own narrower view, because a model can hold a
   * key in the document and still lose it on one channel.
   */
  readonly messageKeys: ReadonlyMap<Model, string>;
  /** The entries of the root `channels` map, in source order. */
  readonly channels: readonly ChannelNode[];
  /** The entries of the root `operations` map, in source order. */
  readonly operations: readonly OperationNode[];
  // There is deliberately no `components.schemas` key table here.
  //
  // Whether a type earns a schema key is decided while the type graph is
  // walked, not before it. An anonymous shape used once is written in place
  // and earns no key; the same shape used twice is promoted to a component
  // and earns one. A self-reference claims a key part way through a build,
  // and a build that then fails gives it back.
  //
  // So the key set is an output of expansion, not an input to it. The schema
  // builder owns it end to end, and the lower half is where it lives.
  // Keys that a single declaration fixes, such as a message key or a channel
  // parameter key, are different and are assigned here.
}

/**
 * A value that is already plain JSON.
 *
 * A marshalled decorator value is converted once, in resolve. Every config
 * and extension value in the model has passed that conversion, so the
 * lower half never marshals anything.
 *
 * @internal
 */
export type JsonObject = Readonly<Record<string, unknown>>;

/**
 * Prose that points at another document.
 *
 * The AsyncAPI External Documentation Object allows an absent `url`. The
 * decorator rejects that case, so the model states `url` as required and the
 * lower half needs no check.
 *
 * @internal
 */
interface ExternalDocsNode {
  /** The address of the document. */
  readonly url: string;
  /** What the document describes. CommonMark is allowed. */
  readonly description?: string;
}

/**
 * One tag, after `@tag` and `@asyncTag` were merged.
 *
 * Resolve merges the two sources, removes the repeats, applies source order,
 * and reports the metadata conflicts. The lower half only shapes the
 * optional fields. Every section that carries tags carries this same node.
 *
 * @internal
 */
interface TagNode {
  /** The name of the tag. It is unique inside its list. */
  readonly name: string;
  /** What the tag means. CommonMark is allowed. */
  readonly description?: string;
  /** Further reading about the tag. */
  readonly externalDocs?: ExternalDocsNode;
}

/**
 * One protocol binding of one document object.
 *
 * Resolve reads the binding state, merges the level of the object with the
 * `any` level, applies source order, and drops the repeated protocol. The
 * lower half renders the surviving entries and reports nothing.
 *
 * The node does not name its level. The position of the array in the model
 * already states it.
 *
 * @internal
 */
export interface BindingNode {
  /** The member name in the emitted Bindings Object. Trimmed and non-empty. */
  readonly protocol: string;
  /**
   * Which renderer shapes the output.
   *
   * The name is carried instead of a function, so the model stays plain
   * data. The union is imported from the binding state rather than declared
   * again here. One decision needs one owner, and a second copy of the
   * renderer list would drift.
   */
  readonly renderer: BindingRenderer;
  /**
   * The payload the renderer spreads.
   *
   * It is a copy of the state value, never an alias of it. The renderer adds
   * the binding version, which is an output detail and stays out of the
   * model.
   */
  readonly config: JsonObject;
  /**
   * The name of the declaration the decorator was applied to, when it has
   * one.
   *
   * A Bindings Object has no name of its own, so a document that shares one
   * has to name the component after something the author wrote. The reason
   * the same object reaches several sites is that one declaration carries
   * it: a `@jmsServer` on a namespace reaches every server that namespace
   * declares. The carrier is that declaration.
   *
   * It is absent when the target is anonymous.
   */
  readonly carrier?: string;
}

/**
 * The document head.
 *
 * Resolve applies the title and version defaults, so the lower half has
 * no fallback of its own. The default was written in two places before the
 * split, because one copy covered a program with no service. Resolve always
 * produces this node, so one copy is now enough.
 *
 * @internal
 */
export interface InfoNode {
  /**
   * The service namespace, for a report about the document head.
   *
   * It is absent when the program declares no `@service`, in which case the
   * title and version are the emitter's defaults.
   */
  readonly target?: Namespace;
  /** The title of the document. */
  readonly title: string;
  /** The version of the application the document describes. */
  readonly version: string;
  /** What the application does. Already trimmed. */
  readonly description?: string;
  /** The terms of service of the application. */
  readonly termsOfService?: string;
  /** Who to contact about the application. */
  readonly contact?: ContactNode;
  /** The license of the exposed API. */
  readonly license?: LicenseNode;
  /** The document-level tags, in source order. */
  readonly tags: readonly TagNode[];
  /** Further reading about the application. */
  readonly externalDocs?: ExternalDocsNode;
  /**
   * The `x-` extensions of the object, in source order.
   *
   * An empty record means none, the same convention an empty list follows.
   * The keys all carry the `x-` prefix, so no spec field can be shadowed.
   */
  readonly extensions: JsonObject;
}

/**
 * Who to contact about the application.
 * @internal
 */
interface ContactNode {
  /** The name of the contact person or organization. */
  readonly name?: string;
  /** The address of the contact page. */
  readonly url?: string;
  /** The mail address of the contact. */
  readonly email?: string;
}

/**
 * The license of the exposed API.
 * @internal
 */
interface LicenseNode {
  /** The name of the license. */
  readonly name: string;
  /** The address of the license text. */
  readonly url?: string;
}

/**
 * One server of the application.
 *
 * Resolve reads the server state, applies source order, and drops the
 * repeated name. Every field here is emitted as it stands.
 *
 * @internal
 */
export interface ServerNode {
  /** Where to report a problem about this server. */
  readonly target: DiagnosticTarget;
  /** The key of this server in the root `servers` map. */
  readonly name: string;
  /** The host the server listens on. Trimmed and non-empty. */
  readonly host: string;
  /** The protocol the server speaks. Trimmed and non-empty. */
  readonly protocol: string;
  /** The version of the protocol. */
  readonly protocolVersion?: string;
  /** The path part of the address, with its template text as written. */
  readonly pathname?: string;
  /** A human-friendly title. */
  readonly title?: string;
  /** A short summary of the server. */
  readonly summary?: string;
  /** What the server does. CommonMark is allowed. */
  readonly description?: string;
  /**
   * The `{var}` templates of `host` and `pathname`, keyed by the name inside
   * the braces.
   *
   * A `Map` keeps declaration order and lets a name such as `__proto__` stay
   * an own key. Every variable is already normalized: the enum repeats and
   * the blanks are gone, and the default was checked against the enum.
   *
   * Absent and empty are different. The author who writes no variables gets
   * no field, and the author who writes an empty set gets an empty one.
   */
  readonly variables?: ReadonlyMap<string, ServerVariableNode>;
  /**
   * The security schemes this server requires, in source order.
   *
   * The names are already deduplicated. They are also already filtered to
   * the schemes `components.securitySchemes` declares, so the lower half
   * builds a `$ref` that always resolves.
   */
  readonly security: readonly string[];
  /** Further reading about the server. */
  readonly externalDocs?: ExternalDocsNode;
  /**
   * The tags of this server, in source order.
   *
   * They come from the service namespace, the same source `security` and
   * `externalDocs` come from, so every server the namespace declares carries
   * the same set.
   */
  readonly tags: readonly TagNode[];
  /** The protocol bindings of the server, in source order. */
  readonly bindings: readonly BindingNode[];
}

/**
 * One variable of a server address.
 * @internal
 */
export interface ServerVariableNode {
  /** The values the variable accepts. */
  readonly enum?: readonly string[];
  /** The value used when the author gives none. */
  readonly default?: string;
  /** What the variable selects. CommonMark is allowed. */
  readonly description?: string;
  /** Example values of the variable. */
  readonly examples?: readonly string[];
}

/**
 * One entry of `components.securitySchemes`.
 *
 * The scheme itself reuses `SecuritySchemeObject` from the document types.
 * The decorator already produces an emit-ready object, and it stores that
 * object in the state map. A mirror type here would repeat thirteen scheme
 * kinds and the OAuth flow table for no behavior change.
 *
 * The reuse is deliberate, not an exception: `SecuritySchemeObject` is one of
 * the objects the author writes directly, so it lives in `types/authored.ts`
 * with the rest of the vocabulary the decorators accept. This model refers to
 * three of those objects for a whole value; the other two are
 * `MessageExampleObject` and `MultiFormatSchemaObject`.
 *
 * @internal
 */
export interface SecuritySchemeNode {
  /** Where to report a problem about this scheme. */
  readonly target: DiagnosticTarget;
  /** The key of this scheme in `components.securitySchemes`. */
  readonly name: string;
  /** The scheme, ready to emit. */
  readonly scheme: SecuritySchemeObject;
}

/**
 * One entry of `components.messages`.
 *
 * The node holds the message model, never an expanded schema. The lower
 * half expands the payload and the headers.
 *
 * @internal
 */
export interface MessageNode {
  /**
   * The message model.
   *
   * It is the payload source the lower half expands. It is also the
   * target of every message diagnostic the lower half still reports.
   */
  readonly target: Model;
  /** The key of this message in `components.messages`. Already sanitized. */
  readonly key: string;
  /** A human-friendly title. */
  readonly title?: string;
  /** What the message carries. CommonMark is allowed. */
  readonly description?: string;
  /** The media type of the payload. */
  readonly contentType?: string;
  /** Where the correlation value sits at run time. */
  readonly correlationId?: CorrelationIdState;
  /** How the headers of this message are described. */
  readonly headers: MessageHeadersNode;
  /** How the payload of this message is described. */
  readonly payload: MessagePayloadNode;
  /** The examples of the message, in source order and already serialized. */
  readonly examples: readonly MessageExampleObject[];
  /** The tags of the message, in source order. */
  readonly tags: readonly TagNode[];
  /** Further reading about the message. */
  readonly externalDocs?: ExternalDocsNode;
  /** The protocol bindings of the message, in source order. */
  readonly bindings: readonly BindingNode[];
  /** The `x-` extensions of the object, in source order. Empty means none. */
  readonly extensions: JsonObject;
}

/**
 * How the headers of one message are described.
 *
 * The four cases are the resolved answer to the header question. Resolve
 * counts the header sources, reports the conflicts, and adopts the fields a
 * base message lifts. The lower half switches on `kind` and reads no
 * state.
 *
 * @internal
 */
export type MessageHeadersNode =
  | { readonly kind: "none" }
  | { readonly kind: "fields"; readonly fields: readonly ModelProperty[] }
  | { readonly kind: "model"; readonly model: Model }
  | { readonly kind: "raw"; readonly schema: MultiFormatSchemaObject };

/**
 * How the payload of one message is described.
 *
 * The model case carries the fields the header plan lifted out. The lower
 * half omits them while it flattens the payload.
 *
 * @internal
 */
export type MessagePayloadNode =
  | { readonly kind: "model"; readonly model: Model; readonly lifted: ReadonlySet<ModelProperty> }
  | { readonly kind: "raw"; readonly schema: MultiFormatSchemaObject };

/**
 * One entry of the root `channels` map.
 * @internal
 */
export interface ChannelNode {
  /** The interface or namespace the channel sits on. */
  readonly target: DiagnosticTarget;
  /** The key of this channel in the root `channels` map. */
  readonly key: string;
  /**
   * The address of the channel.
   *
   * `null` is not the same as absent. `null` marks a dynamic channel, and a
   * reply may carry an address of its own only on such a channel.
   */
  readonly address: string | null;
  /** A human-friendly title. Not yet trimmed. */
  readonly title?: string;
  /** What the channel carries. Not yet trimmed. */
  readonly description?: string;
  /** The names of the servers this channel is available on, in source order. */
  readonly servers: readonly string[];
  /**
   * The parameters of the address, in the order they appear in it.
   *
   * The list covers the whole address. A declaration resolve found unusable
   * still produces a node, with every field absent. The lower half
   * therefore needs no usable flag and never parses the address again.
   */
  readonly parameters: readonly ChannelParameterNode[];
  /** The messages this channel carries, in source order. */
  readonly messages: readonly ChannelMessageNode[];
  /**
   * The lookup view of `messages`.
   *
   * This is not the whole-document message key map. A model whose key
   * another model claimed on this channel is absent here. The operations
   * resolver tests membership against exactly this narrower view, so the
   * view is carried rather than derived.
   */
  readonly messageKeys: ReadonlyMap<Model, string>;
  /** The tags of the channel, in source order. */
  readonly tags: readonly TagNode[];
  /** Further reading about the channel. */
  readonly externalDocs?: ExternalDocsNode;
  /** The protocol bindings of the channel, in source order. */
  readonly bindings: readonly BindingNode[];
  /** The `x-` extensions of the object, in source order. Empty means none. */
  readonly extensions: JsonObject;
}

/**
 * One message a channel carries.
 * @internal
 */
export interface ChannelMessageNode {
  /** The message model. */
  readonly model: Model;
  /** The `components.messages` key of that model. */
  readonly key: string;
}

/**
 * One parameter of a channel address.
 *
 * Every field comes from the declaration that wins in source order. The
 * values are already strings, so the lower half serializes nothing.
 *
 * @internal
 */
export interface ChannelParameterNode {
  /** The declaring property, or the channel when no property declares it. */
  readonly target: DiagnosticTarget;
  /** The key of this parameter in the `parameters` map of the channel. */
  readonly name: string;
  /**
   * The values the parameter accepts.
   *
   * It is absent when the declared type names no limited set of strings. It
   * is also absent when the declaration was unusable.
   */
  readonly enumValues?: readonly string[];
  /** The value used when the author gives none. */
  readonly default?: string;
  /** What the parameter selects. CommonMark is allowed. */
  readonly description?: string;
  /** Example values of the parameter. */
  readonly examples?: readonly string[];
  /** Where the value sits at run time. */
  readonly location?: string;
}

/**
 * One entry of the root `operations` map.
 *
 * The node names its messages by key pair, not by model. That is what lets
 * the operations part of the lower half work without `program`.
 *
 * @internal
 */
export interface OperationNode {
  /** The operation the node describes. */
  readonly target: Operation;
  /** The key of this operation in the root `operations` map. */
  readonly key: string;
  /** Whether the application sends or receives. */
  readonly action: OperationAction;
  /** The key of the channel this operation sits on. */
  readonly channelKey: string;
  /** A human-friendly title. Not yet trimmed. */
  readonly title?: string;
  /** What the operation does. Not yet trimmed. */
  readonly description?: string;
  /**
   * The security schemes this operation requires, in source order.
   *
   * Same guarantee as on a server. The names are deduplicated, and every one
   * of them names a declared scheme.
   */
  readonly security: readonly string[];
  /** The tags of the operation, in source order. */
  readonly tags: readonly TagNode[];
  /** Further reading about the operation. */
  readonly externalDocs?: ExternalDocsNode;
  /** The protocol bindings of the operation, in source order. */
  readonly bindings: readonly BindingNode[];
  /**
   * The messages of the request side, in signature order.
   *
   * A model with no message key is already dropped. So is a model the
   * channel does not carry.
   */
  readonly messages: readonly MessageRefNode[];
  /**
   * The reply of the operation.
   *
   * `undefined` already states every resolve decision. The operation
   * declares no reply, or neither side carries a message, or the named reply
   * channel is not a channel.
   */
  readonly reply?: OperationReplyNode;
  /** The `x-` extensions of the object, in source order. Empty means none. */
  readonly extensions: JsonObject;
}

/**
 * A pointer at one message of one channel.
 * @internal
 */
export interface MessageRefNode {
  /** The key of the channel that carries the message. */
  readonly channelKey: string;
  /** The key of the message on that channel. */
  readonly messageKey: string;
}

/**
 * The reply of one operation.
 * @internal
 */
export interface OperationReplyNode {
  /** The key of the channel the reply goes to. */
  readonly channelKey: string;
  /**
   * Where the reply address sits at run time.
   *
   * It is absent when the author declared none. It is also absent when the
   * reply channel is not dynamic, because resolve reported that and dropped
   * the address.
   */
  readonly address?: ReplyAddressState;
  /** The messages of the reply side, in signature order. */
  readonly messages: readonly MessageRefNode[];
}

/**
 * Resolves one program into the semantic model the rest of the pipeline
 * reads.
 *
 * This is the whole of the resolve half. Every decorator state read, every source
 * ordering, and every semantic diagnostic happens inside this call. What it
 * returns is immutable and complete, so the lower half needs the program
 * only to expand schemas.
 *
 * The order inside matters, and it is the order of what depends on what.
 * The security schemes come first, because a server and an operation both
 * drop a `@useSecurity` naming a scheme the document does not carry, and
 * that check needs the full set. The messages come next, because a channel
 * names its messages by the key they claimed. The channels come before the
 * operations for the same reason.
 *
 * The unattached-binding report runs last, together with the unreached
 * extension report. Every step that places a binding or carries an
 * extension runs before them, so whatever they still do not hold reached
 * nothing.
 *
 * @param program - The compiled program
 * @param service - The service the document describes, if the program has one
 * @param placements - Where the binding applications this build placed are
 * recorded
 * @param artifacts - The schemas another tool generated for this program.
 * A build that ran no provider passes none.
 * @returns The semantic model, or `undefined` when the program declares no
 * service
 * @internal
 */
export function resolveService(
  program: Program,
  service: Service | undefined,
  placements: BindingPlacements,
  artifacts: SchemaArtifactIndex = emptySchemaArtifacts,
): AsyncAPIService {
  const securitySchemes = resolveSecuritySchemes(program);
  const declaredSchemes = new Set(securitySchemes.map((scheme) => scheme.name));
  // The channels are resolved before the servers, and a channel writes a
  // reference to a server. So the names are read here, ahead of both.
  const declaredServers = declaredServerNames(program, service?.type);

  const {
    messages,
    keys,
    extensionCarriers: messageCarriers,
  } = resolveMessages(program, placements, artifacts);
  const {
    channels,
    emitted,
    extensionCarriers: channelCarriers,
  } = resolveChannels(program, keys, placements, declaredServers);

  // A server on any namespace other than the service's never reaches the
  // document, and a `@useSecurity` beside it has just as little to attach to.
  reportServersOutsideService(program, service?.type);
  reportSecurityUsesWithoutServer(program, service?.type);

  const servers =
    service !== undefined ? resolveServers(program, service.type, declaredSchemes, placements) : [];
  const { operations, extensionCarriers: operationCarriers } = resolveOperations(
    program,
    emitted,
    keys,
    declaredSchemes,
    placements,
  );

  reportUnattachedBindings(program, placements);
  reportTagConflicts(program);
  reportExtensionProblems(
    program,
    extensionCarriers(service, channelCarriers, messageCarriers, operationCarriers),
  );

  return {
    ...(service !== undefined ? { target: service.type } : {}),
    info: resolveInfo(program, service),
    servers,
    securitySchemes,
    messages,
    messageKeys: keys,
    channels,
    operations,
  };
}

/**
 * The types whose `@extension` applications reached an emitted object.
 *
 * One type may appear through more than one route. A namespace is both the
 * service and a channel when it carries `@channel`, and its extensions then
 * reach `info` and the Channel Object alike.
 *
 * Each of the three sets comes from its own resolver rather than from the
 * nodes it handed back. A declaration a resolver dropped holds no node, yet
 * its extensions reached the object another declaration built: the message
 * whose key it lost, the channel whose id it lost, or the copy of it an
 * extending interface carries.
 */
function extensionCarriers(
  service: Service | undefined,
  channels: Iterable<Type>,
  messages: Iterable<Type>,
  operations: Iterable<Type>,
): ReadonlySet<Type> {
  const carriers = new Set<Type>(channels);
  if (service !== undefined) carriers.add(service.type);
  for (const message of messages) carriers.add(message);
  for (const operation of operations) carriers.add(operation);
  return carriers;
}
