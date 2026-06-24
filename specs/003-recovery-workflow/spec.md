# Feature Specification: Recovery / Integration Workflow

**Feature Branch**: `003-recovery-workflow`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Recovery / integration workflow (feature 003). Build the back half of the checkpoint lifecycle that the shared core (001) deliberately omits."

## Clarifications

### Session 2026-06-24

- Q: How does the archive operation choose which files to act on? → A: It accepts an explicit
  list of filenames; if the list is omitted/empty, it archives all current pending checkpoints.
- Q: How is a name collision in the archive handled? → A: Skip and report it as already-archived;
  never overwrite, never lose a file (safety net — filenames are unique timestamps).
- Q: In "archive all" mode, what is acted on? → A: Only `*.md` checkpoint files in the pending
  directory; `.gitkeep` and unrelated files are never moved.
- Q: How is the agent-driven recovery procedure surfaced (esp. in the Claude Code adapter)? → A:
  `WORKFLOWS.md` is the single authoritative procedure; the adapter docs reference it and the
  bridge's `archive` call. No fifth slash command is added (preserves the four-command surface
  and pi parity).
- Q: Is archive a standalone core capability or part of `sessionStart`? → A: A standalone core
  capability (sibling of `capture`/`status`); it reuses the existing archive-prune. `sessionStart`
  is unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Archive processed checkpoints (Priority: P1)

After a developer (or their agent) has reviewed the raw checkpoint files in `sessions/pending/`
and pulled out anything still worth keeping, they need those processed files moved out of the way
into `sessions/archive/` so that `pending/` only ever shows work that still needs attention. This
is the mechanical close-out step of the recovery loop.

**Why this priority**: This is the single missing mechanical capability without which the whole
lifecycle stalls — `pending/` grows without bound and the core's archive-prune (which only ever
trims `archive/`) has nothing to act on. It is the smallest independently shippable slice and
everything else builds on it.

**Independent Test**: With one or more files in `pending/`, invoke the archive operation for those
files and confirm each named file is now in `archive/` and gone from `pending/`, the archive size
limit is enforced afterward, and the operation reports exactly what it moved.

**Acceptance Scenarios**:

1. **Given** two checkpoint files exist in `pending/`, **When** the archive operation is invoked
   for both, **Then** both files are present in `archive/`, neither remains in `pending/`, and the
   result reports two files moved.
2. **Given** a file named in the request does not exist in `pending/`, **When** the archive
   operation runs, **Then** that file is reported as skipped/not-found and the remaining valid
   files are still archived (one bad name does not abort the batch).
3. **Given** the archive already holds the maximum number of checkpoints, **When** new files are
   archived, **Then** the oldest archived checkpoints are pruned to honor the configured limit.
4. **Given** a file with the same name already exists in `archive/`, **When** the archive
   operation runs for it, **Then** no file is lost or silently overwritten and the operation
   completes deterministically (treated as already-archived / collision-safe).

---

### User Story 2 - Run the bounded recovery workflow (Priority: P2)

When a developer resumes work in a project that has pending checkpoints, their coding agent needs
a clear, portable procedure for turning that raw evidence into durable project memory: read the
pending checkpoints (headers/summaries first), extract only the durable bits (goals, decisions,
current state, next actions, blockers, changed files, important realizations), update the
project's durable memory only with still-relevant information, and then archive the processed
files. The judgement of what is "durable" stays with the agent; the workflow only directs and
bounds it.

**Why this priority**: This is the human/agent-facing half of the feature and the reason the
mechanical op exists. It turns a pile of raw files into recovered context. It depends on Story 1
for its final step but delivers the actual user value (no lost context across sessions).

**Independent Test**: Starting from a project with pending checkpoints, follow the documented
recovery procedure end to end and confirm durable memory gained only still-relevant items, raw
transcript text was not bulk-copied into memory, and the processed files ended up in `archive/`.

**Acceptance Scenarios**:

1. **Given** pending checkpoints exist at session start, **When** the agent performs recovery,
   **Then** it reads summaries/headers before full raw content and extracts only durable items.
2. **Given** a pending checkpoint contains only stale or already-recorded information, **When**
   recovery runs, **Then** durable memory is not changed and the file is still archived.
3. **Given** recovery has extracted the durable bits, **When** it finishes, **Then** every
   reviewed file is moved to `archive/` so the next session starts with an accurate pending count.

---

### User Story 3 - Consistent surface across agents (Priority: P3)

A developer using the Claude Code adapter expects the recovery capability to be reachable the same
disciplined way the existing capabilities are, with no checkpoint logic duplicated in the adapter,
so that adding the same capability to a future agent stays a thin, documented wrapper.

**Why this priority**: Important for the project's core promise (write the logic once, thin
adapters) but not required to prove the capability works. It is the parity/discipline guarantee.

**Independent Test**: Inspect the Claude Code adapter and confirm the archive capability is reached
through a thin bridge to the shared core with no reimplemented move/prune logic, and that the
add-an-agent documentation/mapping reflects the new capability.

**Acceptance Scenarios**:

1. **Given** the Claude Code adapter, **When** the recovery workflow needs to archive files,
   **Then** it calls the shared core's archive operation through the existing thin bridge rather
   than moving files itself.
2. **Given** the project's add-an-agent documentation and per-agent mapping table, **When** the
   feature lands, **Then** they describe how the recovery capability is surfaced for each agent.

---

### Edge Cases

- **Empty pending directory**: recovery/archive invoked with nothing to do completes successfully
  as a no-op and reports zero files moved.
- **Pending directory does not exist** (project never opted in / never captured): the operation
  fails gracefully with a clear, non-throwing result rather than crashing.
- **Partial batch**: some requested files exist and some do not — valid ones are archived, missing
  ones are reported; the batch is not aborted.
- **Name collision in archive**: a file of the same name already exists in `archive/` — no data is
  lost and no silent overwrite occurs.
- **Concurrent sessions**: two agents end sessions in the same repo; archiving one set of files
  must not corrupt or lose files being written by capture.
- **Non-checkpoint files in pending**: the operation only acts on the files it is explicitly asked
  to archive and does not sweep unrelated files.
- **Stale-only checkpoints**: a checkpoint whose content is entirely stale still gets archived so
  it stops appearing as pending, even though durable memory is left unchanged.

## Requirements *(mandatory)*

### Functional Requirements

#### Mechanical archive capability (shared core)

- **FR-001**: The shared core MUST provide a standalone operation (a sibling of the existing
  capture/status capabilities, not folded into session-start) that moves checkpoint files from the
  configured pending directory to the configured archive directory. It MUST accept an explicit list
  of filenames; when the list is omitted or empty it MUST archive all current pending checkpoints
  (`*.md` files only, never `.gitkeep` or unrelated files).
- **FR-002**: The operation MUST respect the project's configured `pendingDir` and `archiveDir`
  (including the legacy-config fallback already honored by the core) rather than hardcoded paths.
- **FR-003**: The operation MUST be idempotent and collision-safe: when a same-named file already
  exists in the archive (or the file is already archived), the operation MUST skip it and report it
  as already-archived — never overwriting and never losing a file.
- **FR-004**: The operation MUST process a batch resiliently: a missing or invalid file name MUST
  be reported as skipped without aborting archiving of the remaining valid files.
- **FR-005**: After archiving, the operation MUST enforce the existing archive size limit
  (`maxArchivedCheckpoints`) using the core's existing prune behavior (no duplicate prune logic).
- **FR-006**: The operation MUST return a structured, non-throwing result describing what was
  moved, what was skipped (with reason), and any real errors — consistent with how the core's
  existing capture operation reports outcomes. A checkpoint file MUST never be silently lost.
- **FR-007**: The operation MUST be guarded for the not-configured / not-opted-in / missing-dir
  cases and report them as a benign result rather than throwing.
- **FR-008**: The mechanical operation MUST NOT read, summarize, rank, interpret, or promote
  checkpoint content into any durable memory. It only moves files (Constitution Principle III).

#### Recovery workflow (agent-driven, documentation/instructions)

- **FR-009**: The project MUST provide a portable, bounded recovery procedure that directs an
  agent to: detect pending checkpoints, read headers/summaries before full raw content, extract
  only durable items (goals, decisions, current state, next actions, blockers, changed files,
  important realizations), update durable memory only with still-relevant information, and then
  invoke the mechanical archive operation on the processed files.
- **FR-010**: The recovery procedure MUST instruct the agent never to bulk-copy raw transcript
  content into durable memory and to treat checkpoint files as raw evidence, not curated memory.
- **FR-011**: The recovery procedure MUST ensure processed files are archived even when no durable
  memory update was warranted, so the pending count reflects only outstanding work.
- **FR-012**: The existing manual description of recovery in the project workflow documentation
  MUST be formalized/reconciled with this feature so there is a single authoritative description
  (no duplicated or conflicting recovery instructions).
- **FR-013**: The decision-making about what is "durable" MUST remain the agent's/consuming
  project's responsibility; the workflow text MUST NOT be encoded as automatic curation code.

#### Adapter surface & discipline

- **FR-014**: The Claude Code adapter MUST surface the archive capability through the existing thin
  bridge to the shared core, duplicating zero checkpoint move/prune logic (Constitution
  Principle I), mirroring how capture/status are wired today.
- **FR-015**: The add-an-agent documentation and the per-agent capability mapping table MUST be
  updated to describe how recovery/archive is surfaced and any per-agent capability gaps.
- **FR-016**: The feature MUST preserve functional parity with the pi reference's recovery
  behavior; any intentional deviation MUST be documented and justified, not introduced silently.

### Key Entities *(include if feature involves data)*

- **Checkpoint file**: A single raw end-of-session evidence file (Markdown) living first in the
  pending directory and, once processed, in the archive directory. Identified by file name.
- **Pending directory**: The configured location holding checkpoints awaiting review. Its count is
  the signal surfaced at session start.
- **Archive directory**: The configured location holding reviewed/processed checkpoints, subject to
  size-limit pruning.
- **Archive result**: The structured outcome of the mechanical operation — files moved, files
  skipped (with reason), errors, and pruning effect.
- **Durable memory**: The consuming project's long-lived context (e.g., STATE.md / memory files)
  into which the agent — never the code — promotes still-relevant items during recovery.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After recovery completes, the pending directory contains zero processed checkpoint
  files and every processed file is present exactly once in the archive directory (no loss, no
  duplication).
- **SC-002**: The archive directory never exceeds the configured maximum after an archive
  operation, in 100% of runs.
- **SC-003**: Archiving a batch where some named files are missing still archives 100% of the
  valid files and reports 100% of the missing ones.
- **SC-004**: Re-running the archive operation on an already-archived set changes nothing and loses
  no files (idempotent in 100% of repeats).
- **SC-005**: Across repeated recovery cycles, the pending count at session start reflects only
  unprocessed checkpoints, so a developer can trust it as the "needs attention" signal.
- **SC-006**: The Claude Code adapter contains zero duplicated checkpoint move/prune logic
  (the capability is reached only through the shared core).
- **SC-007**: The codebase has a single authoritative recovery procedure (no conflicting copies
  across documentation).

## Assumptions

- **Curation stays out of code**: Per Constitution Principle III, the only code deliverable is the
  mechanical file move + existing prune; extracting durable bits is the agent's judgment, delivered
  as instructions/workflow, never as automatic summarization code.
- **No new diverging slash command**: To honor the fixed four-command surface (Principle II) and
  parity with the pi reference (where recovery is a workflow, not a command), recovery is delivered
  as a portable workflow (automatic at session start per existing project workflow docs, and
  triggerable on demand by asking the agent) plus the mechanical archive op exposed via the
  existing bridge — not as a fifth user-facing checkpoint command. Adding such a command later, if
  needed, is treated as a separate decision.
- **The agent supplies the file list**: The mechanical archive op acts on an explicit set of file
  names chosen by the agent during recovery; it does not decide on its own which pending files are
  "done." This keeps the move dumb and the judgment with the agent.
- **Filenames are unique timestamps**: Checkpoint filenames produced by the core are timestamp-based
  and effectively unique; collision handling is a safety net, not the normal path.
- **Platform**: Linux is the supported/validated platform, consistent with the core's stated scope.
- **Reuses existing config & dirs**: The feature relies on the existing `.checkpoint.json` config,
  the existing pending/archive directories, and the core's existing detect-project and prune logic;
  it introduces no new configuration surface.
