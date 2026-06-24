# Implementation Plan: Recovery / Integration Workflow

**Branch**: `003-recovery-workflow` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-recovery-workflow/spec.md`

## Summary

Build the back half of the checkpoint lifecycle the core deliberately omits. Two clearly separated
deliverables, split along Constitution Principle III (raw capture, not curation):

1. **Mechanical (code, `@checkpoint/core`)**: a new standalone `archive` capability that moves
   checkpoint files from the pending directory to the archive directory, then reuses the existing
   `pruneArchive`. It accepts an explicit filename list (or, when omitted, archives all pending
   `*.md`), is idempotent and collision-safe (skip-and-report, never overwrite), processes batches
   resiliently, and returns a non-throwing structured `ArchiveResult` — mirroring how `capture`
   reports outcomes. It never reads/curates checkpoint content.
2. **Workflow (agent-driven, docs)**: formalize the single authoritative bounded recovery procedure
   in `WORKFLOWS.md`, and surface the mechanical op through the Claude Code adapter's thin bridge as
   an `archive` subcommand (NOT a fifth slash command). The agent does the curation per its
   judgment; code only moves files.

Technical approach: extend `store.ts` with a pure file-move primitive (`archiveCheckpointFiles`),
add an `archive` orchestration in `api.ts` returning a new `ArchiveResult` type, export both, add a
`runArchive` + `formatArchive` to the adapter bridge and an `archive` subcommand to the adapter CLI.
Update docs (`WORKFLOWS.md`, both READMEs, the agent-mapping contract). Tests at every layer.

## Technical Context

**Language/Version**: TypeScript on Node.js (ESM, `node:` built-ins only), matching the existing
core and adapter (`"type": "module"`, NodeNext).

**Primary Dependencies**: None at runtime. Core has zero runtime deps (enforced by test); the
adapter depends only on `@checkpoint/core`. No new dependencies are introduced.

**Storage**: Filesystem — Markdown checkpoint files under the configured `pendingDir` / `archiveDir`
(`sessions/pending`, `sessions/archive` by default), governed by `.checkpoint.json`.

**Testing**: `node:test` + `node:assert/strict` against temp dirs (deterministic, no network),
consistent with `core/tests/*` and `adapters/claude-code/tests/*`. `prettier --check` for lint;
`tsc` for type-check/build.

**Target Platform**: Linux (the project's stated supported platform).

**Project Type**: Personal CLI/library infrastructure — a shared core library plus per-agent
adapter plugins. Not a published package.

**Performance Goals**: Not performance-sensitive — a handful of small Markdown files per operation.
Correctness and never-lose-a-file are the priorities, not throughput.

**Constraints**: Zero duplicated checkpoint logic in adapters (Principle I); fixed four-command
surface (Principle II); no curation in code (Principle III); parity with the pi reference
(Principle IV); thin documented wrapper per agent (Principle V). No new config surface.

**Scale/Scope**: One new core capability (~1 store primitive + 1 api function + 1 type), one new
adapter subcommand + 2 bridge functions, doc updates. ~3 new test files / additions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Write the Logic Once (Agent-Neutral Core)**: PASS. All move/prune logic lives in the core
  (`store.ts` + `api.ts`); the adapter's `archive` subcommand is a thin dispatch to the core. The
  core imports no agent SDK. Verified by the adapter's existing neutrality/contract test, extended
  for `archive`.
- **II. Identical Command Surface Everywhere**: PASS. No new user-facing slash command is added; the
  four commands (`/checkpoint`, `/checkpoint-optin`, `/checkpoint-disable`, `/checkpoint-status`)
  are unchanged. `archive` is an internal CLI subcommand the recovery workflow invokes, not a
  surface command — documented as such in the mapping table.
- **III. Raw Capture, Not Curation**: PASS. The code only moves files. Extraction of durable bits is
  the agent's job, delivered as the `WORKFLOWS.md` procedure. FR-008/FR-013 + a core test assert
  the archive op never reads file content.
- **IV. Functional Parity With the Reference Extension**: PASS. The pi reference treats recovery as a
  workflow (move processed files to archive), not a command; this mirrors that. Any deviation is
  documented in research.md.
- **V. Adding an Agent Is a Thin, Documented Wrapper**: PASS. The agent-mapping table and READMEs are
  updated to document how recovery/archive is surfaced; the adapter wrapper stays thin.

**Result**: PASS (no violations). Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/003-recovery-workflow/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (core-archive.md, agent-mapping.md)
├── checklists/          # requirements.md (from /speckit-specify), recovery.md (/speckit-checklist)
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
core/
├── src/
│   ├── store.ts         # + archiveCheckpointFiles(): pure file-move primitive
│   ├── api.ts           # + archive(): orchestration → ArchiveResult, reuses pruneArchive
│   ├── types.ts         # + ArchiveResult (and skip/error item shapes)
│   └── index.ts         # export { archive } and ArchiveResult
└── tests/
    ├── store.test.ts    # + archiveCheckpointFiles cases (move, collision, missing, all-mode)
    └── api.test.ts      # + archive() guards, batch, prune, idempotency, no-content-read

adapters/claude-code/
├── src/
│   ├── bridge.ts        # + runArchive(), formatArchive()
│   └── index.ts         # + "archive" subcommand dispatch
├── tests/
│   └── contract.test.ts # + archive subcommand delegates to core, no duplicated logic
└── README.md            # document the recovery/archive subcommand

WORKFLOWS.md             # formalize the single authoritative recovery procedure
core/README.md           # document the archive capability in the API table
STATE.md                 # update on completion (handled at merge per project workflow)
```

**Structure Decision**: Reuse the existing two-package layout (`core/` library + `adapters/claude-code/`
plugin). The feature adds one capability to the core and one thin subcommand to the adapter; no new
package or directory is introduced.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.
