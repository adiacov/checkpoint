# Feature Specification: Codex Adapter

**Feature Branch**: `005-codex-adapter`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Codex adapter (005): Add a Codex CLI adapter that exposes the same four checkpoint commands and best-effort automatic capture, delegating to @checkpoint/core with zero duplicated checkpoint logic."

## Overview

Bring checkpoint to the Codex CLI coding agent. Like the Claude Code and pi adapters, the Codex
adapter exposes the same four commands and automatic session capture by delegating every checkpoint
decision to the shared `@checkpoint/core`, with no checkpoint logic of its own. Codex is the third
and last of the originally-planned adapters (constitution ship order: core → Claude → pi → Codex).

Codex's extension surface is thinner than pi's or Claude Code's, so automatic capture here is
explicitly **best-effort** (a constitution-sanctioned position): Codex exposes commands only as
*prompt expansions* and emits exactly one automation event (`agent-turn-complete`) — there is no
session-start, session-end, or pre-compaction hook. The adapter delivers the fullest checkpoint
experience Codex's surface allows and documents every capability gap honestly in the per-agent
mapping table rather than papering over it.

This is the third adapter; it reuses the Claude Code adapter's **bridge** pattern (a thin compiled
Node CLI that Codex's `notify` program and command prompts both invoke), and mirrors the structure,
testing, and build discipline of `adapters/claude-code` and `adapters/pi`.

## Clarifications

### Session 2026-06-24

Resolved during clarification from current Codex documentation (verified against OpenAI's Codex
config and custom-prompts references) and the existing adapter patterns. Per the standing
instruction to resolve ambiguities with best judgment, these were decided rather than escalated;
each is recorded so downstream planning is unambiguous.

- Q: What capture reason does best-effort automatic capture use? → A: `turn-complete` — an honest
  reason reflecting Codex's only automation trigger (`agent-turn-complete`). It is a normal
  (non-reload) reason, so the core applies its standard guards; it is intentionally distinct from
  the other adapters' `shutdown` because Codex has no true session-end signal. Recorded in the
  per-agent mapping table.
- Q: What is the primary transcript source for automatic capture? → A: the automation payload
  itself — its `input-messages` become `user` entries and `last-assistant-message` becomes one
  `assistant` entry. This is the stable, documented source and guarantees a real user message so the
  core's skip-empty behaves correctly. The on-disk Codex session transcript (rollout JSONL) is
  best-effort enrichment for the **manual** command only, and degrades to git-facts-only when
  unavailable/unparseable.
- Q: How do commands execute, given Codex prompts are not code? → A: each command is a markdown
  prompt that instructs the agent to run the adapter bridge via its shell tool and report the
  output. Effectiveness depends on the model following the instruction and having shell access — a
  documented best-effort property of Codex's prompt-only command surface.
- Q: How is the missing start-of-session pending notice handled? → A: it is a documented capability
  gap (Codex emits no session-start event). `/checkpoint-status` surfaces the pending count on
  demand; no divergent behavior is invented to emulate the notice.
- Q: Does the Codex adapter depend on the Claude Code adapter for the shared bridge code? → A: No.
  It reuses the bridge *pattern* but is an independent package depending only on `@checkpoint/core`
  (the neutrality contract: a single runtime dependency). Shared subcommand handlers
  (`optin`/`disable`/`status`/`manual`/`archive`) are re-expressed thinly here, not imported from
  another adapter.
- Q: Where does the concrete bridge install path in the prompts/config come from? → A: it is a
  documented placeholder resolved by the install/distribution feature (006); this feature ships the
  prompt templates and a `config.example.toml` with a clearly-marked placeholder path.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Best-effort automatic capture during a Codex session (Priority: P1)

A developer works in a Codex-opted-in project. As the agent completes turns, the adapter captures
raw checkpoints of the session — git facts plus recent conversation — into the project's pending
directory, without the developer doing anything. Because Codex only signals turn completion (not
session end), capture is approximated at each completed turn and bounded by the core's dedup window
so it does not write on every turn.

**Why this priority**: Automatic, no-effort capture is the core value of the tool. It is the single
most important behavior to bring to Codex even in best-effort form; a Codex user gets session memory
they would otherwise lose.

**Independent Test**: In an opted-in project, feed the adapter a representative `agent-turn-complete`
payload and confirm a checkpoint markdown file appears in `sessions/pending/` with git facts and the
turn's conversation; feed a second payload immediately and confirm the dedup window suppresses it.

**Acceptance Scenarios**:

1. **Given** a Codex-opted-in project, **When** a turn completes (a turn-complete event is
   delivered) in a non-empty session, **Then** a checkpoint is written to the pending directory.
2. **Given** two turn-complete events for the same project within the dedup window, **When** the
   second is delivered, **Then** no duplicate checkpoint is written.
3. **Given** a turn-complete event whose payload carries no real user message, **When** it is
   delivered and skip-empty is enabled, **Then** no checkpoint is written.
4. **Given** a project that has NOT opted in, **When** a turn-complete event is delivered, **Then**
   no checkpoint is written and the project is left untouched.

---

### User Story 2 - The same four commands inside Codex (Priority: P1)

A developer uses the same checkpoint commands inside Codex that they use in every other supported
agent: a manual checkpoint, opt-in, disable, and status. Invoking a command makes the agent run the
adapter and report the result, producing the same observable outcome as the other adapters for the
same project state.

**Why this priority**: The identical command surface across agents is a non-negotiable product
principle. A Codex user must find the same commands behaving the same way, or the tool stops feeling
like one tool.

**Independent Test**: For each command, run the adapter's corresponding action against a sample
project and confirm it performs the same observable action as the Claude Code and pi adapters
(config + dirs + ignore rules created on opt-in; status reported; manual checkpoint written when
enabled; disabled flag set).

**Acceptance Scenarios**:

1. **Given** a project not yet opted in, **When** the opt-in command runs, **Then** the config file,
   pending/archive directories, keep-files, and ignore rules are created and the result reported.
2. **Given** an opted-in project, **When** the disable command runs, **Then** checkpointing is
   marked disabled while config, directories, and existing checkpoints are preserved.
3. **Given** any project, **When** the status command runs, **Then** the result reports whether the
   project is configured, enabled/disabled, the pending and archive directories, and the pending and
   archived counts.
4. **Given** an opted-in, enabled project, **When** the manual checkpoint command runs, **Then** a
   checkpoint is written and its path reported.
5. **Given** a disabled or not-configured project, **When** the manual checkpoint command runs,
   **Then** no checkpoint is written and the user is told to opt in first.

---

### User Story 3 - Logic lives once, verifiably (Priority: P2)

The maintainer can trust that the Codex adapter contains no copy of checkpoint logic — every
checkpoint decision is the shared core's — and that adding Codex did not require forking behavior.
This trust is backed by an automated neutrality/contract test, not just review.

**Why this priority**: "Write the logic once" is the architectural reason the project exists.
Without an enforced guarantee, duplication can creep back. Important for maintainability; it does not
change runtime behavior for the end user.

**Independent Test**: Run the adapter's test suite and confirm a neutrality test fails if checkpoint
logic (git facts, markdown format, skip-empty, dedup, prune, config, pending-count) is reintroduced
into the adapter, and passes when all such decisions are delegated to the core.

**Acceptance Scenarios**:

1. **Given** the adapter source, **When** the neutrality test runs, **Then** it confirms the adapter
   imports checkpoint behavior from the shared core and does not re-implement it.
2. **Given** the adapter and core together, **When** the adapter test suite runs, **Then** the
   observable capture, config, skip-empty, dedup, and command behaviors match the other adapters.

---

### Edge Cases

- **Turn-complete payload with no transcript depth**: The automation payload carries only the
  current turn's user message(s) and the latest assistant message — not the full session history.
  Capture must still produce a useful checkpoint (git facts plus that turn) and must not fail for
  lack of deeper history.
- **Manual command with no readable session transcript**: When the manual command runs, the richest
  conversation source is the Codex session transcript on disk, whose exact format varies by Codex
  version. If it cannot be located or parsed, the manual checkpoint must degrade gracefully to a
  git-facts-only checkpoint rather than failing.
- **Long session, many turns**: Because capture triggers per completed turn (bounded by dedup),
  several pending checkpoints can accumulate over a long session. This is expected best-effort
  behavior; the recovery/archive workflow handles cleanup, and projects may configure a larger dedup
  window to reduce volume.
- **Command not executed by the agent**: Commands are prompt expansions that instruct the agent to
  run the adapter. If the agent does not follow the instruction or lacks shell access, the command
  has no effect. This dependence is inherent to Codex's prompt-only command surface and must be
  documented, not hidden.
- **Not opted in**: Every automatic and manual path must be a safe no-op (no files written, no
  errors that disrupt the session) when the project has not opted in.
- **Malformed automation payload**: An unparseable or partial payload must not crash; it results in
  no checkpoint, surfaced as a clear non-failure outcome.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The adapter MUST expose the same four commands as every other adapter — manual
  checkpoint, opt-in, disable, and status — using the same names and semantics, surfaced through
  Codex's command mechanism.
- **FR-002**: The adapter MUST provide best-effort automatic capture driven by Codex's single
  automation event (turn completion), passing a capture reason that reflects the trigger.
- **FR-003**: On an automatic capture trigger, the adapter MUST request a checkpoint from the core
  and let the core decide whether to write (configured, enabled, skip-empty, dedup) rather than
  deciding itself.
- **FR-004**: The manual checkpoint command MUST capture a checkpoint via the core and report the
  result; when checkpointing is not enabled it MUST tell the user to opt in first instead of writing.
- **FR-005**: The opt-in command MUST opt the project in via the core (write config, create
  directories and keep-files, add ignore rules) and report what was set up.
- **FR-006**: The disable command MUST disable checkpointing via the core (preserving config,
  directories, and existing checkpoints) and report the result; it MUST be a safe no-op when the
  project is not configured.
- **FR-007**: The status command MUST report, via the core, whether the project is configured, its
  enabled state, the pending and archive directories, and the pending and archived counts.
- **FR-008**: The adapter MUST contain NO checkpoint logic of its own. All checkpoint decisions —
  config normalization, git facts collection, markdown checkpoint format, skip-empty, dedup, archive
  prune, and pending count — MUST come from the shared core. The only adapter-specific code permitted
  is command wiring, automation-event parsing, transcript translation, and result formatting.
- **FR-009**: The adapter MUST translate Codex conversation inputs into the core's neutral
  conversation representation: from the automation payload (the turn's user messages and the latest
  assistant message) as the primary, stable source, and best-effort from the on-disk Codex session
  transcript for the manual command, degrading gracefully when that transcript is unavailable.
- **FR-010**: An automated neutrality/contract test MUST fail if checkpoint logic is reintroduced
  into the adapter and pass when all such logic is delegated to the core.
- **FR-011**: The adapter MUST preserve behavioral parity with the other adapters for every shared
  capability it supports; every capability gap forced by Codex's surface MUST be documented in the
  per-agent mapping table, not worked around with divergent behavior.
- **FR-012**: Automatic and manual paths MUST be safe no-ops for projects that have not opted in,
  and MUST NOT crash on malformed or partial automation input.
- **FR-013**: The adapter MUST ship a configuration example and command definitions that wire Codex
  to the adapter, with the concrete install path treated as a documented placeholder resolved by the
  install/distribution feature.
- **FR-014**: The adapter MUST ship with build, type-check, lint, and test discipline equivalent to
  the Claude Code and pi adapters, and MUST document (in an adapter README) what it adds, how it is
  wired, its best-effort gaps, and how to build it.

### Key Entities *(include if data involved)*

- **Codex Adapter**: The thin adapter under `adapters/codex/` that wires Codex's commands and
  automation event to the shared core. Owns no checkpoint state.
- **Automation Payload**: The turn-completion event data Codex passes to the adapter (event type,
  identifiers, working directory, the turn's user messages, the latest assistant message).
- **Conversation Entry (core representation)**: The agent-neutral conversation record the core
  consumes; the adapter produces these from the automation payload or the session transcript.
- **Checkpoint File**: Raw session-evidence markdown written by the core to the pending directory;
  unchanged in shape from the other adapters.
- **Checkpoint Config**: The project's opt-in/tuning settings, owned and normalized by the core.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In an opted-in project, a representative turn-completion event produces an automatic
  checkpoint (git facts plus the turn's conversation) with no manual action, in 100% of non-empty,
  non-duplicate cases.
- **SC-002**: All four commands are available inside Codex and each produces the same observable
  outcome as the corresponding Claude Code / pi adapter command for the same project state.
- **SC-003**: For every shared behavior under test (capture, config, skip-empty, dedup, command
  outputs), the adapter-plus-core produces matching observable results — zero parity regressions on
  supported capabilities.
- **SC-004**: The amount of checkpoint logic duplicated in the adapter is zero, enforced by an
  automated test that fails on reintroduction.
- **SC-005**: Adding the Codex adapter follows the documented add-an-agent procedure end to end, and
  the per-agent mapping table is updated to include Codex with each best-effort gap recorded.
- **SC-006**: The adapter's quality gates (build, type-check, lint, tests) all pass.
- **SC-007**: Every Codex capability gap (no start-of-session notice, no true session-end, no
  reload/pre-compact event, prompt-only commands) is explicitly documented; none is silently
  emulated with divergent behavior.

## Assumptions

- The shared `@checkpoint/core` already exposes every capability the adapter needs (detectProject,
  optIn, disable, status, sessionStart, capture, archive); no core change is expected. If a genuine
  gap is found, the missing behavior belongs in the core, not the adapter.
- Codex's command mechanism is custom prompts (markdown files whose names become slash commands),
  which are prompt expansions injected as user input, not direct code execution. Each command prompt
  therefore instructs the agent to run the adapter via its shell tool. Custom prompts are a
  documented but OpenAI-deprecated mechanism (skills are the recommended successor); the adapter uses
  prompts for v1 and records this as a stability caveat, with skills as a future migration path.
- Codex's only automation event is turn completion (`agent-turn-complete`), delivered to a `notify`
  program configured in Codex's config, carrying the working directory, the turn's user messages, and
  the latest assistant message. There is no session-start, session-end, or pre-compaction event.
- The adapter reuses the Claude Code adapter's bridge pattern: a thin compiled command-line program
  the `notify` program and the command prompts both invoke; this is not a global PATH binary.
- The on-disk Codex session transcript format (rollout files) varies by Codex version; reading it is
  best-effort enrichment for the manual command and is allowed to degrade to git-facts-only.
- Install/distribution of the adapter into Codex's configuration directory is out of scope (feature
  006); this feature delivers the adapter source, command/config definitions, tests, and docs
  in-repo, with the bridge install path as a documented placeholder.
- The config single-source migration (007) is out of scope.
- Capture cannot run after a hard kill or on true session end (no such event) — an inherent,
  documented limitation of Codex's surface, not a regression introduced here.
