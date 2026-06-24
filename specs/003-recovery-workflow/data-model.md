# Phase 1 Data Model: Recovery / Integration Workflow

No persisted schema changes. The feature reuses the existing `.checkpoint.json` config and the
existing pending/archive directories. The only new artifact is an in-memory result type.

## New type: `ArchiveResult`

Returned by the core `archive` capability. Non-throwing; every file is accounted for in exactly one
of `moved` / `skipped` / `errors`.

| Field         | Type                               | Meaning                                                              |
| ------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `moved`       | `string[]`                         | Filenames successfully moved pending → archive.                     |
| `skipped`     | `ArchiveSkip[]`                    | Files not moved for a benign reason (see reasons below).            |
| `errors`      | `ArchiveError[]`                   | Files that hit a real IO error during the move.                     |
| `prunedCount` | `number`                           | Files removed by the post-move archive prune (`maxArchivedCheckpoints`). |

### `ArchiveSkip`

| Field    | Type                                                         | Meaning                                         |
| -------- | ----------------------------------------------------------- | ----------------------------------------------- |
| `name`   | `string`                                                    | The filename that was skipped.                  |
| `reason` | `"not-found" \| "already-archived" \| "not-checkpoint"`     | Why it was skipped.                             |

- `not-found`: named file is not present in the pending directory.
- `already-archived`: a same-named file already exists in the archive (collision-safe no-op, D3).
- `not-checkpoint`: an explicitly named file that is not a `*.md` checkpoint (e.g. `.gitkeep`).

### `ArchiveError`

| Field   | Type     | Meaning                                       |
| ------- | -------- | --------------------------------------------- |
| `name`  | `string` | The filename whose move failed.               |
| `error` | `string` | The error message (never a thrown exception). |

### Guard / benign-result behavior

- **Not configured / not opted in**: `archive` returns `{ moved: [], skipped: [], errors: [], prunedCount: 0 }` (no throw). The adapter renders a "not configured" message.
- **Pending directory absent**: behaves like an empty pending directory — nothing to move, returns the empty result.
- **Empty pending / empty name list with nothing to do**: empty result, `prunedCount` may still be `0`.

## Existing entities (unchanged, referenced)

- **`CheckpointConfig`** — provides `pendingDir`, `archiveDir`, `maxArchivedCheckpoints`. No new
  fields (no new config surface).
- **`ProjectContext`** — resolved by `detectProject`; `archive` builds on it like every other
  capability.
- **Checkpoint file** — a `*.md` file; identified by filename; lives in pending, then archive.

## Invariants

1. Every input filename appears in exactly one of `moved`, `skipped`, or `errors` (or, in all-mode,
   every pending `*.md` discovered does).
2. A file is never present in neither pending nor archive after the operation (no loss — FR-006).
3. A file is never silently overwritten in the archive (D3).
4. `archive` never reads checkpoint file *content* — only directory listings and file moves
   (Principle III, FR-008).
5. After the operation, `countCheckpointFiles(archiveDir) <= maxArchivedCheckpoints` (FR-005).
