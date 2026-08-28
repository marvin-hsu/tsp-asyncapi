import { DecoratorContext, DiagnosticTarget, Namespace, Program } from "@typespec/compiler";
import { useStateMap } from "@typespec/compiler/utils";
import { DEFAULT_INFO_VERSION } from "../../constants.js";
import { reportDiagnostic } from "../../lib.js";
import { present, trimmed } from "../../optional-fields.js";
import { isAbsoluteUrl } from "../absolute-url.js";
import { singleApplication } from "../single-application.js";

const infoStateKey = Symbol.for("tsp-asyncapi.info");

/**
 * State interface representing the extracted info data.
 * It is the value `getInfo` returns, so it is part of the public surface.
 * @public
 */
export interface AsyncAPIInfoState {
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: { name?: string; url?: string; email?: string };
  license?: { name: string; url?: string };
}

const [getInfoInternal, setInfo] = useStateMap<Namespace, AsyncAPIInfoState>(infoStateKey);

const guard = singleApplication(
  Symbol.for("tsp-asyncapi.info.applied"),
  "duplicate-info-decorator",
);

/**
 * Keeps one URL field only when it holds an absolute URL.
 *
 * Three fields of the Info Object carry the `uri` format. The official
 * parser checks that format, and it rejects the whole document when a value
 * fails it. A relative reference such as `/terms` fails it.
 *
 * Only the field is dropped. The rest of `@info` names the application, and
 * none of it is at fault.
 *
 * @param context - The decorator context
 * @param value - The value the author wrote
 * @param field - The name to report, such as `license.url`
 * @param target - Where to report a problem about this field
 * @returns The trimmed URL, or `undefined` when there is none to keep
 */
function urlField(
  context: DecoratorContext,
  value: string | undefined,
  field: string,
  target: DiagnosticTarget,
): string | undefined {
  const url = trimmed(value);
  if (url === undefined) return undefined;
  if (isAbsoluteUrl(url)) return url;
  reportDiagnostic(context.program, {
    code: "invalid-url",
    messageId: "field",
    format: { field, url },
    target,
  });
  return undefined;
}

/**
 * Keeps the `contact` object, with its URL checked.
 *
 * A contact whose every field is blank is left out altogether. An empty
 * Contact Object names nobody, and a reader cannot tell it from a contact
 * the author meant to leave blank.
 */
function contactOf(
  context: DecoratorContext,
  contact: AsyncAPIInfoState["contact"],
  target: DiagnosticTarget,
): AsyncAPIInfoState["contact"] {
  if (contact === undefined) return undefined;
  const kept = {
    ...present("name", trimmed(contact.name)),
    ...present("url", urlField(context, contact.url, "contact.url", target)),
    ...present("email", trimmed(contact.email)),
  };
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/**
 * Keeps the `license` object, with its name and its URL checked.
 *
 * `name` is the one required field of a License Object. A blank one names no
 * license, so it is reported and the whole object is dropped. The URL is not
 * checked in that case, because the license it would point at is gone.
 */
function licenseOf(
  context: DecoratorContext,
  license: AsyncAPIInfoState["license"],
  target: DiagnosticTarget,
): AsyncAPIInfoState["license"] {
  if (license === undefined) return undefined;
  const name = trimmed(license.name);
  if (name === undefined) {
    reportDiagnostic(context.program, { code: "empty-license-name", target });
    return undefined;
  }
  return {
    name,
    ...present("url", urlField(context, license.url, "license.url", target)),
  };
}

/**
 * Sets the AsyncAPI `info` metadata for the service.
 *
 * Every text field is trimmed, and a field left blank is stored as absent.
 * A blank `version` is reported, because the field is required. The version
 * then falls back to the document default. A blank `license.name` is
 * reported too, and the whole license is dropped, because a License Object
 * without a name names no license. A `contact` whose every field is blank is
 * left out rather than emitted empty.
 *
 * `termsOfService`, `contact.url` and `license.url` each carry the `uri`
 * format. A value that is not an absolute URL is reported, and that field
 * alone is dropped.
 *
 * Apply this decorator only once per namespace. A document carries one Info
 * Object, so a second application is reported and discarded.
 *
 * @param context - The decorator context
 * @param target - The namespace to apply this decorator to
 * @param info - The info object matching AsyncAPIInfo shape
 *
 * @example
 * ```typespec
 * @info(#{
 *   version: "1.0.0",
 *   description: "This is a sample Order Service API.",
 *   contact: #{ name: "API Support", email: "support@example.com" },
 *   license: #{ name: "MIT", url: "https://opensource.org/licenses/MIT" }
 * })
 * namespace Orders;
 * ```
 *
 * @public
 */
export function $info(context: DecoratorContext, target: Namespace, info: AsyncAPIInfoState) {
  // Decorators on one declaration run bottom-up, so the application written
  // last in the source runs first and wins. The guard records that this
  // decorator ran, before any value is checked, so a value that fails a
  // check still blocks a later application.
  //
  // Only a first claim runs the checks below. An augment `@@info` runs once
  // per declaration of its target namespace, and a reopened namespace would
  // otherwise report each field problem once per declaration.
  if (guard.claim(context, target) !== "first") return;
  // Report on the info argument. Every field problem below points here.
  const infoTarget = context.getArgumentTarget(0) ?? target;

  const version = trimmed(info.version);
  if (version === undefined) {
    reportDiagnostic(context.program, { code: "empty-info-version", target: infoTarget });
  }

  setInfo(context.program, target, {
    version: version ?? DEFAULT_INFO_VERSION,
    ...present("description", trimmed(info.description)),
    ...present(
      "termsOfService",
      urlField(context, info.termsOfService, "termsOfService", infoTarget),
    ),
    ...present("contact", contactOf(context, info.contact, infoTarget)),
    ...present("license", licenseOf(context, info.license, infoTarget)),
  });
}

/**
 * Reads back the AsyncAPI `info` metadata set by `@info`.
 *
 * The reader hands out a copy. The stored state is what the emitter writes,
 * so handing out the stored object would let a caller change the emitted
 * document by changing what it was given. `contact` and `license` are copied
 * as well, because a shallow copy would still share them.
 *
 * @param program - The program to read the state from
 * @param target - The namespace the decorator was applied to
 * @returns A copy of the recorded info state, or `undefined` when the
 * decorator was never applied
 *
 * @public
 */
export function getInfo(program: Program, target: Namespace): AsyncAPIInfoState | undefined {
  const state = getInfoInternal(program, target);
  if (state === undefined) return undefined;
  return {
    ...state,
    ...present("contact", state.contact === undefined ? undefined : { ...state.contact }),
    ...present("license", state.license === undefined ? undefined : { ...state.license }),
  };
}
