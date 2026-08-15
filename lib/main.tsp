import "../dist/src/decorators/index.js";

using TypeSpec.Reflection;

namespace AsyncAPI;

extern dec info(target: Namespace, info: valueof AsyncAPIInfo);
// Declares one server the application connects to. The `name` argument
// becomes the key in the emitted `servers` map.
// Repeatable: apply it more than once on the same namespace to declare
// more than one server.
// Apply it to the service namespace. The emitter reads the servers from
// that namespace only, and warns about a server on any other namespace.
// Every field is trimmed. A blank optional field counts as absent and is
// left out of the emitted document.
extern dec server(target: Namespace, name: valueof string, config: valueof AsyncAPIServer);
// Target is unknown because externalDocs can be applied to Namespace, Model, Operation, Message, etc.
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);
// Marks a union's schema to emit `oneOf` (mutually exclusive variants)
// instead of the default `anyOf`.
extern dec oneOf(target: Union);
// Adds one raw key/value pair to a model's or property's own emitted schema.
// Repeatable: apply it more than once on the same target to add more than
// one pair.
extern dec jsonSchemaExtension(target: Model | ModelProperty, key: valueof string, value: valueof unknown);
// Marks a model as an AsyncAPI message. The model itself is the payload.
// The target stays restricted to `Model`. A scalar payload must be wrapped
// in a model.
// `name` overrides the `components.messages` key. Without it, the key comes
// from the model's own name.
extern dec message(target: Model, name?: valueof string);

model AsyncAPIInfo {
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: ContactInfo;
  license?: LicenseInfo;
}

model AsyncAPIServer {
  host: string;
  protocol: string;
  protocolVersion?: string;
  pathname?: string;
  title?: string;
  summary?: string;
  description?: string;
}

model ContactInfo {
  name?: string;
  url?: string;
  email?: string;
}

model LicenseInfo {
  name: string;
  url?: string;
}
