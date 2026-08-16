# Diagnostics

Every warning and error this emitter can report, with what causes it and how to fix it. Diagnostic codes appear in compiler output as `tsp-asyncapi/<code>`.

A common design principle across all of them: **the emitter never silently drops or silently rewrites your intent.** Anything it cannot represent is either omitted with a warning, or reported as an error.

## Errors

### `duplicate-schema-key`

> Duplicate schema name: '\<name\>'. Check @friendlyName decorators and overlap with types in TypeSpec or service namespace.

Two declarations resolved to the same `components.schemas` key. Typical causes: two `@friendlyName`s resolving to the same string, or a declared model whose name matches a template instantiation's derived name (e.g. declaring `model PageString` while also using `Page<string>`).

**Fix:** rename one declaration, or give one of them a distinct `@friendlyName`. The emitter never renames either side automatically.

### `unsupported-payload-type`

> This emitter does not support a \<kind\> here. Use a model, scalar, enum, union, or literal value instead.

A property or payload position names a TypeSpec entity the schema layer cannot convert — an `Interface`, `Namespace`, `Operation`, and so on. The compiler itself does not reject this; only the emitter does.

**Fix:** replace the reference with a model, scalar, enum, union, or literal type.

### `unrepresentable-circular-reference`

> This anonymous type refers back to itself with no named type in between. A plain (non-$ref) schema cannot express that cycle. Give the type a name so it can be referenced through $ref instead.

An anonymous type cycles back to itself, e.g. `alias Foo = { a: Foo };`. Anonymous types inline (they have no `components.schemas` entry), and an inline schema cannot express a cycle.

**Fix:** turn the anonymous type into a named `model`. Named types reference each other through `$ref`, which handles cycles fine.

### `duplicate-message-key`

> Duplicate message name: '\<name\>'. Two @message models resolve to the same components.messages key. Pass an explicit name to @message on one of them.

Two `@message` models resolved to the same `components.messages` key. Typical causes: two same-named models in different namespaces (a message key drops the namespace prefix a schema key keeps), or two `@friendlyName`s resolving to the same string.

Two instantiations of one template that produce the same key are not reported — there is only one `@message` in the source, and both refer to the same emitted component.

**Fix:** pass an explicit name to `@message` on one of them.

### `duplicate-message-decorator`

> @message is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @message.

`@message` is not repeatable. Stacking it silently keeps just one application, so the extra names never reach the document.

**Fix:** remove the extra `@message`.

### `duplicate-content-type-decorator`

> @contentType is applied to this model more than once. A message carries one content type, so only one application takes effect and the rest are discarded. Remove the extra @contentType.

`@contentType` is not repeatable. A message has one `contentType` field, so stacking the decorator would silently discard every value but one.

**Fix:** remove the extra `@contentType`.

### `empty-content-type`

> @contentType was given an empty media type. A blank media type names no format, so it cannot reach the emitted message. This @contentType was dropped, and the message falls back to the document defaultContentType. Give it a media type, such as 'application/json'.

An application of [`@contentType`](./decorators#contenttype) passed the empty string. A blank media type names no format, so the emitter cannot write it into the message.

The message falls back to the document `defaultContentType`, the same result an absent `@contentType` gives. The user typed the empty string on purpose, so that fallback is reported rather than silent.

**Fix:** give the decorator a media type, such as `application/json`, or remove it.

### `duplicate-headers-decorator`

> @headers is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @headers.

`@headers` is not repeatable. Stacking it silently keeps just one application, so the other headers models never reach the document.

**Fix:** remove the extra `@headers`.

### `duplicate-message-headers`

> This message takes its headers from two sources: a field marked @header, and a model given to @headers. There is no rule that picks one over the other, so no `headers` were emitted at all. Keep one of the two sources.

A message declares headers twice: at least one field carries `@header`, and the model also carries `@headers`. The emitter defines no priority between the two, so it emits neither. The marked fields stay in the payload, so nothing you wrote disappears while the error is unresolved.

**Fix:** keep one source. Move the marked fields into the `@headers` model, or drop the `@headers`.

### `headers-not-object`

> The model '\<name\>' given to @headers is backed by an array. AsyncAPI requires the headers schema to be a key/value map, so no `headers` were emitted. Pass a model with properties instead.

The model given to `@headers` emits `type: "array"` — it `is` an array, or it extends one. AsyncAPI requires the `headers` schema to describe a key/value map.

**Fix:** pass a model with properties, or a `Record<T>`-backed model. Both emit an object schema.

### `content-type-header-conflict`

> The header '\<name\>' names the message content type, and this message also carries @contentType. AsyncAPI has one field for the content type, so two sources for it are ambiguous. Remove the @header field and keep @contentType.

A header field is named `content-type` (the comparison uses the emitted wire name and ignores case), and the same message also carries `@contentType`. AsyncAPI keeps the content type in its own message field, so the two sources cannot both be honoured. `@typespec/http` reclassifies such a header because HTTP has no other way to state it; this emitter does have `@contentType`, so it reports instead of choosing.

The check covers both headers mechanisms. The field may carry `@header` on the message model, or it may be a property of the model given to `@headers`, including a property that model inherits.

**Fix:** remove the header field and keep `@contentType`.

### `duplicate-correlation-id-decorator`

> @correlationId is applied to this model more than once. Only one application takes effect, and the rest are discarded. Remove the extra @correlationId.

`@correlationId` is not repeatable. Stacking it silently keeps just one application, so the other locations never reach the document.

**Fix:** remove the extra `@correlationId`.

### `invalid-correlation-id-location`

> '\<location\>' is not a legal correlation id location, so no `correlationId` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/MQMD/CorrelId'.

The location does not match the AsyncAPI runtime expression grammar. The expression starts with `$message.header` or `$message.payload` and is followed by a `#`. Everything after the `#` is a JSON Pointer, so it is either empty or starts with `/`.

The `#` is required. The prose ABNF of the specification reads as if the fragment were optional, but the normative JSON Schema of the specification requires it, and the official AsyncAPI parser rejects a document that carries the bare `$message.header`.

Only the format is checked: the pointer may name a path no schema declares, which AsyncAPI's own examples do.

**Fix:** write a location the grammar accepts, such as `$message.header#/correlationId`.

### `empty-message-example`

> This @messageExample carries neither `headers` nor `payload`, so it shows nothing about the message. This example was dropped. Give it at least one of the two.

An application of `@messageExample` gave an empty value, or gave only `name` and `summary`. A Message Example Object with no content says nothing about the message.

**Fix:** give the example a `headers` value, a `payload` value, or both.

### `empty-tag-name`

> @asyncTag was given an empty name. The `name` of an AsyncAPI Tag Object is required, and no consumer can match a blank one. This tag was dropped. Give it a name.

An application of [`@asyncTag`](./decorators#asynctag) passed the empty string as the tag name. `name` is required on an AsyncAPI Tag Object, so a blank one names nothing a consumer can match.

**Fix:** give the tag a name.

### `conflicting-tag-metadata`

> Tag '\<name\>' is declared more than once here, with a different '\<field\>'. AsyncAPI emits one Tag Object per name on an object, so only one of the two values can be kept. The first one in source order was kept. Merge the @asyncTag applications into one, or give them different names.

Two applications of [`@asyncTag`](./decorators#asynctag) on one target name the same tag and give one of its fields two different values. AsyncAPI emits one Tag Object per name on an object, so one of the two values would have to be dropped. The emitter reports the ambiguity rather than choosing silently.

Applications that set _different_ fields merge instead, and so do a built-in `@tag` and an `@asyncTag` of the same name. The same name on two _different_ targets is never a conflict: AsyncAPI gives every object its own independent `tags` array.

**Fix:** merge the two applications into one, or give them different names.

### `duplicate-server-name`

> Duplicate server name: '\<name\>'. Each @server on a namespace needs its own name, because the name is the key of that server in the emitted document. This @server was dropped, and the first one with this name in source order was kept.

Two `@server` applications on the same namespace share a name. The name is the key of the `servers` map, so the two would collide. The emitter never picks one silently.

**Fix:** Give one of them a different name.

### `empty-server-field`

> Empty server field: '\<field\>'. AsyncAPI requires a value for this field on every server. This @server was dropped.

`host` or `protocol` is blank, or holds only spaces. Both are required by the Server Object. A blank value passes the type check but makes the document invalid, so the whole server is dropped.

**Fix:** Give the field a real value.

### `invalid-server-name`

> Invalid server name: '\<name\>'. AsyncAPI only allows letters, digits, '_', and '-' in a server name. This @server was dropped.

The name is outside the character set AsyncAPI allows for a key of the root `servers` map. This set is stricter than the one for the Components Object. A dot is not allowed here.

**Fix:** Use a name that only holds letters, digits, `_`, and `-`. The emitter never rewrites the name, because that would silently change the key you asked for.

### `empty-channel-address`

> @channel was given a blank address. A blank address names no topic, path, or routing key, so it cannot reach the emitted document. This channel was dropped. Give it an address, such as 'orders.created', or use @dynamicChannel when the address is only known at runtime.

The address is empty, or it only holds whitespace. The channel is dropped.

**Fix:** give the channel an address. Use `@dynamicChannel` when the address is only known at runtime.

### `invalid-channel-address`

> The channel address '\<address\>' carries a query string. AsyncAPI states that a channel address must not use query parameters, and that a channel binding describes them instead. This channel was dropped. Move everything after the '?' into a channel binding.

Three problems report this code. The address holds a query string, the address holds a fragment, or its `{}` pairs are unbalanced or nested. The message names which of the three it is. The channel is dropped in every case.

The scheme and the host are not checked. A full URL such as `wss://example.com/socket` is a legal address.

**Fix:** move a query string or a fragment into a channel binding. Pair up the braces, and do not nest them.

### `invalid-channel-param-name`

> '\<name\>' is not a legal channel address parameter name. Only the characters a-z, A-Z, 0-9, '-', and '_' are allowed, because the name is also the key of that parameter in the emitted `parameters` map and the name of the TypeSpec property that declares it. This channel was dropped.

A `{name}` in the address falls outside the character set. The name is also the name of the TypeSpec property that declares the parameter, so a name outside the set can never be declared.

**Fix:** rename the expression to one that holds only letters, digits, `-`, and `_`.

### `empty-channel-id`

> The channel id given to this decorator is blank. The id is the key of this channel in the emitted `channels` map, and a blank key names nothing. This channel was dropped. Give it an id, or leave the argument out so the interface or namespace name is used.

The explicit channel id argument is empty, or it only holds whitespace.

**Fix:** give the channel an id, or leave the argument out. Without it, the key is the declaration name of the interface or namespace.

### `duplicate-channel-decorator`

> @channel is applied to this interface or namespace more than once. A channel carries one address, so only one application takes effect and the rest are discarded. Remove the extra @channel.

`@channel` is not repeatable. A channel holds one address, so stacking the decorator would silently discard every address but one.

**Fix:** remove the extra `@channel`. Declare a second channel on a second interface or namespace.

### `duplicate-dynamic-channel-decorator`

> @dynamicChannel is applied to this interface or namespace more than once. Only one application takes effect, and the rest are discarded. Remove the extra @dynamicChannel.

`@dynamicChannel` is not repeatable, for the reason `@channel` is not.

**Fix:** remove the extra `@dynamicChannel`.

### `conflicting-channel-decorators`

> @channel and @dynamicChannel are both applied to this interface or namespace. One states an address and the other states that the address is unknown, and no rule picks a winner, so no channel was emitted at all. Keep one of the two.

Both channel decorators reached one target. One states an address, and the other states that the address is unknown. Nothing picks a winner, so the target gets no channel at all.

**Fix:** keep one of the two decorators.

### `duplicate-channel-id`

> Duplicate channel id: '\<id\>'. Each channel needs its own id, because the id is the key of that channel in the emitted document. This channel was dropped, and the first one with this id in source order was kept. Pass an explicit id to @channel on one of them.

Two channels resolved to one key of the `channels` map. Two interfaces of one name in different namespaces do this, because a channel key drops the namespace prefix. Two explicit ids that hold one string do it as well.

**Fix:** pass an explicit id to `@channel` or `@dynamicChannel` on one of them.

### `missing-channel-param`

> The channel address uses '{\<name\>}', but no operation in this channel declares a parameter with that name. AsyncAPI requires the `parameters` map to cover every expression in the address. Add a '\<name\>' parameter to an operation of this channel, or take the expression out of the address.

The address holds an expression that no operation of the channel declares. The emitted `parameters` map still covers the whole address, with an empty Parameter Object for that name.

**Fix:** add the parameter to an operation of the channel, or take the expression out of the address.

### `unused-channel-param`

> The parameter '\<name\>' is not used by the address of channel '\<id\>'. An operation parameter whose type is not a @message model describes a channel address parameter, and this emitter never rewrites the address to absorb one. Add '{\<name\>}' to the address, or mark the parameter type with @message.

An operation of the channel declares a parameter the address never names. Every top-level operation parameter whose type does not carry `@message` describes a channel address parameter, so this one has nowhere to go.

**Fix:** add the expression to the address, or mark the parameter's type with `@message` so it counts as a message instead.

### `non-string-channel-param`

> The channel parameter '\<name\>' is not declared as a string. The AsyncAPI Parameter Object has no `schema` field, so a channel parameter carries no type and its value is always a string. Declare it as a string, a string literal, a union of string literals, or a string-backed enum.

The declared type is not a string type. The AsyncAPI Parameter Object holds `enum`, `default`, `description`, `examples`, and `location`, and no `schema`. So there is nowhere to put a type.

**Fix:** declare the parameter as a string, a string literal, a union of string literals, or a string-backed enum.

### `optional-channel-param`

> The channel parameter '\<name\>' is optional. A Channel Address Expression is a bare '{name}' with no operator, so a separator next to it cannot disappear along with the value, whatever the position in the address. Make the parameter required, and give the Parameter Object a `default` through a TypeSpec default value if it usually carries one value.

The declaration is optional. This is an error whatever the position of the expression in the address. A Channel Address Expression is a bare `{name}`. It has none of RFC 6570's operators, so a separator next to an absent value cannot disappear with it.

**Fix:** make the parameter required. Give it a TypeSpec default value when it usually carries one value. That value becomes the `default` of the Parameter Object.

### `conflicting-channel-param`

> The channel parameter '\<name\>' is declared more than once in channel '\<id\>', with a different '\<field\>'. AsyncAPI emits one Parameter Object per name on a channel, so only one of the two values can be kept. The first one in source order was kept. Give the two declarations the same type, default, documentation, examples, and location.

Two operations of one channel declare one parameter name with a different type, default, `@doc`, `@example`, or `@parameterLocation`. A channel holds one Parameter Object per name, so one of the two values has to go. The first one in source order is kept, so the rest of the document stays readable.

The two types are compared by the values they allow, not by the way they are written. Two operations that each write `"eu" | "us"` inline agree.

**Fix:** give the two declarations the same type, default, documentation, examples, and location.

### `duplicate-parameter-location-decorator`

> @parameterLocation is applied to this property more than once. A channel parameter carries one location, so only one application takes effect and the rest are discarded. Remove the extra @parameterLocation.

`@parameterLocation` is not repeatable. A Parameter Object holds one `location` field.

**Fix:** remove the extra `@parameterLocation`.

### `invalid-parameter-location`

> '\<location\>' is not a legal channel parameter location, so no `location` was emitted. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.payload#/user/id'.

The runtime expression is outside the grammar. It must start with `$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The `#` is required, because the normative JSON Schema of the specification requires it.

**Fix:** write the expression in that form, such as `$message.payload#/user/id`.

### `duplicate-send-decorator`

> @send is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @send.

`@send` is not repeatable. An Operation Object holds one `action` field.

**Fix:** remove the extra `@send`.

### `duplicate-receive-decorator`

> @receive is applied to this operation more than once. An operation carries one action, so only one application takes effect and the rest are discarded. Remove the extra @receive.

`@receive` is not repeatable, for the same reason `@send` is not.

**Fix:** remove the extra `@receive`.

### `conflicting-operation-actions`

> @send and @receive are both applied to this operation. One states that this application sends the message and the other states that it receives one, and no rule picks a winner, so no operation was emitted at all. Keep one of the two.

The two decorators state opposite directions. Nothing picks a winner, so the operation is dropped rather than emitted with an arbitrary action.

**Fix:** keep one of the two. Two directions over one channel are two operations, so write a second operation for the other direction.

### `empty-operation-id`

> The operation id given to this decorator is blank. The id is the key of this operation in the emitted `operations` map, and a blank key names nothing. This operation was dropped. Give it an id, or leave the argument out so the operation name is used.

The id is the key of the operation in the emitted document, and a blank key names nothing.

**Fix:** give the argument an id, or leave it out so the operation name is used.

### `duplicate-operation-id`

> Duplicate operation id: '\<id\>'. Each operation needs its own id, because the id is the key of that operation in the emitted document. This operation was dropped, and the first one with this id in source order was kept. Pass an explicit id to @send or @receive on one of them.

Two operations resolve to one key. The key comes from the explicit id argument, and otherwise from the name of the operation. The first one in source order keeps the key.

**Fix:** pass an explicit id to `@send` or `@receive` on one of them.

### `duplicate-reply-channel-decorator`

> @replyChannel is applied to this operation more than once. A reply points at one channel, so only one application takes effect and the rest are discarded. Remove the extra @replyChannel.

`@replyChannel` is not repeatable. An Operation Reply Object holds one `channel` field.

**Fix:** remove the extra `@replyChannel`.

### `duplicate-reply-address-decorator`

> @replyAddress is applied to this operation more than once. A reply carries one address, so only one application takes effect and the rest are discarded. Remove the extra @replyAddress.

`@replyAddress` is not repeatable. An Operation Reply Object holds one `address` field.

**Fix:** remove the extra `@replyAddress`.

### `invalid-reply-address-location`

> '\<location\>' is not a legal reply address location, so no `address` was emitted on the reply. Write '$message.header#' or '$message.payload#', each optionally followed by a JSON Pointer, such as '$message.header#/replyTo'.

The runtime expression is outside the grammar. It must start with `$message.header#` or `$message.payload#`, and a JSON Pointer may follow. The grammar is the one `@correlationId` and `@parameterLocation` follow.

**Fix:** write the expression in that form, such as `$message.header#/replyTo`.

## Warnings

### `channel-no-messages`

> Channel '\<id\>' has no recognizable messages. Did you forget to annotate the payload models with '@message'? The channel was emitted without a `messages` map.

No operation of the channel names a model that carries `@message`. The channel is still emitted, and the `messages` field is left out. AsyncAPI makes that field optional, so the document stays valid, but a channel with no message is almost always a payload model that lost its `@message`.

**Fix:** mark the payload models with `@message`. Check that the operations sit directly inside the interface or namespace that carries the channel. A nested interface is a separate scope.

### `duplicate-use-server`

> @useServer names the server '\<name\>' more than once on this channel. AsyncAPI requires the entries of a channel's `servers` array to be unique, so one reference was emitted. Remove the extra @useServer.

One name reached `@useServer` twice on one channel. AsyncAPI requires the entries of the array to be unique, so the emitter emits one reference.

**Fix:** remove the extra `@useServer`.

### `use-server-without-channel`

> @useServer names the server '\<name\>', but this interface or namespace carries neither @channel nor @dynamicChannel. Only a channel has a `servers` field, so this @useServer reaches no part of the document. Add @channel, or remove this @useServer.

`@useServer` sits on a target that carries no channel. Only a channel holds a `servers` field, so the application reaches no part of the document.

**Fix:** add `@channel` or `@dynamicChannel` to the target, or remove the `@useServer`.

### `operation-without-channel`

> The operation '\<name\>' carries @send or @receive, and the interface or namespace around it carries no emitted channel. An operation always points at a channel, so this one reaches no part of the document. This operation was dropped. Add @channel or @dynamicChannel to the interface or namespace that holds it.

An operation always points at a channel. The channel may be missing because the target carries no channel decorator. It may also be missing because the declared channel was dropped, such as one that lost a [`duplicate-channel-id`](#duplicate-channel-id) clash.

**Fix:** add `@channel` or `@dynamicChannel` to the interface or namespace that holds the operation. Check that the operation sits directly inside it, because a nested interface is a separate scope.

### `reply-channel-not-a-channel`

> @replyChannel names '\<name\>', and that interface or namespace carries no emitted channel. A reply whose channel is unknown carries neither a checkable message list nor a checkable address, so the whole `reply` object was dropped. Add @channel or @dynamicChannel to '\<name\>'.

The named target carries no channel that reached the document. The whole `reply` object goes, not the channel alone. A partial reply would state something the author never wrote.

**Fix:** add `@channel` or `@dynamicChannel` to the named target.

### `reply-address-needs-dynamic-channel`

> @replyAddress is given, and the reply channel '\<id\>' carries an address. AsyncAPI requires the address of that channel to be null when a reply address is given. The `address` was dropped from the reply, and the rest of the reply was kept. Declare '\<id\>' with @dynamicChannel instead of @channel.

A reply address is what the address of the reply channel is at runtime. A channel that already carries an address would then state two addresses, which AsyncAPI forbids.

**Fix:** declare the reply channel with [`@dynamicChannel`](./decorators#dynamicchannel), or remove the `@replyAddress`.

### `reply-without-action`

> @replyChannel or @replyAddress is applied to an operation that carries neither @send nor @receive. A reply sits on an emitted operation, so this decorator reaches no part of the document. Add @send or @receive to this operation, or remove the reply decorator.

A reply sits on an emitted operation, and only `@send` or `@receive` emits one.

**Fix:** add `@send` or `@receive` to the operation, or remove the reply decorator.

### `duplicate-security-scheme-name`

> Duplicate security scheme name: '\<name\>'. Each @securityScheme needs its own name, because the name is the key of that scheme in components.securitySchemes. This @securityScheme was dropped, and the first one with this name in source order was kept.

Two `@securityScheme` applications share a name. The name is the key of the `components.securitySchemes` map, so the two would collide. The schemes are collected across the whole program, so two applications on different namespaces clash as well.

**Fix:** Give one of them a different name.

### `invalid-security-scheme-name`

> Invalid security scheme name: '\<name\>'. AsyncAPI only allows letters, digits, '.', '-', and '_' in a components key. This decorator was dropped.

The name is outside the character set AsyncAPI allows for a key of the Components Object. A dot is allowed here, unlike in a key of the root `servers` map.

Two decorators report this. `@securityScheme` writes the name as a key of `components.securitySchemes`. `@useSecurity` writes it into a JSON Pointer that addresses such a key, and a character outside the set makes the pointer malformed.

**Fix:** Use a name that only holds letters, digits, `.`, `-`, and `_`. The emitter never rewrites the name.

### `empty-security-scheme-field`

> Empty security scheme field: '\<field\>'. AsyncAPI requires a value for this field on this kind of scheme. This @securityScheme was dropped.

A required string field of the scheme is empty, or holds whitespace only. This covers `name` on `httpApiKey`, `scheme` on `http`, and `openIdConnectUrl` on `openIdConnect`. A blank value passes the type check and then makes the document invalid.

**Fix:** Give the field a value.

### `missing-oauth-flow-url`

> The '\<flow\>' OAuth flow needs a '\<field\>'. A blank value counts as a missing one, because no client can call it. This @securityScheme was dropped.

An OAuth flow leaves out a URL that AsyncAPI requires for that flow. `implicit` and `authorizationCode` need an `authorizationUrl`. `password`, `clientCredentials`, and `authorizationCode` need a `tokenUrl`.

**Fix:** Give the flow the URL it needs.

### `empty-oauth-flows`

> This oauth2 scheme declares no flow. A client then has no way to obtain a token. This @securityScheme was dropped. Declare at least one of `implicit`, `password`, `clientCredentials`, and `authorizationCode`.

The `flows` field of an `oauth2` scheme is an empty object.

**Fix:** Declare at least one flow.

### `invalid-url`

> The '\<field\>' value '\<url\>' is not an absolute URL. AsyncAPI requires an absolute URL here, and a parser rejects the whole document over a relative one. This decorator was dropped. Write a URL with a scheme, such as 'https://example.com/token'.

A URL field holds a value that is not an absolute URL. A relative reference such as `/token` fails, and so does free text. AsyncAPI marks these fields with the `uri` format, and a parser rejects the document over a value that fails it.

Two decorators report this. `@securityScheme` reports it for `openIdConnectUrl` and for the `authorizationUrl`, `tokenUrl`, and `refreshUrl` of each OAuth flow. A flow URL is named together with its flow, such as `implicit.authorizationUrl`. `@externalDocs` reports it for the link it carries, which reaches `info` and every server.

**Fix:** Write the URL with a scheme, such as `https://example.com/token`.

## Warnings

### `undeclared-server-variable`

> The template '{\<name\>}' in this server has no matching entry in `variables`. A reader cannot tell what to put there. The server is still emitted, with the template text unchanged. Add '\<name\>' to `variables`, or take the template out of `host` and `pathname`.

The `host` or the `pathname` of a server holds a `{var}` template, and the `variables` field of the same server declares no entry for that name. The names of both fields are read as one set.

**Fix:** Add the name to `variables`, or remove the template from the field.

### `unused-server-variable`

> The variable '\<name\>' is declared on this server, and neither `host` nor `pathname` uses a '{\<name\>}' template. The variable is still emitted. Use it in one of the two fields, or remove it.

The `variables` field declares an entry that no template refers to. AsyncAPI substitutes a variable into `host` and `pathname` only, so the entry has no effect.

**Fix:** Use the name in one of the two fields, or drop the entry.

### `server-variable-default-not-in-enum`

> The variable '\<name\>' has the default '\<default\>', which is not one of its `enum` values. A client that takes the default then holds a value the same variable forbids. Both values are still emitted.

One variable declares both a `default` and an `enum`, and the default is outside the list. AsyncAPI does not forbid this, so both values reach the document.

**Fix:** Add the default to the `enum`, or change the default to a listed value.

### `blank-server-variable-value`

> The `\<field\>` of the server variable '\<name\>' holds an entry that is blank. A blank entry names no value, so it was dropped. A list left with no entry at all is dropped whole, and the variable is then emitted without it. Give every entry a value, or remove the ones that carry none.

The `enum` or the `examples` of a server variable holds an entry that is empty, or holds whitespace only. Such an entry names no value, so it is dropped. A list that ends up with no entry is left out of the variable altogether.

**Fix:** Give every entry a value, or remove the blank ones.

### `blank-security-scope-name`

> The `scopes` of this security scheme hold an entry that is blank. A blank entry names no scope, so it was dropped. A list left with no entry at all still reaches the document, and AsyncAPI reads it as 'this scheme needs no scope'. Give every entry a scope name, or remove the ones that carry none.

The `scopes` of an `oauth2` or an `openIdConnect` scheme holds an entry that is empty, or holds whitespace only. Such an entry names no scope, so it is dropped. An empty `scopes` still reaches the document, and AsyncAPI reads it as "this scheme needs no scope", which is a different claim.

**Fix:** Give every entry a scope name, or remove the blank ones.

### `use-security-outside-server`

> @useSecurity('\<schemeName\>') on namespace '\<namespace\>' was dropped. The `security` array sits on a server, and this namespace declares no @server. Move this @useSecurity to the namespace that carries @server.

`@useSecurity` is applied to a namespace that declares no server. The emitter writes the `security` array onto a server object, so the application has nowhere to go.

**Fix:** Move the `@useSecurity` to the namespace that carries `@server`, or use `@@useSecurity` to augment it from where you are.

### `undeclared-security-scheme`

> @useSecurity('\<schemeName\>') names a security scheme that no @securityScheme defines. The emitted reference would point at nothing, and no parser could resolve it. This entry was dropped. Declare a @securityScheme with this name, or correct the name.

`@useSecurity` names a scheme that the program never declares. The entry on a server is a reference into `components.securitySchemes`, so the reference would address a key the document does not carry.

**Fix:** Add a `@securityScheme` with this name, or correct the name in the `@useSecurity`.

> > > > > > > d5286af (feat(servers): add server variables, security schemes and externalDocs)

### `message-key-shadows-schema-key`

> Message name '\<name\>' is also the components.schemas key of a different type, so a reader can misread this message as describing that type. A message key drops the namespace prefix that a schema key keeps, which makes the two overlap. Pass a different name to @message.

The document stays valid — `components.messages` and `components.schemas` are separate maps, so nothing actually collides. The risk is to the reader: `components.messages.Sales.Ev` and `components.schemas["Sales.Ev"]` look like the same thing while describing different types.

**Fix:** pass a different name to `@message`.

### `sanitized-message-key`

> Message name '\<requested\>' is not a legal components.messages key, so it was emitted as '\<emitted\>'. A key may only use the characters a-z, A-Z, 0-9, '.', '-', and '_'.

The name given to `@message` falls outside the Components Object key charset, so the emitter encoded the offending characters. The emitted key is therefore not the string that was asked for.

**Fix:** pass a name that only uses `a-z`, `A-Z`, `0-9`, `.`, `-`, and `_`.

### `nested-header-ignored`

> This @header marks a property that is not a top-level field of a @message model, so it stays in the payload schema. Only a top-level field is lifted into `headers`. Move the property to the message model, or describe the whole headers object with @headers.

`@header` marks a property the emitter cannot lift: it sits inside a model that a payload refers to, rather than on the message model itself. The payload of a message is one object, and its headers are a sibling of that object. A field two levels down has no such sibling to move to, and lifting it would silently restructure the payload around it. `@typespec/http` reads metadata off the top level for the same reason.

**Fix:** move the property to the message model, or describe the whole headers object with `@headers`.

### `inherited-header-ignored`

> This @header marks a property that '\<message\>' inherits through 'extends', so it stays in the payload schema. Only a property the message model declares itself is lifted into `headers`. Spread the base model with '...' instead of extending it, or describe the whole headers object with @headers.

`@header` marks a property that the message inherits through `extends`. Such a property is a top-level field of the emitted payload, so this case gets its own message rather than the one above.

A base model is a declaration of its own, shared by every model that extends it, and the payload refers to it through `allOf`. Lifting a field out of it would change every other user of that base model too. A spread, `...Base`, copies the properties into the message model instead, so those fields are the message's own and they are lifted.

**Fix:** spread the base model with `...`, or describe the whole headers object with `@headers`.

### `server-outside-service`

> Server '\<name\>' on namespace '\<namespace\>' was dropped. This emitter reads the servers of the service namespace only. Move this @server to the service namespace this document is emitted from.

`@server` is applied to a namespace that is not the service namespace this document comes from. The emitter reads servers from the service namespace only, the same source as `info`.

**Fix:** Move the `@server` to the service namespace, or use `@@server` to augment it from where you are.

### `multiple-services`

> Multiple services found. AsyncAPI only supports one service per document. The first one will be used.

More than one namespace carries `@service`. The emitter uses the first and ignores the rest.

**Fix:** keep one `@service` per compilation, or split services into separate `tsp compile` runs.

### `unserializable-example`

> This @example could not be serialized to JSON and was omitted from the emitted schema.

An `@example` value contains something the compiler cannot serialize to plain JSON (an unsupported scalar constructor, a malformed `duration.fromISO(...)` value, ...). The example is dropped; the schema itself is unaffected.

**Fix:** simplify the example value to JSON-representable parts.

### `unserializable-message-example`

> This @messageExample could not be serialized to JSON and was dropped from the emitted message.

A `@messageExample` value contains something the compiler cannot serialize to plain JSON (an unsupported scalar constructor, a malformed `duration.fromISO(...)` value, ...). The whole entry is dropped, including its serializable sibling fields. An entry that kept half its payload would show a message the application never sends.

**Fix:** simplify the example value to JSON-representable parts.

### `unrepresentable-numeric-constraint`

> This @\<decorator\> constraint could not be represented as a JSON number (its value overflows or loses precision as a JS number) and was omitted from the emitted schema.

A `@minValue`/`@maxValue`/`@minLength`/... bound overflows or loses precision as a JavaScript number — e.g. `@maxValue(9223372036854775807)` on an `int64`. The keyword is omitted rather than emitted with a corrupted value.

**Fix:** use a bound that fits exactly in a double (up to ±2^53), or drop the constraint.

### `unsupported-temporal-range-constraint`

> This @\<decorator\> constraint targets a date/time/duration value, which draft-07 JSON Schema cannot express as a `minimum`/`maximum`, and was omitted from the emitted schema.

`@minValue`/`@maxValue` on a temporal scalar (`utcDateTime`, `plainDate`, `duration`, ...). Those emit as `type: string` schemas, and draft-07 has no keyword to bound a string-typed date.

**Fix:** remove the constraint, or express it as documentation (`@doc`).

### `missing-discriminator-property`

> @discriminator("\<property\>") names a property that is not defined on this model. AsyncAPI requires the discriminating property to be defined here, so `discriminator` was omitted from the emitted schema.

**Fix:** declare the named property on the model (or an ancestor), or fix the property name in `@discriminator`. Note it must be the **TypeSpec** property name, not an `@encodedName` wire name.

### `optional-discriminator-property`

> @discriminator("\<property\>") names a property that is optional on this model. AsyncAPI requires the discriminating property to be required, so `discriminator` was omitted from the emitted schema.

**Fix:** make the discriminating property required (remove the `?`).

### `encoded-name-override-conflict`

An overriding property's `@encodedName` differs from the same-named ancestor property's wire name. The usual `allOf: [$ref Base, own]` shape would then require **both** wire names at once, rejecting every valid payload. The emitter flattens the model's schema instead (inherited properties inlined, no `$ref` to the base).

**Fix:** give the override the same `@encodedName` as the ancestor's, or rename at one level only.

### `never-typed-property-override`

A property is declared `never` to remove an inherited property, but the base's `$ref` branch would still require it. As above, the emitter flattens the schema (with the `never`-typed property omitted).

**Fix:** none needed if flattening is acceptable — this warning documents the shape change. Otherwise restructure the hierarchy so the property isn't inherited in the first place.
