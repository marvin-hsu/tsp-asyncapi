import { DecoratorContext, DiagnosticTarget, Namespace, Program } from "@typespec/compiler";
import { reportDiagnostic } from "../../lib.js";
import type { OAuthFlowObject, OAuthFlowsObject, SecuritySchemeObject } from "../../types/index.js";
import {
  AsyncAPISecuritySchemeState,
  findSecuritySchemeByName,
  getSecuritySchemesInternal,
  listSecuritySchemes,
  SecuritySchemeRecord,
  setSecuritySchemes,
} from "./scheme-state.js";
import { isAbsoluteUrl } from "../absolute-url.js";
import { sourcePositionOf } from "../../source-order.js";
import { settleNameClash } from "../name-clash.js";
import { HTTP_BEARER_SCHEME, COMPONENTS_KEY_PATTERN } from "../../constants.js";

/**
 * `@securityScheme` and its state reader, `getSecuritySchemes`.
 *
 * Every scheme kind has its own normalize function, since AsyncAPI requires
 * different fields per kind and rejects a URL field that is blank or
 * relative. This module builds the emitted `SecuritySchemeObject`; it does
 * not decide where a scheme is used, which is `@useSecurity`'s job.
 */
export type { AsyncAPISecuritySchemeState } from "./scheme-state.js";

/**
 * The names of the four OAuth flows, in the order the emitted object lists
 * them.
 */
const OAUTH_FLOW_NAMES = [
  "implicit",
  "password",
  "clientCredentials",
  "authorizationCode",
] as const;

type OAuthFlowName = (typeof OAUTH_FLOW_NAMES)[number];

/**
 * The URL fields each flow uses. AsyncAPI ties the requirement to the flow,
 * not to the field, so the table is read per flow.
 *
 * The table also decides what the emitter writes. AsyncAPI forbids the URL a
 * flow does not use. It rejects a `tokenUrl` inside `implicit`, and an
 * `authorizationUrl` inside `password` or `clientCredentials`. So a field
 * this table does not list for a flow never reaches the emitted document.
 * The flow models of the TypeSpec library declare the same set, so the type
 * checker already rejects the forbidden field at its source.
 */
const REQUIRED_FLOW_URLS: Record<OAuthFlowName, readonly ("authorizationUrl" | "tokenUrl")[]> = {
  implicit: ["authorizationUrl"],
  password: ["tokenUrl"],
  clientCredentials: ["tokenUrl"],
  authorizationCode: ["authorizationUrl", "tokenUrl"],
};

/**
 * The kinds of scheme that carry nothing but a `type` and a `description`.
 * AsyncAPI defines eight of them.
 */
type PlainSecuritySchemeType =
  | "userPassword"
  | "X509"
  | "symmetricEncryption"
  | "asymmetricEncryption"
  | "plain"
  | "scramSha256"
  | "scramSha512"
  | "gssapi";

/** The `flows` field of an `oauth2` scheme, as the author wrote it. */
type OAuthFlowsArgument = Partial<Record<OAuthFlowName, OAuthFlowObject>>;

/**
 * The `scheme` argument of `@securityScheme`, as the author wrote it.
 * It mirrors the union of models declared in `lib/main.tsp`. The `type`
 * field picks the branch, so no branch can carry a field of another one.
 */
export type SecuritySchemeArgument =
  | { type: PlainSecuritySchemeType; description?: string }
  | { type: "apiKey"; in: "user" | "password"; description?: string }
  | {
      type: "httpApiKey";
      name: string;
      in: "query" | "header" | "cookie";
      description?: string;
    }
  // The library splits this kind into two models, one for the `bearer`
  // scheme and one for every other scheme. Both carry `type: "http"`, so
  // `type` cannot tell them apart here. The branch therefore merges the two,
  // and the emitter checks `scheme` before it writes `bearerFormat`.
  | { type: "http"; scheme: string; bearerFormat?: string; description?: string }
  | { type: "oauth2"; flows: OAuthFlowsArgument; scopes?: string[]; description?: string }
  | {
      type: "openIdConnect";
      openIdConnectUrl: string;
      scopes?: string[];
      description?: string;
    };

/**
 * Reads one required string field, and reports it when it is blank.
 * A blank value passes the type check and then makes the document invalid,
 * so it is treated the same as a missing one. This follows the rule
 * `@server` applies to `host` and `protocol`.
 *
 * @param context - The decorator context
 * @param value - The value the author gave
 * @param field - The name of the field, for the diagnostic
 * @param target - The node to report on
 *
 * @returns The trimmed value, or `undefined` when it is blank
 */
function requireField(
  context: DecoratorContext,
  value: string,
  field: string,
  target: DiagnosticTarget,
): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    reportDiagnostic(context.program, {
      code: "empty-security-scheme-field",
      format: { field },
      target,
    });
    return undefined;
  }
  return trimmed;
}

/**
 * Reads one required URL field, and reports it when it cannot be used.
 *
 * A blank value is reported the same way a blank name is. A value that is
 * not an absolute URL is reported as well. AsyncAPI marks every URL field
 * of a security scheme with the `uri` format, and the official parser
 * rejects the whole document over a relative value.
 *
 * @param context - The decorator context
 * @param value - The value the author gave
 * @param field - The name of the field, for the diagnostic
 * @param target - The node to report on
 *
 * @returns The trimmed URL, or `undefined` when it cannot be used
 */
function requireUrlField(
  context: DecoratorContext,
  value: string,
  field: string,
  target: DiagnosticTarget,
): string | undefined {
  const trimmed = requireField(context, value, field, target);
  if (trimmed === undefined) return undefined;
  if (isAbsoluteUrl(trimmed)) return trimmed;
  reportDiagnostic(context.program, {
    code: "invalid-url",
    format: { field, url: trimmed },
    target,
  });
  return undefined;
}

/**
 * Trims every entry of a scope list and drops the blank ones.
 *
 * A blank entry names no scope, so it is dropped and reported. Dropping it
 * in silence would change what the list says: two blank entries would
 * silently become the empty list, and AsyncAPI reads an empty `scopes` as
 * "this scheme needs no scope" rather than as the field being absent. So a
 * list that ends up empty after trimming is still kept, not dropped.
 *
 * @param context - The decorator context
 * @param scopes - The scope names the author gave
 * @param target - The node to report a problem on
 *
 * @returns The list to emit, or `undefined` when the author gave none
 */
function normalizeScopes(
  context: DecoratorContext,
  scopes: string[] | undefined,
  target: DiagnosticTarget,
): string[] | undefined {
  if (scopes === undefined) return undefined;
  const trimmed = scopes.map((scope) => scope.trim());
  // One diagnostic covers the whole list. Every blank entry is the same
  // mistake, so naming it once is enough.
  if (trimmed.includes("")) {
    reportDiagnostic(context.program, { code: "blank-security-scope-name", target });
  }
  return trimmed.filter((scope) => scope !== "");
}

/**
 * Checks one URL of one OAuth flow, and reports a relative one.
 *
 * The field is named together with its flow, because a flow object holds
 * the same field names as its neighbours. `implicit.authorizationUrl` tells
 * the author which of them to correct.
 *
 * @param context - The decorator context
 * @param flowName - Which of the four flows this is
 * @param field - The name of the URL field inside that flow
 * @param value - The URL the author gave, already trimmed
 * @param target - The node to report a problem on
 *
 * @returns Whether the URL can be emitted
 */
function checkFlowUrl(
  context: DecoratorContext,
  flowName: OAuthFlowName,
  field: string,
  value: string,
  target: DiagnosticTarget,
): boolean {
  if (isAbsoluteUrl(value)) return true;
  reportDiagnostic(context.program, {
    code: "invalid-url",
    format: { field: `${flowName}.${field}`, url: value },
    target,
  });
  return false;
}

/**
 * Checks one OAuth flow and turns it into the object to emit. Returns
 * `undefined` when a required URL is missing.
 *
 * @param context - The decorator context
 * @param flowName - Which of the four flows this is
 * @param flow - The flow the author wrote
 * @param target - The node to report a problem on
 *
 * @returns The flow to emit, or `undefined` when a required URL is missing
 */
function normalizeFlow(
  context: DecoratorContext,
  flowName: OAuthFlowName,
  flow: OAuthFlowObject,
  target: DiagnosticTarget,
): OAuthFlowObject | undefined {
  let valid = true;
  const urls: Partial<Pick<OAuthFlowObject, "authorizationUrl" | "tokenUrl" | "refreshUrl">> = {};

  for (const field of REQUIRED_FLOW_URLS[flowName]) {
    // A blank URL is treated as a missing one. Reporting it as an empty
    // field as well would name one mistake twice.
    const value = flow[field]?.trim();
    if (value === undefined || value === "") {
      reportDiagnostic(context.program, {
        code: "missing-oauth-flow-url",
        format: { flow: flowName, field },
        target,
      });
      valid = false;
      continue;
    }
    // AsyncAPI requires an absolute URL here. A relative one makes the
    // official parser reject the whole document, so the flow is unusable.
    if (!checkFlowUrl(context, flowName, field, value, target)) {
      valid = false;
      continue;
    }
    urls[field] = value;
  }

  // `refreshUrl` is the one URL every flow allows and no flow requires, so
  // it is carried over when the author gave one. A blank value carries no
  // address, so it is left out. The other two URLs are never carried over.
  // The loop above already wrote the ones this flow uses. AsyncAPI forbids
  // each of them in the flows the table does not list it for.
  const refreshUrl = flow.refreshUrl?.trim();
  if (refreshUrl !== undefined && refreshUrl !== "") {
    // The same absolute-URL rule covers `refreshUrl`. A blank one is left
    // out above, so only a value the author meant as an address reaches
    // this check.
    if (checkFlowUrl(context, flowName, "refreshUrl", refreshUrl, target)) {
      urls.refreshUrl = refreshUrl;
    } else {
      valid = false;
    }
  }

  // The scope names are keys the author chose, so they are kept as written.
  // Only the descriptions are trimmed. A description that is blank after
  // the trim stays as an empty string. This is the one string of this phase
  // that a blank value does not remove. `availableScopes` is a map, and
  // AsyncAPI requires a value for every key in it, so there is nothing to
  // leave absent. Dropping the entry instead would take away a scope the
  // author declared.
  const availableScopes = Object.fromEntries(
    Object.entries(flow.availableScopes).map(([scope, description]) => [scope, description.trim()]),
  );

  return valid ? { ...urls, availableScopes } : undefined;
}

/**
 * Checks the `flows` of an `oauth2` scheme and turns them into the object
 * to emit. Returns `undefined` when any of them is unusable.
 *
 * @param context - The decorator context
 * @param flows - The flows the author wrote
 * @param target - The node to report a problem on
 *
 * @returns The flows to emit, or `undefined` when any of them is unusable
 */
function normalizeFlows(
  context: DecoratorContext,
  flows: OAuthFlowsArgument,
  target: DiagnosticTarget,
): OAuthFlowsObject | undefined {
  const normalized: OAuthFlowsObject = {};
  let valid = true;

  for (const flowName of OAUTH_FLOW_NAMES) {
    const flow = flows[flowName];
    if (flow === undefined) continue;
    const result = normalizeFlow(context, flowName, flow, target);
    if (result === undefined) {
      valid = false;
      continue;
    }
    normalized[flowName] = result;
  }

  if (Object.keys(normalized).length === 0 && valid) {
    // An `oauth2` scheme with no flow tells a client nothing about how to
    // obtain a token.
    reportDiagnostic(context.program, { code: "empty-oauth-flows", target });
    return undefined;
  }

  return valid ? normalized : undefined;
}

/**
 * The fields of a scheme that depend on its kind.
 * `type` and `description` are left out, because every kind carries those
 * two and they are filled in one place.
 */
type SchemeFields = Omit<SecuritySchemeObject, "type" | "description">;

/**
 *  Checks the fields of an `httpApiKey` scheme.
 *
 * @param context - The decorator context
 * @param scheme - The scheme the author wrote
 * @param target - Where a problem is reported
 */
function normalizeHttpApiKey(
  context: DecoratorContext,
  scheme: Extract<SecuritySchemeArgument, { type: "httpApiKey" }>,
  target: DiagnosticTarget,
): SchemeFields | undefined {
  const name = requireField(context, scheme.name, "name", target);
  if (name === undefined) return undefined;
  return { name, in: scheme.in };
}

/**
 * Checks the fields of an `http` scheme.
 *
 * `bearerFormat` reaches the document only next to the `bearer` scheme.
 * AsyncAPI describes the bearer scheme with an object of its own, and that
 * object is the only one carrying the field. The TypeSpec library declares
 * the same split, so the type checker rejects the field on another scheme
 * before it reaches here.
 *
 * @param context - The decorator context
 * @param scheme - The scheme the author wrote
 * @param target - Where a problem is reported
 */
function normalizeHttp(
  context: DecoratorContext,
  scheme: Extract<SecuritySchemeArgument, { type: "http" }>,
  target: DiagnosticTarget,
): SchemeFields | undefined {
  const httpScheme = requireField(context, scheme.scheme, "scheme", target);
  if (httpScheme === undefined) return undefined;
  const fields: SchemeFields = { scheme: httpScheme };
  if (httpScheme !== HTTP_BEARER_SCHEME) return fields;
  const bearerFormat = scheme.bearerFormat?.trim();
  if (bearerFormat !== undefined && bearerFormat !== "") fields.bearerFormat = bearerFormat;
  return fields;
}

/**
 *  Checks the fields of an `oauth2` scheme.
 *
 * @param context - The decorator context
 * @param scheme - The scheme the author wrote
 * @param target - Where a problem is reported
 */
function normalizeOAuth2(
  context: DecoratorContext,
  scheme: Extract<SecuritySchemeArgument, { type: "oauth2" }>,
  target: DiagnosticTarget,
): SchemeFields | undefined {
  const flows = normalizeFlows(context, scheme.flows, target);
  if (flows === undefined) return undefined;
  const fields: SchemeFields = { flows };
  const scopes = normalizeScopes(context, scheme.scopes, target);
  if (scopes !== undefined) fields.scopes = scopes;
  return fields;
}

/**
 *  Checks the fields of an `openIdConnect` scheme.
 *
 * @param context - The decorator context
 * @param scheme - The scheme the author wrote
 * @param target - Where a problem is reported
 */
function normalizeOpenIdConnect(
  context: DecoratorContext,
  scheme: Extract<SecuritySchemeArgument, { type: "openIdConnect" }>,
  target: DiagnosticTarget,
): SchemeFields | undefined {
  const url = requireUrlField(context, scheme.openIdConnectUrl, "openIdConnectUrl", target);
  if (url === undefined) return undefined;
  const fields: SchemeFields = { openIdConnectUrl: url };
  const scopes = normalizeScopes(context, scheme.scopes, target);
  if (scopes !== undefined) fields.scopes = scopes;
  return fields;
}

/**
 * Checks the fields that belong to the kind of one scheme. Returns
 * `undefined` when the scheme is unusable.
 *
 * @param context - The decorator context
 * @param scheme - The scheme the author wrote
 * @param target - Where a problem is reported
 *
 * @returns The fields to emit, or `undefined` when the scheme is unusable
 */
function normalizeSchemeFields(
  context: DecoratorContext,
  scheme: SecuritySchemeArgument,
  target: DiagnosticTarget,
): SchemeFields | undefined {
  switch (scheme.type) {
    case "apiKey":
      return { in: scheme.in };
    case "httpApiKey":
      return normalizeHttpApiKey(context, scheme, target);
    case "http":
      return normalizeHttp(context, scheme, target);
    case "oauth2":
      return normalizeOAuth2(context, scheme, target);
    case "openIdConnect":
      return normalizeOpenIdConnect(context, scheme, target);
    default:
      // The remaining eight kinds carry `type` and `description` only.
      return {};
  }
}

/**
 * Checks one scheme argument and turns it into the object to emit.
 * Returns `undefined` when it is unusable.
 *
 * @param context - The decorator context
 * @param scheme - The scheme the author wrote
 * @param target - The node to report a problem on
 *
 * @returns The scheme to emit, or `undefined` when it is unusable
 */
function normalizeScheme(
  context: DecoratorContext,
  scheme: SecuritySchemeArgument,
  target: DiagnosticTarget,
): SecuritySchemeObject | undefined {
  const fields = normalizeSchemeFields(context, scheme, target);
  if (fields === undefined) return undefined;

  // The `type` value is emitted exactly as the specification spells it.
  // Normalizing the case here would produce a document no validator
  // accepts.
  const result: SecuritySchemeObject = { type: scheme.type };

  const description = scheme.description?.trim();
  if (description !== undefined && description !== "") result.description = description;

  return { ...result, ...fields };
}

/**
 * Defines one entry of `components.securitySchemes`.
 * This decorator is repeatable. Each application defines its own scheme,
 * and the `name` argument becomes the key of that scheme.
 *
 * The schemes are collected across the whole program, not from the service
 * namespace only. `components` is a document-wide registry, and a server
 * reaches a scheme by name, so the namespace a scheme sits on carries no
 * meaning. This differs from `@server`, whose namespace decides whether the
 * server reaches the document at all.
 *
 * A name is used unchanged, so it must fit the Components Object character
 * set. Two schemes with the same name are a mistake. The one written first
 * is kept, and the other one is dropped with a diagnostic.
 *
 * @param context - The decorator context
 * @param target - The namespace to record this scheme on
 * @param name - The key for this scheme in `components.securitySchemes`
 * @param scheme - One of the security scheme models, picked by its `type`
 *
 * @example
 * ```typespec
 * @securityScheme("kafka-scram", #{ type: "scramSha512" })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $securityScheme(
  context: DecoratorContext,
  target: Namespace,
  name: string,
  scheme: SecuritySchemeArgument,
) {
  // Report on the name argument. Both name problems below point here.
  const nameTarget = context.getArgumentTarget(0) ?? target;
  // Report on the scheme argument. Every field problem points here.
  const schemeTarget = context.getArgumentTarget(1) ?? target;

  if (!COMPONENTS_KEY_PATTERN.test(name)) {
    // The name is written by hand, so it is not rewritten to a legal key.
    // Rewriting it would silently change the key the author asked for.
    reportDiagnostic(context.program, {
      code: "invalid-security-scheme-name",
      format: { name },
      target: nameTarget,
    });
    return;
  }

  const normalized = normalizeScheme(context, scheme, schemeTarget);
  if (normalized === undefined) return;

  const state: AsyncAPISecuritySchemeState = { name, scheme: normalized };
  const record: SecuritySchemeRecord = {
    state,
    ...sourcePositionOf(context.decoratorTarget),
    nameTarget,
  };

  const clash = findSecuritySchemeByName(context.program, name);
  if (clash !== undefined) {
    // `settleNameClash` holds the rule, because `@server` needs the same
    // answer for the key it writes.
    settleNameClash(
      context.program,
      clash.records,
      clash.index,
      record,
      "duplicate-security-scheme-name",
      name,
    );
    return;
  }

  const records = getSecuritySchemesInternal(context.program, target) ?? [];
  records.push(record);
  setSecuritySchemes(context.program, target, records);
}

/**
 * Reads back a copy of every security scheme declared by `@securityScheme`,
 * in source order. The list is empty when the decorator was never applied.
 *
 * @param program - The program to read the state from
 *
 * @returns A copy of every declared scheme, in source order. The list is empty
 * when the decorator was never applied.
 *
 * @public
 */
export function getSecuritySchemes(program: Program): AsyncAPISecuritySchemeState[] {
  return listSecuritySchemes(program).map((state) => ({
    name: state.name,
    scheme: structuredClone(state.scheme),
  }));
}
