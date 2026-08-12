import "../dist/src/decorators/index.js";

using TypeSpec.Reflection;

namespace AsyncAPI;

extern dec info(target: Namespace, info: valueof AsyncAPIInfo);
// Target is unknown because externalDocs can be applied to Namespace, Model, Operation, Message, etc.
extern dec externalDocs(target: unknown, url: valueof string, description?: valueof string);

model AsyncAPIInfo {
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: ContactInfo;
  license?: LicenseInfo;
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
