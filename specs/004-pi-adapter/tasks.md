# Tasks: pi Adapter

**Feature**: `004-pi-adapter` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Design inputs: [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/commands.md](./contracts/commands.md), [contracts/agent-mapping.md](./contracts/agent-mapping.md),
[quickstart.md](./quickstart.md).

All paths are under `adapters/pi/` unless stated. The adapter is a thin, **in-process** pi
extension wrapping `@checkpoint/core`; it contains **no** checkpoint logic (Constitution I). Unlike
the Claude Code adapter there is no bridge CLI, no markdown command files, and no `hooks.json` —
the default-exported function registers handlers via `ExtensionAPI` that call the core directly.

## Phase 1: Setup

- [x] T001 Create the adapter directory skeleton `adapters/pi/` with subdirs `src/` and `tests/`.
- [x] T002 Create `adapters/pi/package.json`: ESM, name `@checkpoint/pi`, `@checkpoint/core` via `file:../../core`, plus devDeps + scripts (`build`/`typecheck`/`test`/`format`/`lint`) mirroring `adapters/claude-code/package.json`. No `bin` entry (no PATH binary — Technical Constraints / FR negative). **Implemented decision**: rather than depend on the pi SDK, the adapter declares a minimal local `ExtensionAPI` type shim (`src/pi-types.ts`) — the T005 fallback — keeping `@checkpoint/core` as the single dependency (the neutrality contract) and the build hermetic; documented in README + research open-items.
- [x] T003 [P] Create `adapters/pi/tsconfig.json` mirroring `adapters/claude-code/tsconfig.json` (ESM, `outDir: dist`, declarations).
- [x] T004 [P] Add `.prettierrc.json` and `.prettierignore` to `adapters/pi/` matching `adapters/claude-code/` so lint is consistent.
- [x] T005 Run `npm install` in `adapters/pi/` and confirm `@checkpoint/core` resolves (build the core first if needed). If the pi SDK type package is unavailable from the registry, declare a minimal local `ExtensionAPI` type shim and document it (research open-items) rather than blocking.

## Phase 2: Foundational (blocks all stories)

**Goal**: the transcript→entry translation and the shared helpers (entries-from-sessionManager,
`runGit`, result formatters) that every command and lifecycle handler reuses.

- [x] T006 [P] Implement transcript translation in `src/transcript.ts`: `entriesFromSessionManager(sessionManager)` → `ConversationEntry[]` per data-model.md rules R1–R7 (entry selection, order, role/timestamp, string/array/bashExecution content forms, per-block mapping). Import types from `@checkpoint/core`. No truncation/recent-N/skip-empty (core owns those).
- [x] T007 [P] [Test] Add `tests/transcript.test.ts` covering: non-message entries dropped, order preserved, string content, bashExecution → `{command,output}` record, each block mapping (text/thinking/toolCall/image/unknown), timestamp fallback, and the skip-empty cases (a session with no real user-text entry yields no real user message via the core's `hasUserMessage`). Use small inline fixtures.
- [x] T008 Implement shared adapter helpers in `src/index.ts`: (a) a `runGit` `CommandRunner` wrapping `pi.exec` (research D2); (b) a `captureDeps(ctx)` building `{ entries, sessionFile, runGit }` from `ctx.sessionManager`; (c) result formatters for `CaptureResult` / `OptInResult` / `DisableResult` / `StatusResult` → human strings per contracts/commands.md; (d) a `notify(ctx, msg, level)` guarded by `ctx.hasUI`. No checkpoint logic — delegate to `@checkpoint/core` only.

**Checkpoint**: `npm run build` + `npm test` pass; helpers exist but handlers not yet registered.

## Phase 3: User Story 1 — Automatic end-of-session checkpoint (P1)

**Goal**: `session_shutdown` auto-captures via the core. **Independent test**: drive the
registered `session_shutdown` handler with a stub `ctx` (non-empty session) in an opted-in temp
repo → one checkpoint with `Reason: shutdown`; reload-gated/empty/duplicate/not-opted-in produce
no file (core-decided).

- [x] T009 [US1] In `src/index.ts`, register `pi.on("session_shutdown", …)`: build deps via `captureDeps(ctx)`, call `capture(ctx.cwd, event.reason ?? "shutdown", deps)`, notify the written path on success (when `hasUI`); wrap in try/catch and notify an error on failure — never throw (FR-014). No adapter gating (reload/skip-empty/dedup are the core's). (`session_start` is registered later in US3/T016 — keep all handlers in this one module.)
- [x] T010 [US1] [Test] In `tests/contract.test.ts`, assert the `session_shutdown` handler is registered and that, driven against a fake core boundary / temp repo, it forwards `event.reason` (defaulting to `shutdown`) into capture (C2). Verify reason `reload` reaches the core as `reload` (gating is the core's).

## Phase 4: User Story 2 — Same four commands inside pi (P1)

**Goal**: the four-command surface registered and delegating to the core. **Independent test**:
invoke each registered handler with a stub `ctx` → optIn configures the project, status reports
state, manual writes a checkpoint when enabled, disable flips the flag.

- [x] T011 [US2] Register `pi.registerCommand("checkpoint", …)`: build deps, call `capture(ctx.cwd, "manual", deps)`, format/notify result (disabled/not-configured → opt-in guidance) per contracts/commands.md.
- [x] T012 [US2] Register `pi.registerCommand("checkpoint-optin", …)` → `optIn(ctx.cwd)`, notify config path / dirs / ignore rules.
- [x] T013 [US2] Register `pi.registerCommand("checkpoint-disable", …)` → `disable(ctx.cwd)`, notify the kept-config message; safe no-op when not configured.
- [x] T014 [US2] Register `pi.registerCommand("checkpoint-status", …)` → `status(ctx.cwd)`, notify configured/enabled + pending/archived counts + dirs (opt-in guidance when not configured).
- [x] T015 [US2] [Test] In `tests/contract.test.ts`, assert exactly four commands registered with the exact names `checkpoint`, `checkpoint-optin`, `checkpoint-disable`, `checkpoint-status` (C1), and run an optin → status → manual → disable → status cycle against a temp repo asserting the formatted outputs.

(T011–T014 all register into the same `src/index.ts`, so they are sequential, not `[P]`.)

## Phase 5: User Story 3 — Start-of-session pending notice & prune (P2)

**Goal**: `session_start` prunes the archive and notifies the pending count. **Independent test**:
drive the `session_start` handler in an opted-in repo with N pending files and an over-limit
archive → notifies N and prunes to the max; not-configured/disabled/empty → no misleading notice.

- [x] T016 [US3] Register `pi.on("session_start", …)` in `src/index.ts`: call `sessionStart(ctx.cwd)`; notify the pending count only when configured + enabled + `hasUI` + `pendingCount > 0` (FR-004); rely on `sessionStart` for the prune. Wrap in try/catch and notify an error on failure (never throw).
- [x] T017 [US3] [Test] In `tests/contract.test.ts`, assert the `session_start` handler is registered and, against a temp repo, notifies the pending count when there is something to review and prunes an over-limit archive; empty/disabled cases notify nothing misleading.

## Phase 6: User Story 4 — Logic lives once, verifiably (P2)

**Goal**: an automated guarantee that no checkpoint logic re-enters the adapter and that parity
holds. **Independent test**: the neutrality test fails if logic is reintroduced, passes when all is
delegated.

- [x] T018 [US4] [Test] Add the neutrality assertions to `tests/contract.test.ts` (C3/C4): no file under `src/` imports a git module, writes checkpoint markdown, computes dedup/prune/skip-empty, or reads/writes `.checkpoint.json`; the adapter imports checkpoint behavior from `@checkpoint/core`. Also assert FR negatives: no `bin`/PATH binary in `package.json`, and no curation/recovery (archive-move or summarize) logic in `src/`. Mirror the claude-code C3 test.

## Phase 7: Polish & cross-cutting

- [x] T019 [P] Write `adapters/pi/README.md` (humans): what it is, the four commands, the two lifecycle handlers, the canonical-name rename note (`checkpoint-enable` → `checkpoint-optin`), the hard-kill gap, and the install pointer (placement in `~/.pi/agent/extensions/` deferred to feature 006).
- [x] T020 [P] Tick the now-satisfied boxes in `contracts/agent-mapping.md` (adapter written, smoke-tested).
- [x] T021 [Test] Add the scripted handler smoke test from quickstart ("Scripted handler smoke test") — either as `tests/smoke.test.ts` (stub `pi`/`ctx` against a temp git repo) or a `scripts/smoke.mjs`; exercise optin → shutdown(non-empty)=1 file → shutdown again=dedup → shutdown(empty)=no file → session_start notice → status counts. Include a legacy `.pi/checkpoint.json`-only project assertion (FR-013) to confirm the adapter works on legacy config via the core.
- [x] T022 Run `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` in `adapters/pi/` — all clean.
- [ ] T023 Perform the quickstart "In-agent smoke test" (each command from the pi TUI, auto-capture on session shutdown, startup notice) — Constitution Principle V gate. **PENDING: requires placing the extension in a live pi install (blocked on feature 006, or a manual dev install). The core path is verified via T021; the in-TUI path is not yet exercised.**

## Dependencies & order

- Setup (T001–T005) → Foundational (T006–T008) → user stories.
- **Foundational blocks everything**: `transcript.ts` (T006) and the shared helpers (T008) underpin every handler.
- **US1 (T009–T010)**, **US2 (T011–T015)**, **US3 (T016–T017)** all depend only on Foundational and all register into the single `src/index.ts`, so they are done sequentially within that file (not parallel).
- **US4 (T018)** depends on the handlers existing (extends the same `tests/contract.test.ts`).
- Polish (T019–T023) last; T023 is the final acceptance gate.

## Parallel execution examples

- The handler-registration tasks all share `src/index.ts`, so they are **not** parallel. Genuine `[P]` (different files) is limited to: T003/T004 (config files); T006/T007 (transcript + its test); T019/T020 (README + mapping-table edits).
- The user-story phases are independent *increments* (each adds a testable slice), but coordinate the shared `index.ts` when sequencing them.

## MVP scope

**US1 + US2** (both P1) = the MVP: automatic capture on shutdown plus the four commands working
end-to-end against the core. US3 (notice/prune) and US4 (neutrality guarantee) complete the parity
surface and the architectural guard but are not required for first value.

## Format validation

All tasks use `- [ ] TNNN [P?] [US?] description + path`; setup/foundational/polish carry no story
label; user-story tasks carry `[US1]`–`[US4]`; test tasks marked `[Test]`.
