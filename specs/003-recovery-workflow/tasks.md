# Tasks: Recovery / Integration Workflow

**Feature**: `003-recovery-workflow` | **Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

Tests are included — the project convention (`core/tests`, `adapters/claude-code/tests`) is
test-alongside, and the spec/quickstart define explicit behavioral contracts to verify.

**Paths** are repo-relative. Core: `core/`. Adapter: `adapters/claude-code/`.

---

## Phase 1: Setup

- [x] T001 Confirm baseline is green before changes: run `npm run lint && npm run build && npm test` in both `core/` and `adapters/claude-code/`; record any pre-existing failures so new work is distinguishable.

---

## Phase 2: Foundational (blocking prerequisites)

- [x] T002 Add the `ArchiveResult`, `ArchiveSkip`, and `ArchiveError` types (per [data-model.md](./data-model.md)) to `core/src/types.ts`, including the skip-reason union `"not-found" | "already-archived" | "not-checkpoint"`.

---

## Phase 3: User Story 1 — Archive processed checkpoints (P1) 🎯 MVP

**Goal**: The shared core can mechanically move pending checkpoints to the archive: explicit list or
all-pending, idempotent, collision-safe, batch-resilient, prune-integrated, never reads content.

**Independent test**: With files in `pending/`, call `archive` and confirm files land in `archive/`,
leave `pending/`, prune is enforced, and the result reports moved/skipped/errors (per
[contracts/core-archive.md](./contracts/core-archive.md) C1–C10).

- [x] T003 [P] [US1] Add `archiveCheckpointFiles(root, config, names?)` pure primitive in `core/src/store.ts`: resolve pending/archive dirs; in all-mode use `listCheckpointFiles` (only `*.md`); for each name move pending→archive via rename-or-copy+unlink; skip `.gitkeep`/non-`.md` as `not-checkpoint`; skip missing as `not-found`; skip name already in archive as `already-archived` (never overwrite, never lose); return per-file move/skip/error outcomes. Must NOT read file content.
- [x] T004 [US1] Add `archive(cwd, names?, deps?)` orchestration in `core/src/api.ts`: `detectProject`; guard not-configured → empty `ArchiveResult` (no throw); call `archiveCheckpointFiles`; then call existing `pruneArchive` and set `prunedCount`; assemble and return `ArchiveResult`. Add the doc-comment in the file's established style.
- [x] T005 [US1] Export `archive` and the `ArchiveResult`/`ArchiveSkip`/`ArchiveError` types from `core/src/index.ts`.
- [x] T006 [P] [US1] Add store tests in `core/tests/store.test.ts` for `archiveCheckpointFiles`: move one/many, all-mode ignores `.gitkeep`, explicit `.gitkeep`→`not-checkpoint`, missing→`not-found`, collision→`already-archived` with no overwrite/loss, absent pending dir → empty.
- [x] T007 [P] [US1] Add api tests in `core/tests/api.test.ts` for `archive`: C1 batch move, C2 partial/missing, C3 prune-on-archive enforces `maxArchivedCheckpoints`, C4 collision skip, C7 not-configured no-op, C8 absent dir no-op, C9 idempotent re-run, C10 never-reads-content (e.g. spy/`readFileSync` not invoked, or assert content untouched).
- [x] T008 [US1] Run `npm run lint && npm run build && npm test` in `core/`; all archive cases green.

**Checkpoint**: Core `archive` capability complete and verified — MVP deliverable.

---

## Phase 4: User Story 2 — Run the bounded recovery workflow (P2)

**Goal**: A single authoritative, portable recovery procedure that drives the agent to review →
curate (durable-only, no bulk-copy) → archive, with the archive close-out step referencing the
core op.

**Independent test**: Follow `WORKFLOWS.md` recovery against a project with pending checkpoints;
durable memory gains only still-relevant items, raw transcripts are not bulk-copied, processed files
end in `archive/`.

- [x] T009 [US2] Formalize recovery in `WORKFLOWS.md`: reconcile the "Start of session" step 3 and the "Pending checkpoint handling" section into one authoritative procedure (no conflicting copies, FR-012); make the final archive step explicit and reference the mechanical `archive` op; keep curation as agent judgment (durable-only, never bulk-copy raw transcripts, FR-010/FR-011/FR-013).
- [x] T010 [P] [US2] Verify no other doc duplicates/contradicts the recovery procedure (grep `STATE.md`, `CLAUDE.md`, `core/README.md`, adapter `README.md` for pending/archive/recovery wording); point any mention back to `WORKFLOWS.md` rather than restating steps (SC-007).

**Checkpoint**: Recovery workflow is single-sourced and ends in the mechanical archive step.

---

## Phase 5: User Story 3 — Consistent surface across agents (P3)

**Goal**: Claude Code reaches the archive capability through a thin bridge with zero duplicated
move/prune logic; add-an-agent docs/mapping reflect it.

**Independent test**: Inspect the adapter — archive reached only via the core; run the `archive`
subcommand end to end; mapping/README updated.

- [x] T011 [US3] Add `runArchive(cwd, names)` and `formatArchive(result, cwd)` to `adapters/claude-code/src/bridge.ts`: call core `archive`; render moved/skipped/errors/prune per [contracts/core-archive.md](./contracts/core-archive.md) output table; not-configured message mirrors existing wording. No move/prune logic here.
- [x] T012 [US3] Wire the `archive` subcommand in `adapters/claude-code/src/index.ts`: parse trailing `cwd` + leading filename args, dispatch to `runArchive`; non-lifecycle (may exit 1 on top-level error); update the unknown-subcommand help string.
- [x] T013 [P] [US3] Extend `adapters/claude-code/tests/contract.test.ts`: assert the `archive` subcommand delegates to the core and the adapter reimplements no move/prune logic (neutrality), plus a smoke case (move via subcommand against a temp project).
- [x] T014 [P] [US3] Document the `archive` subcommand in `adapters/claude-code/README.md` (how the recovery workflow invokes it; explicitly note it is not a fifth slash command).
- [x] T015 [US3] Run `npm run lint && npm run build && npm test` in `adapters/claude-code/`; contract + smoke green.

**Checkpoint**: Adapter surfaces archive via the thin bridge; discipline verified.

---

## Phase 6: Polish & Cross-Cutting

- [x] T016 [P] Document the `archive` capability in `core/README.md` API table (signature, all-mode, idempotent/collision-safe, returns `ArchiveResult`, reuses prune).
- [x] T017 [P] Update the per-agent mapping: fold the 003 rows from [contracts/agent-mapping.md](./contracts/agent-mapping.md) into the canonical table reference, and tick the add-an-agent checklist items this feature satisfies.
- [x] T018 Run [quickstart.md](./quickstart.md) end-to-end validation (bridge smoke: status → archive → status; targeted archive; missing-name) and confirm SC-001..SC-007.
- [x] T019 Update `STATE.md`: mark 003 done/merged, set next feature (004 pi adapter), note any residual risk; summarize what changed and how verified.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002)** → everything else.
- **US1 (T003–T008)** depends only on T002. This is the MVP and unblocks US2 and US3.
- **US2 (T009–T010)** depends on US1 (the archive op must exist to reference as the close-out step).
- **US3 (T011–T015)** depends on US1 (bridge calls core `archive`). Independent of US2.
- **Polish (T016–T019)** after the stories it documents/validates.

## Parallel Opportunities

- Within US1: T003 and the test scaffolds T006/T007 can be drafted in parallel; T006/T007 finalize after T003/T004.
- US2 (docs) and US3 (adapter) can proceed in parallel once US1 is green.
- Polish T016 and T017 are independent `[P]`.

## Implementation Strategy

**MVP = User Story 1** (T001–T008): the core `archive` capability is the whole reason pending stops
piling up and the prune has something to act on. Ship/verify it first, then layer the workflow
formalization (US2) and the adapter surface (US3), then polish.
