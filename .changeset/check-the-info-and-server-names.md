---
"tsp-asyncapi-core": minor
"tsp-asyncapi": minor
---

Check what `@info` carries, and check the server name `@useServer` names.

`@info` checked nothing. `termsOfService`, `contact.url` and `license.url`
each carry the `uri` format, and the official parser rejects the whole
document over a value that is not an absolute URL. A blank `version` was
swapped for the document default in silence. A second `@info` overwrote the
first one without a word.

Every text field of `@info` is trimmed now. The three URL fields go through
the absolute URL check, and a rejected one reports `invalid-url` and is
dropped on its own. The rest of the decorator is kept, because the version
and the description are not at fault. A blank `version` reports the new
`empty-info-version` and still falls back to the default. A license with a
blank name reports the new `empty-license-name`, and the whole license is
dropped. A second `@info` on one namespace reports the new
`duplicate-info-decorator`.

`@useServer` took a bare string and checked nothing. A blank name reached the
document as `$ref: "#/servers/"`. A name that no `@server` declares reached it
as a reference to nothing. Both make the official parser reject the whole
document, and neither was reported.

The name is tested as written against the character set `@server` uses for the
key it declares. A name outside that set reports the new
`invalid-use-server-name`, and the `@useServer` is dropped. Whether a `@server`
declares the name is checked while the document is built, because a `@server`
can arrive after the decorator runs. An undeclared name reports the new
`undeclared-used-server`, which is a warning, and the entry is dropped.

`@asyncTag` and `@contentType` trim before the blank check. A value of spaces
alone passed a length test before, so the tag carried a name no consumer can
match and the message carried a media type that names no format. Both report
the code they already had, and both record the trimmed value.

An augment decorator that runs more than once is accepted. An augment
decorator runs once per declaration of its target, so one `@@info` statement
ran again for every reopened `namespace` block. The second run looked like a
second application, and it reported a build-breaking error. The guard records
where the application was written, so a repeat run of one statement proceeds.
Two distinct statements are still reported.

Every public reader hands out a copy. `getInfo`, `getExternalDocs`,
`getCorrelationId`, `getAsyncTags`, `getMessageExamples` and
`getJsonSchemaExtensions` returned the stored state itself, so a caller could
change the emitted document by changing what a reader gave it.

`AsyncAPIInfoState`, `ExternalDocsState`, `JsonSchemaExtensionRecord`,
`AsyncAPISecuritySchemeState`, `AsyncAPIServerState` and
`AsyncAPIServerVariableState` are `@public`. Each is the return type of a
`@public` reader, and each was tagged `@internal` before.

A build can fail where it succeeded before. Five of the new codes are errors:
`invalid-url` on an `@info` field, `empty-info-version`, `empty-license-name`,
`duplicate-info-decorator` and `invalid-use-server-name`. A project that wrote
a relative URL in `@info`, a blank `version`, a blank license name, two `@info`
on one namespace, or a `@useServer` name outside the allowed character set
built without a word before this release. That build fails now. Each of those
five sources also produced a document the official parser rejects.
