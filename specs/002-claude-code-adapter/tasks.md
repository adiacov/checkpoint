# Tasks: Claude Code Adapter

**Feature**: `002-claude-code-adapter` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Design inputs: [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/commands.md](./contracts/commands.md), [contracts/agent-mapping.md](./contracts/agent-mapping.md),
[quickstart.md](./quickstart.md).

All paths are under `adapters/claude-code/` unless stated. The adapter is a thin Claude Code
plugin wrapping `@checkpoint/core`; it contains **no** checkpoint logic (Constitution I).

## Phase 1: Setup

- [ ] T001 Create the adapter directory skeleton `adapters/claude-code/` with subdirs `src/`, `tests/`, `commands/`, `hooks/`, `.claude-plugin/`.
- [ ] T002 Create `adapters/claude-code/package.json`: ESM, `@checkpoint/core` via `file:../../core`, devDeps + scripts (`build`/`typecheck`/`test`/`format`/`lint`) mirroring `core/package.json`.
- [ ] T003 [P] Create `adapters/claude-code/tsconfig.json` mirroring `core/tsconfig.json` (ESM, `outDir: dist`, declarations).
- [ ] T004 [P] Add `.prettierrc.json` and `.prettierignore` to `adapters/claude-code/` matching `core/` so lint is consistent.
- [ ] T005 Run `npm install` in `adapters/claude-code/` and confirm `@checkpoint/core` resolves (build the core first if needed).

## Phase 2: Foundational (blocks all capture stories)

**Goal**: The transcript→entry translation and the core-dispatch bridge that every command/hook reuses.

- [ ] T006 [P] Implement transcript translation in `src/transcript.ts`: parse JSONL → `ConversationEntry[]` per data-model.md rules R1–R7 (line selection, sidechain filter, order, timestamp, per-block mapping, and the `tool_result`-only → `role:"tool"` rule). Import types from `@checkpoint/core`.
- [ ] T007 [P] [Test] Add `tests/transcript.test.ts` covering: user/assistant selection, non-conversation lines dropped, sidechain dropped, order preserved, string content, each block mapping (text/thinking/tool_use/tool_result/image/unknown), and the tool_result-only role remap (V3 skip-empty correctness). Use a small inline JSONL fixture.
- [ ] T008 Implement `src/bridge.ts`: helpers to (a) read+parse hook JSON from stdin, (b) resolve `cwd`, (c) locate the newest project transcript for a cwd (manual path, research Decision 4), (d) call a core function and format its result/skip/error to a human string. No checkpoint logic — delegate to `@checkpoint/core` only.
- [ ] T009 Implement `src/index.ts` CLI dispatch: subcommands `session-start | session-end | pre-compact | manual | optin | disable | status` routing to bridge calls. Lifecycle subcommands always exit 0.

**Checkpoint**: `npm run build` + `npm test` pass; bridge can be invoked but commands/hooks not yet wired.

## Phase 3: User Story 1 — Manual capture from inside Claude Code (P1)

**Goal**: `/checkpoint` captures the current session. **Independent test**: in an opted-in project, run the manual subcommand against a real transcript → one `manual` checkpoint in `sessions/pending/`.

- [ ] T010 [US1] Implement the `manual` subcommand path in `src/bridge.ts`/`index.ts`: resolve newest transcript for cwd, translate, call `capture(cwd, "manual", { entries, sessionFile })`; on disabled/not-configured print the opt-in guidance (contracts/commands.md), on success print `Checkpoint written: <rel path>`.
- [ ] T011 [P] [US1] Create `commands/checkpoint.md` slash command that invokes `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" manual "<cwd>"` via Bash and shows its output (frontmatter `allowed-tools` for Bash).
- [ ] T012 [US1] Verify against quickstart "Bridge smoke test" steps 1–3: opt in, capture, confirm one `Reason: manual` file; confirm duplicate within dedup window is suppressed and empty transcript skipped (behavior owned by core).

## Phase 4: User Story 2 — Automatic capture on session end & pre-compaction (P1)

**Goal**: `SessionEnd`→`shutdown`, `PreCompact`→`reload` auto-captures. **Independent test**: pipe a hook payload to `session-end`/`pre-compact` → checkpoint written with the right reason; non-opted-in is a silent no-op.

- [ ] T013 [US2] Implement `session-end` subcommand: read hook stdin, translate `transcript_path`, call `capture(cwd, "shutdown", { entries, sessionFile })`; exit 0 always; print result.
- [ ] T014 [US2] Implement `pre-compact` subcommand: same shape, `capture(cwd, "reload", …)`; rely on core to suppress when `includeReload:false` (no adapter gating).
- [ ] T015 [US2] Create `hooks/hooks.json` wiring `SessionEnd`→`session-end` and `PreCompact`→`pre-compact` using exec form (`command:"node"`, `args:["${CLAUDE_PLUGIN_ROOT}/dist/index.js","<sub>"]`) per contracts/commands.md.
- [ ] T016 [P] [US2] [Test] Add `tests/contract.test.ts` assertions for the hook/reason mapping (C2) and that the plugin manifest + hooks declare exactly the three events with correct reasons.
- [ ] T017 [US2] Verify quickstart smoke steps 2–3 for both reasons; confirm a non-opted-in repo produces no file and no error.

## Phase 5: User Story 3 — Start-of-session pending notice (P2)

**Goal**: `SessionStart` shows pending count. **Independent test**: run `session-start` in an opted-in project with pending files → prints the count; none/disabled → no misleading notice.

- [ ] T018 [US3] Implement `session-start` subcommand: read hook stdin, call `sessionStart(cwd)`, print the pending-count notice only when enabled + UI present + `pendingCount > 0` (FR-004); exit 0.
- [ ] T019 [US3] Add `SessionStart` entry to `hooks/hooks.json` → `session-start` (extends the file from T015).
- [ ] T020 [US3] Verify quickstart smoke step 4: pending count printed matches `ls sessions/pending/ | wc -l`; empty case prints nothing misleading.

## Phase 6: User Story 4 — Opt-in / status / disable commands (P2)

**Goal**: the remaining three commands, parity with reference. **Independent test**: from the bridge, optin a fresh project → configured; status reports state; disable → status shows disabled.

- [ ] T021 [US4] Implement `optin`, `disable`, `status` subcommands in `src/bridge.ts`/`index.ts` delegating to `optIn`/`disable`/`status` and formatting output per contracts/commands.md.
- [ ] T022 [P] [US4] Create `commands/checkpoint-optin.md` invoking the `optin` subcommand.
- [ ] T023 [P] [US4] Create `commands/checkpoint-disable.md` invoking the `disable` subcommand.
- [ ] T024 [P] [US4] Create `commands/checkpoint-status.md` invoking the `status` subcommand.
- [ ] T025 [US4] Verify optin → status → disable → status cycle via the bridge matches expected output.

## Phase 7: Polish & cross-cutting

- [ ] T026 Create `.claude-plugin/plugin.json` manifest (name, version, description, author, `hooks: "./hooks/hooks.json"`; default `commands/` auto-discovered) per research Decision 1.
- [ ] T027 [P] [Test] Extend `tests/contract.test.ts` with C1 (exactly four commands declared) and C3 (no `src/` file imports git / writes checkpoint md / does dedup-prune-skip-empty / touches `.checkpoint.json`) — the neutrality guard mirroring the core's no-SDK test. Also assert FR-011 negative surfaces: no `bin` entry / PATH binary in `package.json`, and no curation/recovery code (no archive-move or summarize logic) in `src/`.
- [ ] T028 [P] Write `adapters/claude-code/README.md` (humans): what it is, the four commands, the three hooks, the hard-kill gap, and the install pointer (full install deferred to feature 006).
- [ ] T029 [P] Tick the now-satisfied boxes in `contracts/agent-mapping.md` (adapter written, smoke-tested).
- [ ] T030 Run `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` in `adapters/claude-code/` — all clean.
- [ ] T031 Perform the quickstart "In-agent smoke test" (each command from the TUI, auto-capture on session end, startup notice) — Constitution Principle V / SC-007 gate before declaring done.

## Dependencies & order

- Setup (T001–T005) → Foundational (T006–T009) → user stories.
- **Foundational blocks everything**: T006/T008/T009 underpin all capture and command tasks.
- **US1 (T010–T012)** and **US2 (T013–T017)** both depend only on Foundational → can proceed in parallel after Phase 2. Each is an independent, testable increment.
- **US3 (T018–T020)** depends on Foundational; T019 edits the `hooks.json` created in T015 (sequence after T015 if both run).
- **US4 (T021–T025)** depends only on Foundational.
- Polish (T026–T031) last; T031 is the final acceptance gate.

## Parallel execution examples

- After Phase 2: a developer can take US1 while another takes US2/US4 (disjoint files except `index.ts` dispatch — coordinate that one file).
- `[P]` within a phase = different files, safe to do together: e.g. T003/T004; T022/T023/T024 (separate command files); T027/T028/T029.

## MVP scope

**US1 + US2** (both P1) = the MVP: manual and automatic capture working end-to-end. US3 (notice)
and US4 (config commands) complete the parity surface but are not required for first value, since a
project can be opted in by the core directly and captures already work.

## Format validation

All tasks use `- [ ] TNNN [P?] [US?] description + path`; setup/foundational/polish carry no story
label; user-story tasks carry `[US1]`–`[US4]`; test tasks marked `[Test]`.
