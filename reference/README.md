# Reference

`checkpoint.ts` is a verbatim, read-only copy of the pi extension
(`~/.pi/agent/extensions/checkpoint.ts`, 459 lines) that the shared core is ported from.

It is the parity baseline for FR-015 / SC-006: the core must reproduce its capture, config,
skip-empty, dedup, and prune behavior. One intentional deviation (stateless mtime dedup vs.
the in-memory `lastAutomaticCheckpoint` global) is documented in
`../specs/001-shared-core/research.md` §D2.

Do not edit. Update only if the upstream pi extension changes and parity must be re-baselined.
