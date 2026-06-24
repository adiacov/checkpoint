# Contract: `archive` core capability + adapter subcommand

## Core API

```ts
export async function archive(
  cwd: string,
  names?: string[],
  deps?: CoreDeps,
): Promise<ArchiveResult>;
```

- **`cwd`**: working directory; the project root and config are resolved via `detectProject` (git
  toplevel or `cwd`), exactly like the other capabilities.
- **`names`**: optional explicit list of checkpoint filenames (basenames, not paths) to archive.
  When omitted or empty, all current pending `*.md` files are archived.
- **`deps`**: standard `CoreDeps`; only `runGit` (root resolution) and `now` (unused here) are
  relevant. `entries` is not used.
- **Returns**: `ArchiveResult` (see data-model.md). Never throws on normal operation; real IO errors
  are captured per-file in `errors`.

### Behavioral contract

| # | Given | When | Then |
|---|-------|------|------|
| C1 | two pending files `a.md`, `b.md` | `archive(cwd, ["a.md","b.md"])` | both in archive, none in pending, `moved=["a.md","b.md"]`, prune applied |
| C2 | only `a.md` exists | `archive(cwd, ["a.md","ghost.md"])` | `a.md` moved; `skipped` has `{name:"ghost.md", reason:"not-found"}` |
| C3 | archive already at `maxArchivedCheckpoints` | archive new file(s) | oldest archived pruned; `prunedCount > 0`; archive count ≤ max |
| C4 | `a.md` already in archive | `archive(cwd, ["a.md"])` | `skipped` has `{name:"a.md", reason:"already-archived"}`; nothing overwritten; no loss |
| C5 | pending has `a.md`,`b.md`,`.gitkeep` | `archive(cwd)` (all-mode) | `a.md`,`b.md` moved; `.gitkeep` untouched (not in result or `not-checkpoint` if named) |
| C6 | explicit name `.gitkeep` | `archive(cwd, [".gitkeep"])` | `skipped` `{reason:"not-checkpoint"}`; `.gitkeep` untouched |
| C7 | project not configured | `archive(cwd)` | empty result, no throw |
| C8 | pending dir absent | `archive(cwd)` | empty result, no throw |
| C9 | re-run after a successful archive | `archive(cwd, sameNames)` | no-op (all `already-archived`/`not-found`), no loss (idempotent) |
| C10 | any input | always | the op never reads checkpoint file *content* (only listings + moves) |

## Adapter subcommand (Claude Code)

The recovery workflow invokes the bridge CLI:

```bash
node "$CLAUDE_PLUGIN_ROOT/dist/index.js" archive [name1 name2 ...] "<cwd>"
```

- **Subcommand**: `archive`. Positional args are zero or more checkpoint filenames followed by the
  `cwd` (last arg), consistent with how other manual subcommands take `cwd` as the trailing arg.
  When only `cwd` is given, all pending checkpoints are archived.
- **Dispatch**: `index.ts` → `runArchive(cwd, names)` → `archive(cwd, names)` in the core →
  `formatArchive(result, cwd)` for human-readable output. **No move/prune logic in the adapter.**
- **Not a slash command**: there is no `commands/checkpoint-archive.md`. The four-command surface is
  unchanged (Constitution Principle II). This is an internal subcommand the workflow calls.
- **Exit code**: non-lifecycle; may surface exit 1 on a top-level error like `manual`/`status`. It
  does not need to be exit-0-safe (it is not wired to a lifecycle hook).

### Output formatting contract

| Result | Rendered text (example) |
|--------|-------------------------|
| moved 2, pruned 0 | `Archived 2 checkpoint(s) to sessions/archive.` |
| moved 1, skipped 1 not-found | `Archived 1 checkpoint(s) to sessions/archive. Skipped: ghost.md (not-found).` |
| nothing to do (empty pending) | `No pending checkpoints to archive.` |
| not configured | `Checkpointing is not configured here. Run /checkpoint-optin.` |
| pruned > 0 | append `Pruned N old archived checkpoint(s).` |
| errors present | append `Errors: <name> (<message>).` |

(Exact wording may be refined in implementation; the contract is that moved/skipped/errors/prune are
all surfaced and a checkpoint is never silently dropped.)
