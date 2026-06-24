# Tasks: Codex Adapter

**Feature**: `005-codex-adapter` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Design inputs: [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/commands.md](./contracts/commands.md), [contracts/agent-mapping.md](./contracts/agent-mapping.md),
[quickstart.md](./quickstart.md).

All paths are under `adapters/codex/` unless stated. The adapter is a thin Codex bridge (compiled
Node CLI invoked by Codex's `notify` program + command prompts) wrapping `@checkpoint/core`; it
contains **no** checkpoint logic (Constitution I). Mirrors the `adapters/claude-code` bridge.

## Phase 1: Setup

- [x] T001 Create the adapter directory skeleton `adapters/codex/` with subdirs `src/`, `tests/`, `prompts/`.
- [x] T002 Create `adapters/codex/package.json`: ESM, name `@checkpoint/codex`, `@checkpoint/core` via `file:../../core`, devDeps + scripts (`build`/`typecheck`/`test`/`format`/`lint`) mirroring `adapters/claude-code/package.json`. No `bin` entry (no PATH binary).
- [x] T003 [P] Create `adapters/codex/tsconfig.json` mirroring `adapters/claude-code/tsconfig.json` (ESM, `outDir: dist`, declarations).
- [x] T004 [P] Add `.prettierrc.json` and `.prettierignore` to `adapters/codex/` matching `adapters/claude-code/`.
- [x] T005 Run `npm install` in `adapters/codex/` and confirm `@checkpoint/core` resolves (build the core first if needed).

## Phase 2: Foundational (blocks all stories)

**Goal**: transcript translation (both sources) and the shared bridge-dispatch helpers every
subcommand reuses.

- [x] T006 [P] Implement transcript translation in `src/transcript.ts`: `entriesFromNotifyPayload(payload)` (data-model A1–A5: only `agent-turn-complete`; `input-messages`→user entries; `last-assistant-message`→assistant entry; order) and `entriesFromRollout(path|undefined)` (data-model B1–B6: tolerant role/content extraction, unknown lines dropped, malformed/missing → `[]`, never throws). Import types from `@checkpoint/core`.
- [x] T007 [P] [Test] Add `tests/transcript.test.ts`: payload mapping (users + assistant, order, non-`agent-turn-complete` → none, missing `input-messages` → none), rollout parser (recognized roles kept, unknown/malformed lines dropped, missing file → `[]`, string + array content). Inline fixtures.
- [x] T008 Implement `src/bridge.ts`: helpers to (a) parse the notify JSON from an argv string (tolerant), (b) resolve `cwd`, (c) locate the newest Codex rollout for a cwd (`~/.codex/sessions/**/rollout-*.jsonl`, best-effort), (d) call a core function and format its `CaptureResult`/`OptInResult`/`DisableResult`/`StatusResult`/`ArchiveResult` to a human string. No checkpoint logic — delegate to `@checkpoint/core` only.
- [x] T009 Implement `src/index.ts` CLI dispatch: subcommands `notify | manual | optin | disable | status | archive` routing to bridge calls. `notify` is the only lifecycle-class subcommand and always exits 0.

**Checkpoint**: `npm run build` + `npm test` pass; bridge invocable but prompts/config not yet written.

## Phase 3: User Story 1 — Best-effort automatic capture (P1)

**Goal**: `notify` on `agent-turn-complete` captures via the core. **Independent test**: pipe a
representative payload to `notify` in an opted-in temp repo → one `turn-complete` checkpoint; a
second within the dedup window suppressed; not-opted-in is a silent no-op.

- [x] T010 [US1] Implement the `notify` subcommand path in `src/bridge.ts`/`index.ts`: parse the `agent-turn-complete` JSON (from `argv[3]`), build entries via `entriesFromNotifyPayload`, call `capture(cwd, "turn-complete", { entries, sessionFile })`; tolerant of malformed/partial input; always exit 0; print the result.
- [x] T011 [US1] Create `config.example.toml` with the `notify = ["node", "<bridge>/dist/index.js", "notify"]` snippet and a comment that `<bridge>` is resolved at install (006) and Codex appends the event JSON as the last arg.
- [x] T012 [US1] [Test] In `tests/contract.test.ts`, drive the `notify` subcommand against a temp repo: a non-empty `agent-turn-complete` payload writes one `Reason: turn-complete` file; a second within the dedup window is suppressed; a non-`agent-turn-complete`/empty payload writes nothing; not-opted-in writes nothing and exits 0.

## Phase 4: User Story 2 — The same four commands (P1)

**Goal**: the four-command surface (prompts → bridge subcommands) with parity output. **Independent
test**: run each bridge subcommand against a sample project → optin configures, status reports,
manual writes when enabled, disable flips the flag; the four prompt files exist with canonical names.

- [x] T013 [US2] Implement `manual`, `optin`, `disable`, `status`, `archive` subcommands in `src/bridge.ts`/`index.ts` delegating to `capture(…, "manual")`/`optIn`/`disable`/`status`/`archive`, formatting output per contracts/commands.md. `manual` resolves the newest rollout for cwd best-effort (git-facts-only fallback).
- [x] T014 [P] [US2] Create `prompts/checkpoint.md` (front matter `description`; instructs the agent to run `node <bridge>/dist/index.js manual "$PWD"` and report output).
- [x] T015 [P] [US2] Create `prompts/checkpoint-optin.md` (instructs running the `optin` subcommand).
- [x] T016 [P] [US2] Create `prompts/checkpoint-disable.md` (instructs running the `disable` subcommand).
- [x] T017 [P] [US2] Create `prompts/checkpoint-status.md` (instructs running the `status` subcommand).
- [x] T018 [US2] [Test] In `tests/contract.test.ts`, assert exactly four prompt files exist with canonical names (C1), and drive optin → status → manual → disable → status against a temp repo asserting the formatted outputs.

## Phase 5: User Story 3 — Logic lives once, verifiably (P2)

**Goal**: an automated guarantee that no checkpoint logic re-enters the adapter. **Independent
test**: the neutrality test fails if logic is reintroduced, passes when all is delegated.

- [x] T019 [US3] [Test] Add the neutrality + surface assertions to `tests/contract.test.ts` (C2/C3/C4): the bridge dispatches exactly `notify|manual|optin|disable|status|archive` with `notify`→`turn-complete` and `manual`→`manual` (source regex); no file under `src/` runs git, writes/moves checkpoint files, computes dedup/prune/skip-empty, or reads/writes `.checkpoint.json`; the adapter imports behavior from `@checkpoint/core`; `package.json` has no `bin` and a single runtime dependency. Mirror the claude-code C3 test.

## Phase 6: Polish & cross-cutting

- [x] T020 [P] Write `adapters/codex/README.md` (humans): what it is, the four commands (prompt-driven), the `notify` auto-capture, the documented best-effort gaps (no start/end/compact events; per-turn capture; prompt-only commands; custom-prompts deprecation), and the install pointer (prompts → `~/.codex/prompts/`, notify → `~/.codex/config.toml`, deferred to 006).
- [x] T021 [P] Tick the now-satisfied boxes in `contracts/agent-mapping.md` (adapter written, smoke-tested).
- [x] T022 [Test] Add the scripted bridge smoke test from quickstart ("Bridge smoke test") — `tests/smoke.test.ts` (temp git repo): optin → notify(non-empty)=1 `turn-complete` file → notify again=dedup → notify(type-mismatch)=no file → status → manual.
- [x] T023 Run `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` in `adapters/codex/` — all clean.
- [ ] T024 Perform the quickstart "In-agent smoke test" (each command from Codex, auto-capture on turn-complete, status pending count) — Constitution Principle V gate. **PENDING: requires installing prompts + the notify snippet in a live Codex install (blocked on feature 006, or a manual dev install). The bridge/core path is verified via T022; the in-Codex prompt-driven path is not yet exercised.**

## Dependencies & order

- Setup (T001–T005) → Foundational (T006–T009) → user stories.
- **Foundational blocks everything**: `transcript.ts` (T006) and the bridge dispatch (T008/T009) underpin all capture and command tasks.
- **US1 (T010–T012)** and **US2 (T013–T018)** depend only on Foundational; they touch `bridge.ts`/`index.ts` (coordinate that shared file) plus disjoint files (`config.example.toml`, the four prompt files — `[P]`). Each is an independent, testable increment.
- **US3 (T019)** depends on the subcommands existing (extends `tests/contract.test.ts`).
- Polish (T020–T024) last; T024 is the final acceptance gate.

## Parallel execution examples

- `[P]` = different files, safe together: T003/T004; T006/T007; the four prompt files T014/T015/T016/T017; T020/T021.
- The bridge subcommand handlers share `src/bridge.ts`/`src/index.ts`, so US1's `notify` and US2's command handlers coordinate on those two files.

## MVP scope

**US1 + US2** (both P1) = the MVP: best-effort automatic capture on turn-complete plus the four
commands working end-to-end against the core. US3 (neutrality guarantee) is the architectural guard,
not required for first value.

## Format validation

All tasks use `- [ ] TNNN [P?] [US?] description + path`; setup/foundational/polish carry no story
label; user-story tasks carry `[US1]`–`[US3]`; test tasks marked `[Test]`.
