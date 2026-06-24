# Feature Specification: pi Adapter

**Feature Branch**: `004-pi-adapter`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "pi adapter (004): Re-point the existing vendored pi extension at the shared @checkpoint/core instead of duplicating checkpoint logic. Build a thin adapter under adapters/pi/ that registers the same four commands plus the pi lifecycle handlers and delegates every checkpoint decision to the core."

## Overview

The pi coding agent already has a working checkpoint extension (`reference/checkpoint.ts`),
which is the parity baseline (reference implementation) for this whole project. That extension
re-implements all checkpoint logic itself. This feature replaces it with a thin adapter that
calls the shared `@checkpoint/core`, so the logic lives exactly once. After this change, a pi
user gets the same checkpoint behavior they have today, but the behavior is now sourced from the
shared core rather than a private copy — closing the gap that the whole core/adapter architecture
exists to close.

This is the third adapter, following the Claude Code adapter (002). It mirrors that adapter's
structure, testing, and build discipline, adapted to pi's extension surface.

## Clarifications

### Session 2026-06-24

Resolved during clarification from existing project context (the reference extension as parity
baseline, the Claude Code adapter as a structural template, and the already-complete core API).
Per the standing instruction to resolve ambiguities with best judgment, these were decided rather
than escalated; each is recorded so downstream planning is unambiguous.

- Q: How is the pi adapter loaded — a single in-process pi extension, or an external compiled
  "bridge" process like the Claude Code adapter? → A: A single in-process pi extension module
  (mirroring `reference/checkpoint.ts`) that imports the compiled `@checkpoint/core` and calls it
  directly. pi runs extensions in-process via its `ExtensionAPI`, so the Claude Code adapter's
  external Node bridge (needed only because Claude Code shells out from markdown/hook commands)
  does not apply here.
- Q: Where does the conversation transcript come from in pi? → A: The live pi session manager's
  entries (e.g. `getBranch()` / `getEntries()`), translated into the core's `ConversationEntry[]`
  — not parsed from JSONL transcript files as the Claude Code adapter does.
- Q: Does this feature change the shared core? → A: No core change is expected; the core already
  exposes every needed capability and already reads the legacy `.pi/checkpoint.json`. If a genuine
  gap surfaces, the missing behavior is added to the core (never duplicated into the adapter).
- Q: What command name does the "opt-in" / enable command use inside pi? → A: `checkpoint-optin`,
  the canonical cross-agent name (Constitution Principle II), matching the Claude Code adapter. This
  is a deliberate, documented rename of the reference extension's `checkpoint-enable` — a naming
  change only, not a behavior divergence (parity is about behavior). The `002` agent-mapping table
  already records that pi will adopt this canonical name; the manual/disable/status names match
  across adapters.
- Q: Must the adapter compile to JavaScript, or can pi load TypeScript directly? → A: The adapter
  source is authored in TypeScript (like the reference) and the project's build/type-check/lint/
  test gates run against it; whether pi consumes `.ts` or a compiled artifact at install time is an
  install/distribution concern owned by feature 006, not this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic end-of-session checkpoint in pi (Priority: P1)

A developer working in a pi-opted-in project ends a pi session (normal shutdown). The adapter
captures a raw checkpoint of the session — git facts plus recent conversation — into the
project's pending directory, exactly as the reference extension does today, without the developer
doing anything.

**Why this priority**: Automatic capture on exit is the core value of the tool and the single
most-used behavior of the reference extension. If only this works, a pi user already gets
no-effort session memory. It is the heart of parity.

**Independent Test**: In an opted-in project, run a pi session with at least one user message,
trigger a normal shutdown, and confirm one checkpoint markdown file appears in `sessions/pending/`
containing the git facts and recent conversation, identical in shape to a reference-extension
checkpoint.

**Acceptance Scenarios**:

1. **Given** a project opted in to checkpointing, **When** a non-empty pi session shuts down
   normally, **Then** a checkpoint file is written to the pending directory and the user is
   notified of the path.
2. **Given** a project opted in with `skipEmptySessions` enabled, **When** a session with no user
   message shuts down, **Then** no checkpoint is written.
3. **Given** a session that shuts down with reason `reload` and `includeReload` disabled, **When**
   shutdown fires, **Then** no checkpoint is written.
4. **Given** two shutdown events for the same project and reason within the dedup window, **When**
   the second fires, **Then** no duplicate checkpoint is written.
5. **Given** a project that has NOT opted in, **When** a session shuts down, **Then** no checkpoint
   is written and the project is left untouched.

---

### User Story 2 - Same four commands inside pi (Priority: P1)

A developer uses the same checkpoint commands inside pi that they use in every other supported
agent: enable, disable, status, and a manual checkpoint. Each command produces the same behavior
and equivalent output as in the other adapters because they all call the shared core.

**Why this priority**: The identical command surface across agents is a non-negotiable product
principle. A pi user who switches from Claude Code must find the same commands behaving the same
way, or the tool stops feeling like one tool.

**Independent Test**: From inside a pi session, run each command (enable, disable, status, manual
checkpoint) in a sample project and confirm each performs the same observable action as the
reference extension and the Claude Code adapter (config written, directories and ignore rules
created, status reported, manual checkpoint written when enabled).

**Acceptance Scenarios**:

1. **Given** a project not yet opted in, **When** the enable command runs, **Then** the config
   file, pending/archive directories, `.gitkeep`s, and `.gitignore` rules are created and the user
   is told what was set up.
2. **Given** an opted-in project, **When** the disable command runs, **Then** checkpointing is
   marked disabled while config, directories, and existing checkpoints are preserved.
3. **Given** any project, **When** the status command runs, **Then** the user sees whether the
   project is configured, enabled/disabled, the pending and archive directories, and the pending
   and archived checkpoint counts.
4. **Given** an opted-in, enabled project, **When** the manual checkpoint command runs, **Then** a
   checkpoint is written immediately and its path reported.
5. **Given** a disabled or not-configured project, **When** the manual checkpoint command runs,
   **Then** no checkpoint is written and the user is told to enable first.

---

### User Story 3 - Startup pending notice and archive prune (Priority: P2)

When a developer starts a pi session in an opted-in project that has unreviewed checkpoints, the
adapter reminds them how many pending checkpoints need review, and quietly prunes the archive to
its configured maximum — matching the reference extension's session-start behavior.

**Why this priority**: The pending notice is what closes the loop on recovery (it is how the user
learns there is something to integrate), and prune keeps the archive bounded. Valuable but
secondary to capture and commands; the tool still delivers without it.

**Independent Test**: In an opted-in project with N pending checkpoints and an over-limit archive,
start a pi session and confirm the user is notified that N checkpoints need review and that the
archive is pruned to its maximum.

**Acceptance Scenarios**:

1. **Given** an opted-in project with one or more pending checkpoints, **When** a session starts,
   **Then** the user is notified of the pending count and directory.
2. **Given** an opted-in project with no pending checkpoints, **When** a session starts, **Then**
   no pending notice is shown.
3. **Given** an archive directory exceeding the configured maximum, **When** a session starts,
   **Then** the oldest archived checkpoints are pruned down to the maximum.
4. **Given** a not-configured or disabled project, **When** a session starts, **Then** no notice
   is shown and nothing is pruned.

---

### User Story 4 - Logic lives once, verifiably (Priority: P2)

The maintainer can trust that the pi adapter contains no copy of checkpoint logic — that every
checkpoint decision is the shared core's — and that adding pi did not regress the reference
behavior. This trust is backed by an automated test, not just review.

**Why this priority**: "Write the logic once" and "functional parity" are the architectural
reasons the project exists. Without an enforced guarantee, the duplication this feature removes
can silently creep back. Important for maintainability, but it does not change runtime behavior
for the end user.

**Independent Test**: Run the adapter's test suite and confirm a neutrality/contract test fails if
checkpoint logic (config handling, git facts, markdown formatting, skip-empty, dedup, prune,
pending-count) is reintroduced into the adapter, and passes when all such decisions are delegated
to the core.

**Acceptance Scenarios**:

1. **Given** the adapter source, **When** the neutrality test runs, **Then** it confirms the
   adapter imports checkpoint behavior from the shared core and does not re-implement it.
2. **Given** the adapter and core together, **When** the adapter test suite runs, **Then** the
   observable capture, config, skip-empty, dedup, prune, and pending-count behaviors match the
   reference extension's behavior.

---

### Edge Cases

- **Legacy config**: A project still configured only via the legacy `.pi/checkpoint.json` (no
  root `.checkpoint.json`) MUST continue to work during the transition — the adapter relies on the
  core's existing support for reading legacy config.
- **No git repository**: When the project is not a git repository, project-root detection falls
  back to the working directory and capture still records whatever git facts are available
  (matching reference behavior).
- **Transcript shape variations**: pi's conversation entries include message roles, tool calls,
  thinking blocks, images, and bash executions; the adapter must translate these into the core's
  conversation representation without losing the information the reference extension preserved
  (and without leaking thinking/image content beyond what the reference did).
- **No user interface / non-interactive session**: When a session has no UI surface to notify,
  startup and capture must still behave safely (no crash), consistent with the reference
  extension's UI guards.
- **Capture or startup failure**: An error during capture, prune, or the startup check MUST be
  surfaced to the user (when a UI exists) rather than crashing the session or silently dropping
  the checkpoint.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The adapter MUST register exactly the four standard commands inside pi — manual
  checkpoint, enable (opt-in), disable, and status — using the same names and semantics as the
  other adapters.
- **FR-002**: The adapter MUST register pi lifecycle handlers for session start and session
  shutdown.
- **FR-003**: On session shutdown, the adapter MUST request a checkpoint capture from the core,
  passing the shutdown reason, and MUST let the core decide whether to write (configured, enabled,
  reload-gating, skip-empty, dedup) rather than deciding itself.
- **FR-004**: On session start, the adapter MUST request the core's session-start routine (archive
  prune + pending count) and notify the user of the pending count only when there is something to
  review and a UI exists.
- **FR-005**: The manual checkpoint command MUST capture a checkpoint with reason "manual" via the
  core and report the result; when checkpointing is not enabled, it MUST tell the user to enable
  first instead of writing.
- **FR-006**: The enable command MUST opt the project in via the core (write config, create
  directories and `.gitkeep`s, add ignore rules) and report what was set up.
- **FR-007**: The disable command MUST disable checkpointing via the core (preserving config,
  directories, and existing checkpoints) and report the result; it MUST be a safe no-op when the
  project is not configured.
- **FR-008**: The status command MUST report, via the core, whether the project is configured, its
  enabled state, the pending and archive directories, and the pending and archived counts.
- **FR-009**: The adapter MUST contain NO checkpoint logic of its own. All checkpoint decisions —
  config normalization, git facts collection, markdown checkpoint format, skip-empty, dedup,
  archive prune, and pending count — MUST come from the shared core. The only adapter-specific code
  permitted is command/handler registration, lifecycle trigger wiring (including shutdown-reason
  mapping and reload-gating delegation), and transcript translation.
- **FR-010**: The adapter MUST translate pi's conversation entries into the core's conversation
  representation, preserving message roles and text, representing tool calls, and omitting
  thinking/image content the same way the reference extension does, so that the core's skip-empty
  and capture behavior receive equivalent input.
- **FR-011**: An automated neutrality/contract test MUST fail if checkpoint logic is reintroduced
  into the adapter and pass when all such logic is delegated to the core.
- **FR-012**: The adapter MUST preserve functional parity with the reference extension: no real
  checkpoint feature may regress. Any intentional behavior difference MUST be documented and
  justified.
- **FR-013**: The adapter MUST work for projects configured via the legacy `.pi/checkpoint.json`
  during the transition, relying on the core's existing legacy-config support.
- **FR-014**: Errors during capture, prune, or startup checks MUST be surfaced to the user when a
  UI exists and MUST NOT crash the pi session.
- **FR-015**: The adapter MUST ship with build, type-check, lint, and test discipline equivalent to
  the Claude Code adapter, and MUST document (in an adapter README) what it adds and how to build
  it, plus its place in the per-agent mapping table.

### Key Entities *(include if feature involves data)*

- **pi Adapter**: The thin wrapper under `adapters/pi/` that registers commands and lifecycle
  handlers and calls the shared core. Owns no checkpoint state.
- **Conversation Entry (core representation)**: The agent-neutral conversation record the core
  consumes; the adapter produces these from pi's session entries.
- **Checkpoint File**: Raw session-evidence markdown written by the core to the pending directory;
  unchanged in shape from the reference extension.
- **Checkpoint Config**: The project's opt-in/tuning settings (`.checkpoint.json`, or legacy
  `.pi/checkpoint.json`), owned and normalized by the core.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A pi user in an opted-in project gets an automatic checkpoint on normal session
  shutdown, with no manual action, in 100% of non-empty, non-duplicate, non-reload-gated sessions.
- **SC-002**: All four commands are available inside pi and each produces the same observable
  outcome as the corresponding Claude Code adapter command for the same project state.
- **SC-003**: For every reference-extension behavior under test (capture, config, skip-empty,
  dedup, prune, pending count), the adapter-plus-core produces matching observable results — zero
  parity regressions.
- **SC-004**: The amount of checkpoint logic duplicated in the adapter is zero, enforced by an
  automated test that fails on reintroduction.
- **SC-005**: Adding the pi adapter follows the documented add-an-agent procedure end to end
  (identify surface → write adapter → wire handlers → update mapping table → smoke test) and the
  per-agent mapping table is updated to include pi.
- **SC-006**: The adapter's quality gates (build, type-check, lint, tests) all pass.

## Assumptions

- The shared `@checkpoint/core` already exposes every capability the adapter needs (detectProject,
  optIn, disable, status, sessionStart, capture, archive) and already supports reading the legacy
  `.pi/checkpoint.json` config; no core changes are expected for this feature. If a genuine gap is
  found, the missing behavior belongs in the core, not the adapter.
- `reference/checkpoint.ts` is the authoritative parity baseline for pi *behavior*. Command
  *names* follow the canonical cross-agent surface (Principle II): the reference's
  `checkpoint-enable` is registered as `checkpoint-optin` in this adapter — a documented rename, not
  a behavior change.
- The pi extension surface (command registration, `session_start` / `session_shutdown` events,
  the session manager / transcript access, and UI notify) is available and stable, matching what
  the reference extension uses.
- Install/distribution of the adapter into pi's extensions directory is out of scope here and is
  covered by feature 006; this feature delivers the adapter source, tests, and docs in-repo.
- The Codex adapter (005) and the config single-source migration (007) are out of scope.
- The hard-kill capture gap (lifecycle hooks cannot fire on `kill -9`/crash) is an inherent,
  documented limitation inherited from the platform, not a regression introduced here.
