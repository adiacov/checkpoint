# Phase 0 Research: Recovery / Integration Workflow

All Technical Context items were resolvable from the existing codebase and constitution; there were
no open NEEDS CLARIFICATION markers. This document records the decisions that shape the design.

## D1 — Where the mechanical move lives

**Decision**: A pure primitive `archiveCheckpointFiles(root, config, names?)` in `core/src/store.ts`,
orchestrated by a new `archive(cwd, names?, deps?)` in `core/src/api.ts`.

**Rationale**: `store.ts` already owns all filesystem primitives (list/count/write/prune) and `api.ts`
is the stable seam adapters call. This mirrors the existing capture path (`writeCheckpointFile` in
store, `capture` in api) and keeps Constitution Principle I intact — one place for the logic.

**Alternatives considered**: (a) Put the move in the adapter — rejected, violates Principle I.
(b) Fold into `sessionStart` — rejected; `sessionStart` is read-only/prune-only by design and a
clarification fixed `archive` as a standalone sibling capability.

## D2 — Input model (which files to move)

**Decision**: `archive` accepts an optional explicit list of filenames. When omitted/empty it
archives all current pending `*.md` files (reusing `listCheckpointFiles`). `.gitkeep` and non-`.md`
files are never moved.

**Rationale**: The agent decides what is "done" during recovery and passes that set (judgment stays
with the agent, Principle III). The all-mode is an ergonomic convenience for the common "I reviewed
everything" case and is safe because `listCheckpointFiles` already filters to `*.md`.

**Alternatives considered**: All-pending only (less control); content-based selection (would require
reading/interpreting files — forbidden by Principle III).

## D3 — Collision and idempotency strategy

**Decision**: If a same-named file already exists in the archive, skip it and report it as
`already-archived`. Never overwrite, never delete the pending copy in that case (or, if the pending
copy is identical, treat it as already-archived and leave nothing behind that is lost). Re-running on
an already-archived set is a no-op.

**Rationale**: Checkpoint filenames are unique ISO-timestamp strings (`writeCheckpointFile`), so a
true collision is essentially impossible and only happens on a re-run. Skip-and-report guarantees
SC-004 (idempotent) and FR-006 (never silently lose). Note the contrast with `writeCheckpointFile`,
which *renames* on collision — appropriate there because two captures are genuinely distinct, whereas
here a name match means "the same checkpoint is already archived."

**Decision detail**: For a name that exists in *both* pending and archive (re-run after a prior move
left a stray pending copy), the operation removes the redundant pending copy only after confirming
the archive copy is present, so the file is never lost and pending no longer shows it. This is
recorded explicitly so the implementation does not silently drop a differing file — if a same-named
pending file differs in content from the archived one, it is left in place and reported as a
collision skip rather than deleted.

## D4 — Result shape (non-throwing, structured)

**Decision**: Return `ArchiveResult { moved: string[]; skipped: { name; reason }[]; errors: { name; error }[]; prunedCount: number }`. Guard cases (not-configured / missing pending dir) return an empty
result with the relevant skip/flag rather than throwing.

**Rationale**: Matches the spirit of `CaptureResult` (never throw on a normal skip; surface real IO
errors). A batch is resilient: a bad name becomes a `skipped`/`errors` entry, not an abort (FR-004).

**Alternatives considered**: Throwing on missing files (rejected — breaks batch resilience and the
adapter's never-break-the-session contract); returning a bare count (rejected — loses the per-file
detail recovery needs to report).

## D5 — Prune integration

**Decision**: After moving, call the existing `pruneArchive(root, config)` and include its count in
the result.

**Rationale**: Reuses the one prune implementation (no duplication, Principle I) and satisfies FR-005
/ SC-002. Prune is best-effort and never throws, so it cannot fail the archive.

## D6 — Adapter surface

**Decision**: Add `runArchive(cwd, names)` + `formatArchive(result, cwd)` to the bridge and an
`archive` subcommand to the adapter CLI. No new slash-command `.md` file.

**Rationale**: The recovery workflow (agent) invokes `node <bridge> archive [names...] <cwd>` via
Bash during recovery. Keeping it a subcommand — not a slash command — preserves the fixed
four-command surface (Principle II) and parity with the pi reference, where recovery is a workflow
rather than a command. The subcommand is non-lifecycle, so it may surface a non-zero exit on real
error like the other manual commands.

## D7 — Workflow documentation

**Decision**: `WORKFLOWS.md` remains the single authoritative recovery procedure; this feature
tightens it to reference the `archive` op as the explicit close-out step and reconciles the two
existing copies (the "Start of session" list and the "Pending checkpoint handling" section) so they
do not drift. The adapter README documents the `archive` subcommand and points back to `WORKFLOWS.md`.

**Rationale**: FR-012 requires a single authoritative description; the project already centralizes
workflow authority in `WORKFLOWS.md` (per CLAUDE.md). No curation logic moves into code.

## D8 — Parity note with the pi reference

**Decision**: Recovery is modeled as workflow + mechanical move, matching the reference's treatment.
No observable capture/status behavior changes. The only new observable behavior is the archive
operation itself, which the reference accomplished through the same manual move-to-archive step.

**Rationale**: Principle IV — generalize without regressing; the new capability is additive.
