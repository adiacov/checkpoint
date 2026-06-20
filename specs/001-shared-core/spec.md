# Feature Specification: Shared Checkpoint Core

**Feature Branch**: `001-shared-core`

**Created**: 2026-06-20

**Status**: Draft

**Input**: User description: "Shared agent-neutral checkpoint core: git facts, markdown checkpoint format, opt-in config, archive prune, skip-empty/dedup, startup pending-count — extracted from the pi checkpoint.ts as the single source of truth that every agent extension calls."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capture a checkpoint at session end (Priority: P1)

When a coding session ends in an opted-in project, the core captures the session's
end-state — git facts plus the recent conversation — into a checkpoint so a later session
(with any agent) can recover context. A caller (any agent adapter) hands the core the
session's conversation messages and the project location; the core produces a checkpoint
markdown file in the project's pending directory.

**Why this priority**: This is the reason the project exists. Without reliable capture there
is nothing to recover, and every adapter depends on this single behavior. It is the minimal
viable slice — if only this works, the tool already delivers value.

**Independent Test**: Drive the core with a fabricated set of conversation messages and a
project root, then assert that a correctly-formatted checkpoint markdown file appears in the
pending directory containing the expected git facts and the recent messages.

**Acceptance Scenarios**:

1. **Given** an opted-in project with a real user message in the session, **When** the core
   is asked to capture a checkpoint, **Then** a markdown file is written to the pending
   directory containing a timestamp, capture reason, project root, current working
   directory, an integration note, git facts (branch, short status, diff stat, last 5
   commits), and the last N conversation messages.
2. **Given** a session whose conversation contains only system/empty content (no real user
   message), **When** capture runs with skip-empty enabled, **Then** no checkpoint file is
   written.
3. **Given** a checkpoint was just written moments ago, **When** capture is triggered again
   within the dedup window, **Then** no duplicate checkpoint is written.
4. **Given** a conversation message longer than the per-entry text limit, **When** a
   checkpoint is written, **Then** that message is truncated to the configured limit and
   thinking blocks are omitted while tool calls are summarized.

---

### User Story 2 - Opt a project in and configure capture (Priority: P1)

A project owner opts a project into checkpointing and tunes how capture behaves. The core
reads and writes the project's opt-in configuration, applies sensible defaults for anything
unset, and sets up the directory and ignore conventions so raw checkpoints are kept out of
version control while the opt-in itself travels with the repo.

**Why this priority**: Capture (Story 1) only runs for opted-in projects and is governed by
this configuration, so the two together form the true MVP. Defaults must be safe so a bare
opt-in works without further tuning.

**Independent Test**: Call the opt-in routine on a fresh project and assert the config file,
the pending/archive directories, their `.gitkeep` files, and the ignore rules are created;
then read the config back and confirm defaults are applied for unspecified fields.

**Acceptance Scenarios**:

1. **Given** a project with no checkpoint configuration, **When** opt-in runs, **Then** an
   agent-neutral config file is created at the project root, the pending and archive
   directories are created with tracked `.gitkeep` files, and ignore rules exclude the raw
   checkpoint markdown while keeping the `.gitkeep` files and config tracked.
2. **Given** a project that only has the legacy configuration, **When** the core loads
   configuration, **Then** the legacy configuration is read and honored during the
   transition.
3. **Given** a config that omits some tuning fields, **When** the core loads it, **Then**
   documented default values are applied for every unset field.
4. **Given** an opted-in project, **When** capture is requested but opt-in is disabled in
   config, **Then** no checkpoint is written.

---

### User Story 3 - Surface and bound pending checkpoints at session start (Priority: P2)

When a session starts, the core reports how many pending checkpoints await review and keeps
the archive from growing without bound by pruning old archived checkpoints down to a
configured maximum.

**Why this priority**: Recovery only happens if the user is told there is something to
recover, and unbounded archives degrade the project over time. Valuable, but capture and
opt-in must exist first.

**Independent Test**: Seed a pending directory with several checkpoint files and an archive
directory with more than the configured maximum, run the startup routine, and assert the
returned pending count is correct and the archive is trimmed to the maximum (oldest removed
first).

**Acceptance Scenarios**:

1. **Given** a pending directory containing some checkpoint files, **When** the startup
   routine runs, **Then** the core reports the exact count of pending checkpoints.
2. **Given** an archive directory containing more than the configured maximum, **When** the
   startup routine runs, **Then** the oldest archived checkpoints are removed until the
   count equals the maximum.
3. **Given** an archive at or below the configured maximum, **When** the startup routine
   runs, **Then** no archived checkpoints are removed.

---

### Edge Cases

- **Not a git repository**: capture proceeds and records that git facts were unavailable
  rather than failing, since checkpoints still carry useful conversation evidence.
- **Pending or archive directory missing at capture/startup time**: the core creates the
  directory as needed rather than erroring.
- **Empty conversation handed to the core**: with skip-empty enabled nothing is written;
  with skip-empty disabled a checkpoint with no conversation body is still written.
- **Clock skew / identical timestamps**: two near-simultaneous captures must not collide on
  filename or silently overwrite a prior checkpoint.
- **Very large conversations**: only the most recent N entries are included and each is
  truncated, so checkpoint size stays bounded regardless of session length.
- **Reload/restart events**: a reload-type session end is not captured unless the caller
  opts into including reloads.
- **Unwritable pending directory (permissions)**: the failure is surfaced to the caller with
  useful context, not swallowed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The core MUST be agent-neutral — it MUST NOT depend on any agent SDK or
  agent-specific runtime, and MUST receive the conversation messages and project location
  from its caller.
- **FR-002**: The core MUST collect git facts for the project: current branch, short status,
  diff stat, and the last 5 commit summaries; when the project is not a git repository it
  MUST record that git facts are unavailable instead of failing.
- **FR-003**: The core MUST produce a checkpoint as markdown containing: capture timestamp,
  capture reason, project root, current working directory, an integration note, the git
  facts, and the most recent N conversation entries.
- **FR-004**: The core MUST include at most a configurable number of recent conversation
  entries (default N), truncate each entry to a configurable per-entry character limit,
  omit thinking blocks, and summarize tool calls rather than including them verbatim.
- **FR-005**: The core MUST skip writing a checkpoint when skip-empty is enabled and the
  session contains no real user message.
- **FR-006**: The core MUST suppress duplicate checkpoints captured within a short dedup
  window of a previous capture.
- **FR-007**: The core MUST not capture reload/restart session ends unless the caller has
  enabled including reloads.
- **FR-008**: The core MUST read and write an agent-neutral project opt-in configuration
  file at the project root, and MUST also read the legacy configuration location during the
  transition.
- **FR-009**: The core MUST apply documented default values for every configuration field
  that is unset.
- **FR-010**: The opt-in routine MUST create the pending and archive directories with
  tracked placeholder files and MUST establish ignore rules that exclude raw checkpoint
  markdown while keeping the placeholders and the config file tracked.
- **FR-011**: The core MUST only capture for projects that are opted in and enabled; when
  opt-in is absent or disabled it MUST write nothing.
- **FR-012**: At session start the core MUST report the count of pending checkpoints
  awaiting review.
- **FR-013**: At session start the core MUST prune the archive to a configured maximum,
  removing the oldest archived checkpoints first.
- **FR-014**: The core MUST expose its capabilities — capture, opt-in/disable, status, and
  startup — through a stable interface that any agent adapter can call without duplicating
  logic.
- **FR-015**: The core MUST preserve functional parity with the reference pi extension: no
  observable behavior of the original capture/config/prune logic regresses, and any
  intentional change is documented.
- **FR-016**: The core MUST surface failures (e.g., unwritable directories) to the caller
  with enough context to diagnose, rather than silently discarding a checkpoint.

### Key Entities *(include if feature involves data)*

- **Checkpoint**: A single captured session end-state, persisted as one markdown file. Key
  attributes: timestamp, capture reason, project root, working directory, integration note,
  git facts, and the recent conversation entries.
- **Checkpoint configuration**: The per-project opt-in and tuning record. Key attributes:
  enabled flag, pending directory, archive directory, include-reload flag, skip-empty flag,
  maximum archived checkpoints, recent-entries count, per-entry text limit, and bookkeeping
  timestamps.
- **Git facts**: A point-in-time snapshot of repository state attached to a checkpoint:
  branch, short status, diff stat, and recent commit summaries (or an unavailable marker).
- **Conversation entry**: A single recent message included in a checkpoint, after truncation
  and with thinking omitted and tool calls summarized.
- **Pending/archive stores**: Filesystem locations holding un-reviewed and reviewed
  checkpoints respectively; the archive is size-bounded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For every session-end in an opted-in, non-empty, non-duplicate session, a
  checkpoint file is produced 100% of the time (within the limits of lifecycle hooks being
  able to fire).
- **SC-002**: A fresh project can be opted in and produce its first recoverable checkpoint
  with no configuration beyond the single opt-in action.
- **SC-003**: Checkpoint file size stays bounded regardless of session length — never
  exceeding the recent-entries count times the per-entry limit (plus fixed header).
- **SC-004**: Raw checkpoint markdown never appears as tracked content in version control,
  while the opt-in configuration and directory placeholders always do.
- **SC-005**: The archive never exceeds the configured maximum number of checkpoints after a
  session start.
- **SC-006**: 100% of the reference pi extension's capture, config, skip-empty, dedup, and
  prune behaviors are reproduced by the core (verified by parity checks); any deviation is
  explicitly documented.
- **SC-007**: A new agent adapter can invoke every core capability through its interface
  without copying or reimplementing any core logic.

## Assumptions

- The shared core is the single source of truth; agent adapters (pi, Claude Code, Codex) are
  thin callers and are out of scope for this feature.
- The core is implemented in Node/TS, porting the existing ~460-line pi `checkpoint.ts`
  logic close to verbatim, per the project's stated decisions.
- Default tuning values match the reference extension: recent-entries default 24, per-entry
  limit default 4000 characters, maximum archived checkpoints default 50, with a dedup
  window of roughly 20 seconds.
- The agent-neutral config file is `.checkpoint.json` at the project root and is tracked in
  git; the legacy `.pi/checkpoint.json` is read during the transition.
- Raw checkpoints live under `sessions/pending/` and `sessions/archive/` as markdown and are
  git-ignored, with `.gitkeep` files tracked.
- Reading the conversation transcript and registering commands/lifecycle triggers belong to
  each adapter; the core only consumes already-provided conversation entries.
- Hard-kill capture (`kill -9`/crash) is an inherent, accepted gap and is not a requirement
  of this feature.
- Caller supplies which lifecycle event triggered capture (e.g., normal end vs. reload) so
  the core can apply include-reload behavior.
