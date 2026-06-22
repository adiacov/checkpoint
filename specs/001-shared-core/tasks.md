---
description: "Task list for Shared Checkpoint Core implementation"
---

# Tasks: Shared Checkpoint Core

**Input**: Design documents from `/specs/001-shared-core/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/core-interface.md, quickstart.md

**Tests**: INCLUDED — the feature explicitly requests an automated suite (research §D8,
quickstart "Automated equivalent: `npm test`", plan.md project structure lists six test files).
Parity with the reference pi extension (FR-015) is verified behaviorally.

**Organization**: Tasks are grouped by user story. US1 (Capture) and US2 (Opt-in) are both
P1 and together form the MVP; US3 (session-start/status) is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, and Polish carry no story label)
- All paths are repo-relative; the core lives under `core/`.

## Path Conventions

- Source: `core/src/` — `types.ts`, `config.ts`, `git.ts`, `entries.ts`, `checkpoint.ts`,
  `store.ts`, `api.ts`, `index.ts`
- Tests: `core/tests/` — `config.test.ts`, `git.test.ts`, `entries.test.ts`,
  `checkpoint.test.ts`, `store.test.ts`, `api.test.ts`
- Manifests: `core/package.json`, `core/tsconfig.json`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the `core/` library scaffold so all later work compiles and tests run.

- [X] T001 Create the `core/` library structure (`core/src/` and `core/tests/` directories) per plan.md §Project Structure
- [X] T002 Create `core/package.json` with `name`, `"type": "module"`, and `build` / `test` / `lint` scripts; devDeps only (`typescript`, `tsx`) per plan.md Technical Context (zero runtime deps)
- [X] T003 [P] Create `core/tsconfig.json` targeting NodeNext / ES2022 with `declaration: true` (emit `.d.ts` for adapters) per plan.md + research §"Open items"
- [X] T004 [P] Add linter/formatter configuration under `core/` consistent with ENGINEERING.md defaults

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, config read/normalize, git access, and the project resolver that
every capability depends on.

**⚠️ CRITICAL**: No user story can be completed until this phase is done.

- [ ] T005 [P] Define all shared types in `core/src/types.ts` — `CheckpointConfig`, `ProjectContext`, `ConversationEntry`, `ContentBlock`, `CommandRunner`, `CoreDeps`, `GitFacts`, and result types (`CaptureResult`, `OptInResult`, `StatusResult`, `SessionStartResult`) per data-model.md + contracts/core-interface.md
- [ ] T006 Implement config load + `normalizeConfig` in `core/src/config.ts`: read `.checkpoint.json`, fall back to legacy `.pi/checkpoint.json`, apply every documented default and clamp (positive-int fields, reject absolute/`..` dirs, strict `enabled === true`, `skipEmptySessions !== false`) per data-model.md CheckpointConfig table + research §D3 (FR-008, FR-009) — depends on T005
- [ ] T007 [P] Implement `core/src/git.ts`: default `node:child_process` `CommandRunner`, `resolveRoot` via `git rev-parse --show-toplevel` (fallback to cwd), and `gitFacts` collecting branch/status/diff-stat/last-5-commits in parallel with safe fallbacks for non-repo/non-zero exits per research §D4 (FR-002) — depends on T005
- [ ] T008 [P] Implement shared store primitives in `core/src/store.ts`: `ensureDir`, resolve pending/archive paths from config, list `*.md` checkpoints, and `pendingCount` / `archivedCount` per data-model.md Stores — depends on T005
- [ ] T009 Implement `detectProject(cwd, deps)` in `core/src/api.ts` (resolve root via T007, load+normalize config via T006) and create `core/src/index.ts` re-exporting the public surface per contracts/core-interface.md — depends on T006, T007

**Checkpoint**: Foundation ready — user stories can now proceed.

---

## Phase 3: User Story 1 - Capture a checkpoint at session end (Priority: P1) 🎯 MVP

**Goal**: Given caller-supplied conversation entries and a cwd, write a correctly-formatted
checkpoint markdown to `pending/`, honoring skip-empty, reload, dedup, truncation, and
non-repo degradation, surfacing IO failures instead of dropping silently.

**Independent Test**: Drive `capture(cwd, "manual", { entries })` against a temp git repo and
assert a `pending/*.md` file with the expected header, git facts, and recent messages
(quickstart Scenarios 2–5, 8).

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [ ] T010 [P] [US1] Entry-normalization tests in `core/tests/entries.test.ts`: `messageToText`, thinking→`[thinking omitted]`, toolCall→`[tool call: name] {…}`, image→`[image omitted]`, truncation marker, real-user-message detection (FR-004, FR-005)
- [ ] T011 [P] [US1] Markdown-format tests in `core/tests/checkpoint.test.ts`: title, Time/Reason/Project root/CWD/Session-file header, Integration note, Git facts block, Recent conversation sections (FR-003)
- [ ] T012 [P] [US1] Git-facts tests in `core/tests/git.test.ts`: injected fake runner for deterministic facts + non-repo degradation to fallbacks (FR-002)
- [ ] T013 [US1] Capture integration + store-write tests in `core/tests/api.test.ts` and `core/tests/store.test.ts`: written-path, skip-empty, reload skip, stateless dedup within window, bounded output, unwritable-dir error surfacing (FR-001, FR-005, FR-006, FR-007, FR-011, FR-016; quickstart Scenarios 2–5, 8)

### Implementation for User Story 1

- [ ] T014 [P] [US1] Implement `core/src/entries.ts`: content-block rendering (text/thinking/toolCall/image/other), `truncate(text, maxTextPerEntry)` with `[truncated N chars]`, last-`recentEntries` selection, and real-user-message detection per data-model.md ConversationEntry (FR-004, FR-005)
- [ ] T015 [P] [US1] Implement `core/src/checkpoint.ts`: assemble the markdown body (title, header lines, `## Integration note`, `## Git facts`, `## Recent conversation` with `### role — timestamp`) per research §D6 (FR-003)
- [ ] T016 [US1] Extend `core/src/store.ts` with `writeCheckpoint` (unique filename `${ISO…}-${safeReason}.md`, numeric suffix on collision per research §D5) and `newestPendingMtime` for dedup (FR-006, edge case clock-skew) — depends on T008
- [ ] T017 [US1] Implement `capture(cwd, reason, deps)` in `core/src/api.ts`: guards in order (not-configured/disabled → skip; reload && !includeReload → skip; skip-empty → skip; dedup within `dedupWindowSeconds` → skip), then write via T016 and return `CaptureResult`; wrap IO failures into `error` (FR-001–FR-007, FR-011, FR-016) — depends on T014, T015, T016, T006, T007

**Checkpoint**: US1 fully functional — checkpoints capture independently and pass quickstart Scenarios 2–5 & 8.

---

## Phase 4: User Story 2 - Opt a project in and configure capture (Priority: P1)

**Goal**: Opt a fresh project in (write `.checkpoint.json` with defaults, create
pending/archive dirs + `.gitkeep`, append idempotent `.gitignore` rules) and support disable;
capture (US1) only runs for opted-in, enabled projects.

**Independent Test**: Call `optIn(cwd)` on a fresh repo and assert config, dirs, `.gitkeep`s,
and ignore rules exist; re-run adds no duplicate rules and preserves `createdAt`; `disable`
flips only `enabled` (quickstart Scenarios 1 & 7).

### Tests for User Story 2 ⚠️ (write first, ensure they fail)

- [ ] T018 [P] [US2] Config tests in `core/tests/config.test.ts`: every default applied, legacy `.pi/checkpoint.json` read, clamps/rejections, write round-trip (tab-indented, `createdAt` preserved, `updatedAt` set) (FR-008, FR-009)
- [ ] T019 [US2] Opt-in/disable tests in `core/tests/store.test.ts` and `core/tests/api.test.ts`: dirs + `.gitkeep` created, `.gitignore` rules added once (idempotent), disable leaves dirs/ignore/checkpoints intact (FR-010, FR-017; quickstart Scenarios 1 & 7)

### Implementation for User Story 2

- [ ] T020 [US2] Add `writeConfig` to `core/src/config.ts`: write canonical `.checkpoint.json` tab-indented, preserve `createdAt`, set `updatedAt` per data-model.md state transitions (FR-008) — depends on T006
- [ ] T021 [US2] Add opt-in setup to `core/src/store.ts`: create pending/archive dirs with tracked `.gitkeep`, append `pendingDir/*.md` and `archiveDir/*.md` to `.gitignore` idempotently, reporting newly added rules (FR-010, SC-004) — depends on T008
- [ ] T022 [US2] Implement `optIn(cwd, deps)` in `core/src/api.ts`: write enabled config with defaults (T020), run dir/ignore setup (T021), return `OptInResult` (FR-008, FR-009, FR-010) — depends on T020, T021
- [ ] T023 [US2] Implement `disable(cwd, deps)` in `core/src/api.ts`: set `enabled=false` + `updatedAt` only, leaving dirs/ignore/checkpoints intact (FR-017) — depends on T020

**Checkpoint**: US1 + US2 form the MVP — a fresh project opts in and captures its first checkpoint (SC-002).

---

## Phase 5: User Story 3 - Surface and bound pending checkpoints at session start (Priority: P2)

**Goal**: At session start report the pending count and prune the archive to
`maxArchivedCheckpoints` (oldest first, never moving pending→archive); expose `status`.

**Independent Test**: Seed `archive/` with `max + 3` files and `pending/` with 2, call
`sessionStart(cwd)`, assert `pendingCount:2` / `prunedCount:3` and archive trimmed to max;
`status` reports enabled state, dirs, and both counts (quickstart Scenarios 6 & 7).

### Tests for User Story 3 ⚠️ (write first, ensure they fail)

- [ ] T024 [US3] Prune + session-start + status tests in `core/tests/store.test.ts` and `core/tests/api.test.ts`: oldest-first prune to max, no prune at/below max, pending count correct, status fields per contract (FR-012, FR-013, FR-018; quickstart Scenario 6)

### Implementation for User Story 3

- [ ] T025 [US3] Add `pruneArchive` to `core/src/store.ts`: list `archiveDir/*.md` lexicographically, unlink oldest excess best-effort (prune failure never fails capture), return pruned count per data-model.md Prune rule (FR-013, SC-005) — depends on T008
- [ ] T026 [US3] Implement `sessionStart(cwd, deps)` in `core/src/api.ts`: prune via T025 and return `{ pendingCount, prunedCount }`; never move pending→archive (FR-012, FR-013) — depends on T025
- [ ] T027 [US3] Implement `status(cwd, deps)` in `core/src/api.ts`: return `{ configured, enabled, pendingDir, archiveDir, pendingCount, archivedCount }` (FR-018) — depends on T008, T006

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the cross-cutting guarantees and parity, then validate end-to-end.

- [ ] T028 [P] Agent-neutrality test in `core/tests/api.test.ts`: assert the built module imports no agent SDK (no `pi`/`@anthropic`/codex), satisfying Constitution Principle I (FR-001, contract guarantee 1)
- [ ] T029 [P] Document the one intentional parity deviation (stateless mtime dedup vs. in-memory global) in `core/README.md`, cross-referencing research §D2 (FR-015, SC-006)
- [ ] T030 [P] Write `core/README.md` usage section covering the five capabilities + injected deps per contracts/core-interface.md (SC-007)
- [ ] T031 Run quickstart.md Scenarios 1–8 manually and `cd core && npm test` until green; record parity results (quickstart "Definition of done")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: all depend on Foundational. US1 and US2 (both P1) are
  independent of each other; US3 depends only on Foundational.
- **Polish (Phase 6)**: depends on the user stories being complete.

### User Story Dependencies

- **US1 (Capture, P1)**: after Foundational. Uses config read (T006), git (T007), store
  primitives (T008). No dependency on US2/US3.
- **US2 (Opt-in, P1)**: after Foundational. Independent of US1 (capture *guards on* config,
  but US1 can be tested with a hand-written config).
- **US3 (Session-start/status, P2)**: after Foundational. Independent of US1/US2.

### Within Each User Story

- Tests written first and failing before implementation.
- `entries.ts` / `checkpoint.ts` before `api.capture`; `config.ts`/`store.ts` extensions
  before the `api.*` capability that orchestrates them.

### Parallel Opportunities

- Setup: T003, T004 in parallel.
- Foundational: T005, then T007 and T008 in parallel; T006 after T005; T009 last.
- US1 tests T010/T011/T012 in parallel; impl T014/T015 in parallel before T016→T017.
- Once Foundational is done, US1 / US2 / US3 can be staffed in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests first (different files, run together):
Task: "Entry-normalization tests in core/tests/entries.test.ts"
Task: "Markdown-format tests in core/tests/checkpoint.test.ts"
Task: "Git-facts tests in core/tests/git.test.ts"

# Then independent implementation modules together:
Task: "Implement core/src/entries.ts"
Task: "Implement core/src/checkpoint.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 — both P1)

1. Phase 1 Setup → Phase 2 Foundational.
2. Phase 3 (US1 Capture) → validate quickstart Scenarios 2–5, 8.
3. Phase 4 (US2 Opt-in) → validate Scenarios 1, 7 → a fresh project opts in and captures (SC-002).
4. **STOP and VALIDATE** the MVP before US3.

### Incremental Delivery

1. Foundation ready.
2. US1 → capture works (MVP core value).
3. US2 → opt-in/config (completes the P1 MVP pair).
4. US3 → session-start count + archive prune + status.
5. Polish → agent-neutrality + parity verification + quickstart run.

---

## Notes

- [P] = different files, no incomplete dependency. Shared files (`api.ts`, `store.ts`,
  `config.ts`, `api.test.ts`, `store.test.ts`) are extended across phases, so those tasks are
  intentionally **not** marked [P] relative to each other.
- One intentional behavior change vs. the reference (stateless dedup) is documented in
  research §D2 and surfaced in T029 per the constitution's parity rule (FR-015).
- Commit after each task or logical group; stop at any checkpoint to validate a story.
