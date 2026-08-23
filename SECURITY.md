# Security policy

中文版：[SECURITY.zh-TW.md](./SECURITY.zh-TW.md)

## Supported versions

This project is at 0.x. Only the latest release receives fixes. Upgrade
before you report, and check that the problem is still there.

| Version            | Supported |
| ------------------ | --------- |
| Latest 0.x release | Yes       |
| Anything older     | No        |

## Reporting a vulnerability

Report privately through GitHub, at
[Security > Report a vulnerability](https://github.com/marvin-hsu/tsp-asyncapi/security/advisories/new).

Do not open a public issue for a vulnerability. A public issue tells
everyone about the problem before there is a fix.

Include the TypeSpec source that triggers it, the document the emitter
wrote, and what an attacker gains. A report that shows the input is worth
several that describe it.

You will get a first reply within seven days. This is a single-maintainer
project, so a fix takes as long as it takes. You will be told what is
happening.

## What counts

This is a build-time tool. It reads TypeSpec source and writes an
AsyncAPI document. It runs on a developer machine or in a build, and it
serves no traffic.

These are in scope:

- The emitter writes a document that leaks something the source did not
  put there.
- Compiling a source file executes code that the source did not declare.
- A crafted source makes the emitter write outside its output directory.
- A dependency of the published package carries a known vulnerability.

These are not:

- The emitted document describes an insecure design. The emitter writes
  what the author declared. It does not review the design.
- A `security` field or a security scheme that the specification allows
  and the author chose.
- The emitter accepts input it cannot express and reports a diagnostic.
  That is the intended behaviour.

## Provenance

Most releases are published with npm provenance. The attestation binds the
tarball to this repository and to the workflow run that built it.

0.1.4 through 0.3.0 carry it. 0.4.0, 0.4.1 and 0.4.2 do not: moving the
release to `changeset publish` dropped the `--provenance` flag, and nothing
checked. Releases after 0.4.2 carry it again, and the release run now fails
if the registry says otherwise.

Verify a download with:

```bash
npm audit signatures
```
