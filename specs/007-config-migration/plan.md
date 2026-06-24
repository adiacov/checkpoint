# Implementation Plan: Config Single-Source Migration

**Branch**: `007-config-migration` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-config-migration/spec.md`

## Summary

Consolidate every project to a single canonical `.checkpoint.json`, eliminating the lingering legacy
`.pi/checkpoint.json` second source of truth. Two pieces: (1) a new **core** capability
`migrateConfig(root, { apply })` that, per directory, writes canonical from legacy (preserving
settings) and removes legacy — reusing the existing `loadConfig`/`normalizeConfig`/`writeConfig` so
no config logic is duplicated; and (2) a dependency-free repo-local sweep script
`scripts/migrate-configs.mjs` that discovers sibling projects, applies the per-directory core
migration, and handles the maintenance concerns the core deliberately omits: discovery, dry-run
default, git-dirty skipping, the `004`/`006` ordering guard, and reporting. Never commits; never
removes legacy unless canonical was written first.

## Technical Context

**Language/Version**: Node.js ≥18. Core capability in TypeScript (`@checkpoint/core`, built with the
core's existing `tsc`). Sweep script is a dependency-free ESM `.mjs` (no build), mirroring
`scripts/install.mjs` from `006`.

**Primary Dependencies**: Core capability has none beyond what `config.ts` already uses (`node:fs`,
`node:path`). The sweep uses Node stdlib only (`node:fs`, `node:path`, `node:child_process` for the
git-dirty check) and `@checkpoint/core` (via the built core).

**Storage**: Filesystem. Reads/writes `.checkpoint.json` and removes `.pi/checkpoint.json` across
sibling project dirs; reads git status per sibling; reads `~/.pi/agent/extensions/` for the pi
precondition guard. No manifest/state of its own (the migration is its own idempotent record).

**Testing**: `node:test` (project convention). Core test for `migrateConfig`; script test for the
sweep — both against temporary directory trees; the maintainer's real sibling projects are never
touched.

**Target Platform**: The maintainer's local machine (Linux/macOS).

**Project Type**: Core library capability + one maintenance CLI script (single project).

**Performance Goals**: N/A — one-off interactive sweep; correctness/safety dominate.

**Constraints**: No global `PATH` binary; no in-agent command; no checkpoint-content curation; never
auto-commit; never lose a project's only config copy; idempotent; best-effort across projects.

**Scale/Scope**: Tens of sibling projects, one level deep. Small.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Write the Logic Once** — PASS. The per-directory merge/remove decision and the config
  read/normalize/write all live in `@checkpoint/core`; the script only does discovery, git checks,
  the guard, and reporting. No config logic duplicated.
- **II. Identical Command Surface** — N/A. No runtime/agent command is added; this is a one-off
  maintenance script.
- **III. Raw Capture, Not Curation** — PASS. The migration moves *config*, never reads/summarizes
  checkpoint content.
- **IV. Functional Parity With the Reference** — PASS. No capture behavior changes. The core already
  reads both files; this only removes the now-redundant legacy file after writing canonical. The
  observable config for each project is preserved (FR-003, SC-002).
- **V. Adding an Agent Is a Thin Wrapper** — N/A (no adapter involved).
- **Technical constraints / non-goals** — PASS. No PATH binary, no agent command, no curation; repo
  stays authoritative; the `004` ordering precondition is enforced (FR-008), not bypassed.

No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/007-config-migration/
├── plan.md              # This file
├── research.md          # Phase 0 — migration decision table, ordering-guard, safety decisions
├── data-model.md        # Phase 1 — migrate result, sweep options, report entities
├── contracts/
│   └── migrate-cli.md    # Phase 1 — sweep CLI + core migrateConfig contract
├── quickstart.md        # Phase 1 — how to dry-run, apply, and verify
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
core/
├── src/
│   ├── migrate.ts        # NEW — migrateConfig(root,{apply}) + result type; reuses config.ts
│   └── index.ts          # export migrateConfig + its types
└── tests/
    └── migrate.test.ts   # NEW — all four classifications, dry-run vs apply, settings/disabled preserved

scripts/
└── migrate-configs.mjs   # NEW — sibling sweep: discover → guard → migrate → report

tests/
└── migrate/
    └── migrate-configs.test.mjs  # NEW — dry-run default, --apply, dirty-git skip, guard, idempotency (temp trees)
```

**Structure Decision**: Mirror `006`'s split — mechanical/reusable logic in the core, the cross-
project orchestration in a dependency-free repo-local script. The core gains one small module
(`migrate.ts`) layered directly on `config.ts`; the script is a sibling to `scripts/install.mjs` and
shares its conventions (verbs/flags via stdlib parsing, report lines, temp-root testability).

## Complexity Tracking

No constitution violations — section intentionally empty.
