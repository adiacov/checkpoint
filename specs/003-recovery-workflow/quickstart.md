# Quickstart / Validation: Recovery / Integration Workflow

Runnable scenarios that prove the feature works end to end. See
[contracts/core-archive.md](./contracts/core-archive.md) and [data-model.md](./data-model.md) for
the full contract; this guide is the validation path, not implementation detail.

## Prerequisites

- Node.js (ESM), repo checked out on branch `003-recovery-workflow`.
- `core/` and `adapters/claude-code/` build (`npm run build` in each) and tests pass.

## 1. Core unit/integration (deterministic, no network)

```bash
cd core
npm run lint && npm run build && npm test
```

Expect the new `archive` cases to pass (store + api): move, batch-with-missing, prune-on-archive,
collision skip (already-archived), all-mode ignores `.gitkeep`, not-configured/absent-dir no-op,
idempotent re-run, and the "never reads file content" assertion.

## 2. Adapter contract test

```bash
cd adapters/claude-code
npm run lint && npm run build && npm test
```

Expect the contract test to confirm the `archive` subcommand delegates to the core and the adapter
reimplements no move/prune logic.

## 3. Bridge smoke (end to end against the core)

From a scratch temp project that has opted in and has pending checkpoints:

```bash
# opt in + create a couple of pending checkpoints first (via /checkpoint or capture)
node adapters/claude-code/dist/index.js status "$PWD"     # shows Pending: N
node adapters/claude-code/dist/index.js archive "$PWD"    # archive all pending
node adapters/claude-code/dist/index.js status "$PWD"     # Pending: 0, Archived: N
```

Expected: after `archive`, `sessions/pending/` holds only `.gitkeep`, every checkpoint is in
`sessions/archive/`, and the archive count never exceeds `maxArchivedCheckpoints`.

Targeted archive:

```bash
node adapters/claude-code/dist/index.js archive 2026-06-24T...-manual.md "$PWD"
```

Expected: only the named file is moved; others remain pending; a missing name is reported as skipped.

## 4. Workflow validation (agent-driven)

In a project with pending checkpoints, follow `WORKFLOWS.md` recovery:

1. Read pending headers/summaries first.
2. Extract only durable bits into `STATE.md` / durable memory (still-relevant only).
3. Run the `archive` op on the processed files.

Validate (maps to Success Criteria):

- **SC-001/SC-005**: `pending/` has zero processed files; each is in `archive/` exactly once; the
  next session's pending notice reflects only outstanding work.
- **SC-002**: archive count ≤ configured max.
- **SC-003**: a batch with some missing names archives all valid ones and reports the missing ones.
- **SC-004**: re-running archive changes nothing, loses nothing.
- **SC-006**: grep the adapter for move/prune logic — none (all via the core).
- **SC-007**: `WORKFLOWS.md` is the single recovery description (no conflicting copies).
