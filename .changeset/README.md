# Changesets

This directory records which packages a change should release, and at what
bump. `pnpm changeset` writes one file per change.

## Why this is here

The two packages version independently. `tsp-asyncapi-core` is at 0.1.0 and
`tsp-asyncapi` is at 0.4.0, and neither number follows the other.

Independent versioning has one step that is easy to get wrong by hand: when
core takes a minor, the emitter's dependency range has to move and the emitter
itself needs a release to carry it. Forget that, and a published emitter asks
for a core it was never tested against. Changesets does that arithmetic.

## The changelogs are not generated

`changelog` is `false` in `config.json`. The four changelog files are written by
hand, in English and Traditional Chinese, and they explain why a change was
made rather than listing what changed. Generated bullet lists would replace
that with less.

So a changeset here decides **versions only**. Write the changelog entry
separately, in the package it belongs to.

## Releasing

```bash
pnpm changeset            # record intent: which packages, which bump
pnpm changeset version    # compute versions and update dependency ranges
```

Commit the result, open a PR, merge it. Then run the release workflow from the
Actions tab. Nothing publishes on its own.

`changeset publish` only publishes a version that is not on the registry
already, so running it twice is harmless.
