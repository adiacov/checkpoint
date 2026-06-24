# Feature Specification: Claude Code Adapter

**Feature Branch**: `002-claude-code-adapter`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Claude Code adapter for checkpoint. A thin agent adapter (NOT new core logic) that wires Claude Code into the existing agent-neutral @checkpoint/core engine. Register the four slash commands, hook SessionStart/SessionEnd/PreCompact, translate Claude Code's transcript into the core's ConversationEntry[], and call @checkpoint/core for all real work. Constraints: strict core/adapter split, identical four-command surface across agents (parity), add-an-agent discipline. Out of scope: entry curation/summarization, a global shell CLI, the recovery/integration workflow."

## Clarifications

### Session 2026-06-24

Resolved autonomously from the reference implementation (`reference/checkpoint.ts`) and the
constitution, to keep observable behavior at parity with the pi extension (Principle IV).

- Q: How do Claude Code lifecycle events map to core calls and capture reasons? → A: `SessionStart`
  → `sessionStart()` + pending notice; `SessionEnd` → `capture(reason: "shutdown")`; `PreCompact` →
  `capture(reason: "reload")`, suppressed when the project config has `includeReload: false`; the
  manual command → `capture(reason: "manual")`. These mirror the reference's `session_shutdown`
  reason handling.
- Q: Where does duplicate/skip-empty/bounding logic live for the adapter? → A: Entirely in the
  core. The adapter keeps no cross-event state of its own; the core's stateless dedup, skip-empty,
  and `recentEntries`/`maxTextPerEntry` bounding apply. The adapter never truncates or de-dups.
- Q: How is each transcript message translated? → A: One Claude Code transcript message → one
  `ConversationEntry`, preserving role, timestamp when present, and order. Structured content
  (tool calls, thinking, images, attachments, other) is mapped into the core's content-block
  representation rather than flattened to text or dropped.
- Q: What does the manual capture command do when the project is opted in but disabled? → A: It
  captures nothing and tells the developer checkpointing is disabled here (run opt-in first),
  matching the reference's manual-command behavior.
- Q: When is the start-of-session pending notice shown? → A: Only when the project is enabled, a
  user-facing session UI is present, and the pending count is greater than zero; otherwise no
  notice (parity with the reference's `hasUI` + `pending > 0` guard).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a checkpoint from inside Claude Code (Priority: P1)

A developer working in a checkpoint-enabled project, from inside the Claude Code TUI, triggers a
checkpoint of where they are right now. A Markdown snapshot of their git state and recent
conversation is written to the project's pending directory, so the next session can recover it.

**Why this priority**: Capture is the reason the product exists. Without it, the adapter delivers
no value. It is also the slice that exercises the hardest adapter-specific work — reading Claude
Code's transcript and translating it into the core's conversation shape.

**Independent Test**: In a project that has been opted in, run the capture command from Claude
Code with a non-empty conversation, then confirm a new checkpoint file appears in the pending
directory containing the current git facts and the recent conversation.

**Acceptance Scenarios**:

1. **Given** an opted-in project with recent conversation, **When** the developer invokes the
   capture command, **Then** a single Markdown checkpoint is written to the pending directory and
   the developer is told it was written (with the location).
2. **Given** a project that has not been opted in, **When** the developer invokes capture, **Then**
   no file is written and the developer is told the project is not configured.
3. **Given** an opted-in project where the recent conversation is empty, **When** capture runs,
   **Then** no file is written and the developer is told the session was skipped as empty.
4. **Given** a checkpoint was just captured, **When** an identical capture is triggered again
   within the dedup window, **Then** the duplicate is suppressed and reported as such.

---

### User Story 2 - Automatic capture on session end and before compaction (Priority: P1)

The developer finishes a Claude Code session (or the session is about to be compacted) without
remembering to run any command. The adapter detects the lifecycle event and captures a checkpoint
automatically, so context is preserved even when capture was not requested explicitly.

**Why this priority**: Automatic capture at the moments context is most likely to be lost is the
core daily-use value; relying on the user to remember the command defeats the purpose.

**Independent Test**: In an opted-in project with recent conversation, trigger the session-end
lifecycle event and confirm a checkpoint is written without any command being typed; repeat for
the pre-compaction event.

**Acceptance Scenarios**:

1. **Given** an opted-in project with recent conversation, **When** the session-end lifecycle
   event fires, **Then** a checkpoint is captured automatically with a reason reflecting session
   end.
2. **Given** an opted-in project, **When** the pre-compaction lifecycle event fires, **Then** a
   checkpoint is captured automatically before context is compacted.
3. **Given** a project that is not opted in, **When** any lifecycle event fires, **Then** nothing
   is captured and no error is surfaced to the developer.

---

### User Story 3 - Start-of-session pending notice (Priority: P2)

When a session starts in an opted-in project, the developer is told how many checkpoints are
waiting to be reviewed, and the archive is kept within its bound. This is the prompt that leads
the developer to recover prior context.

**Why this priority**: It closes the loop — capture is only useful if the next session surfaces
that something is waiting. Lower than capture because value depends on captures already existing.

**Independent Test**: In an opted-in project that has pending checkpoints, start a session and
confirm the developer sees an accurate count of pending checkpoints.

**Acceptance Scenarios**:

1. **Given** an opted-in project with one or more pending checkpoints, **When** a session starts,
   **Then** the developer sees the correct pending count.
2. **Given** an opted-in project with no pending checkpoints, **When** a session starts, **Then**
   no misleading notice is shown.

---

### User Story 4 - Manage opt-in and inspect status from inside Claude Code (Priority: P2)

The developer enables checkpointing for a project, checks its status, and later disables it —
all through commands inside Claude Code, with behavior identical to every other supported agent.

**Why this priority**: Required for the command surface to match the cross-agent contract, but a
project can be opted in by any other means, so it is not the critical path to first value.

**Independent Test**: From Claude Code, run the opt-in command in a fresh project and confirm it
becomes configured; run status and confirm it reports the state; run disable and confirm status
then reports it disabled.

**Acceptance Scenarios**:

1. **Given** a project not yet configured, **When** the developer runs the opt-in command,
   **Then** the project becomes enabled with its directories and ignore rules set up, and re-running
   it is safe.
2. **Given** a configured project, **When** the developer runs the status command, **Then** they
   see whether it is configured and enabled and the pending/archived counts.
3. **Given** an enabled project, **When** the developer runs the disable command, **Then**
   checkpointing is turned off while existing configuration and files are left intact, and status
   reflects the disabled state.

---

### Edge Cases

- **Not a git repository / git unavailable**: capture still produces a checkpoint with graceful
  git fallbacks rather than failing (behavior owned by the core; the adapter must not mask it).
- **No transcript available for the session**: the adapter supplies an empty conversation; the
  core's skip-empty guard then applies. The adapter must not fabricate entries.
- **Structured / non-text transcript content** (tool calls, thinking, images, attachments): the
  adapter maps these into the core's conversation-entry shape without losing the message, rather
  than dropping or crashing.
- **Lifecycle event fires when not opted in**: must be a silent no-op, never an error shown to the
  developer.
- **Capability gap**: if a Claude Code lifecycle hook needed for a capability does not exist or
  cannot fire (e.g. hard kill), the gap is documented in the per-agent mapping table rather than
  worked around with divergent behavior.
- **A capture fails (e.g. write error)**: the failure is reported to the developer, never silently
  dropped.
- **Manual capture while disabled**: in a configured-but-disabled project the manual command
  captures nothing and tells the developer to opt in first (parity with the reference).
- **Back-to-back lifecycle events** (e.g. pre-compaction immediately followed by another within
  the dedup window): the core's stateless dedup suppresses the duplicate; the adapter adds no
  dedup logic of its own.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The adapter MUST expose exactly the shared four-command surface from inside Claude
  Code — capture, opt-in (enable), disable, and status — with names, semantics, and observable
  output identical to the same commands on other agents.
- **FR-002**: Each command MUST delegate to the corresponding shared-core capability for all real
  work; the adapter MUST NOT contain its own capture, dedup, skip-empty, prune, config, or
  git-facts logic.
- **FR-003**: The adapter MUST trigger automatic capture on Claude Code's session-end lifecycle
  event (with reason "shutdown") and on its pre-compaction lifecycle event (with reason "reload"),
  where the pre-compaction capture is suppressed when the project config disables reload captures.
  The manual capture command MUST use reason "manual". These mappings MUST match the reference
  implementation's reason handling.
- **FR-004**: The adapter MUST run the start-of-session core step on session start and surface the
  resulting pending count to the developer only when the project is enabled, a user-facing session
  UI is present, and the pending count is greater than zero.
- **FR-005**: The adapter MUST read Claude Code's session transcript and translate it into the
  core's conversation-entry representation, preserving message role, ordering, timestamp where
  available, and structured content (text, tool calls, thinking, images, other) without dropping
  messages.
- **FR-006**: When no transcript or no recent conversation is available, the adapter MUST pass an
  empty conversation to the core and rely on the core's skip-empty handling rather than inventing
  content or suppressing the call itself.
- **FR-007**: Lifecycle-driven captures in a project that is not opted in MUST be silent no-ops
  with no error surfaced to the developer.
- **FR-008**: The adapter MUST surface core outcomes to the developer — checkpoint written (with
  location), skipped (with reason), and failures — without hiding errors.
- **FR-009**: The adapter MUST NOT introduce any behavior that diverges from the reference
  implementation's observable behavior; any unavoidable Claude-Code-specific deviation or
  capability gap MUST be documented in the per-agent mapping table, not silently introduced.
- **FR-010**: The adapter MUST live under its own adapter location, depend on the shared core, and
  contain only command registration, lifecycle wiring, and transcript translation — following the
  documented add-an-agent procedure (write adapter → wire install → update mapping table →
  smoke-test).
- **FR-011**: The adapter MUST NOT add out-of-scope surfaces: no entry curation/summarization, no
  global shell binary, and no recovery/integration of pending checkpoints into durable memory.
- **FR-012**: The adapter MUST be installable into Claude Code's extension surface with the
  repository remaining the single source of truth, and its install path/procedure MUST be
  documented. The automated install mechanism itself (symlink-from-repo preferred, copy+sync
  fallback) is delivered by the install/distribution feature (006); this feature only ensures the
  adapter is install-ready and documents the pointer.

### Key Entities *(include if feature involves data)*

- **Slash command**: A developer-invokable command inside Claude Code (capture, opt-in, disable,
  status) that maps one-to-one to a shared-core capability.
- **Lifecycle event**: A Claude Code session signal (session start, session end, pre-compaction)
  the adapter subscribes to in order to trigger the right core call.
- **Conversation entry**: The core's neutral representation of one transcript message (role,
  optional timestamp, string or structured content) that the adapter produces from Claude Code's
  transcript.
- **Per-agent mapping table**: The documented record of which commands and lifecycle triggers each
  agent supports, including any capability gaps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All four commands are invokable from inside the Claude Code TUI and each produces the
  same observable result as the reference implementation for the same input.
- **SC-002**: Ending a session in an opted-in project with recent conversation results in exactly
  one checkpoint file in the pending directory without the developer running any command.
- **SC-003**: Starting a session in an opted-in project reports a pending count that matches the
  actual number of files in the pending directory.
- **SC-004**: For a transcript containing structured content (tool calls, thinking, images), the
  captured checkpoint preserves every message, with none dropped or causing a failure.
- **SC-005**: 100% of checkpoint behavior (capture, dedup, skip-empty, prune, config, git facts)
  is performed by the shared core; the adapter contributes zero such logic (verifiable by review
  and by the absence of duplicated logic in the adapter).
- **SC-006**: A developer can opt a fresh project in, capture, and confirm recovery on next session
  start entirely from within Claude Code, with no steps outside the agent.
- **SC-007**: The smoke test (each command from the TUI, automatic capture on session end, and the
  startup pending notice) passes before the adapter is declared working.

## Assumptions

- The shared core `@checkpoint/core` is available as a dependency and provides `optIn`, `capture`,
  `disable`, `status`, `sessionStart`, and `detectProject`; the adapter consumes it unchanged.
- Claude Code exposes mechanisms to register slash commands and to subscribe to SessionStart,
  SessionEnd, and PreCompact lifecycle events; exact mechanisms are an implementation/planning
  concern, not a scope question.
- The adapter supplies the git command runner and the extracted conversation entries to the core
  via the core's dependency-injection input; it does not reimplement git access.
- Opt-in remains agent-neutral (the tracked project config), so a project opted in via Claude Code
  is equally recognized by other agents and vice versa.
- Hard-kill / crash termination cannot trigger a lifecycle hook; this is an inherent, documented
  gap, consistent with the reference implementation, and not a defect of this feature.
- The recovery/integration workflow that consumes pending checkpoints is a separate, later feature
  and is explicitly out of scope here.
