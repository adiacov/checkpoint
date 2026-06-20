# Data Model: Shared Checkpoint Core

**Feature**: 001-shared-core | **Date**: 2026-06-20

All entities are in-memory TypeScript types plus their on-disk representations. There is no
database; persistence is filesystem files. Field defaults and validation are ported from the
reference `normalizeConfig`.

## CheckpointConfig

The per-project opt-in and tuning record. Persisted as `.checkpoint.json` (JSON, tab-indented)
at the git root; legacy read path is `.pi/checkpoint.json`.

| Field | Type | Default | Validation |
|---|---|---|---|
| `version` | `1` | `1` | Always coerced to `1` |
| `enabled` | boolean | `true` (on opt-in) | Strict: only `true` counts as enabled (`config.enabled === true`) |
| `pendingDir` | string | `sessions/pending` | Relative only; absolute or containing `..` → default |
| `archiveDir` | string | `sessions/archive` | Relative only; absolute or containing `..` → default |
| `includeReload` | boolean | `false` | Strict `=== true` |
| `skipEmptySessions` | boolean | `true` | `!== false` (defaults true when unset) |
| `maxArchivedCheckpoints` | number | `50` | Positive integer or default |
| `recentEntries` | number | `24` | Positive integer or default |
| `maxTextPerEntry` | number | `4000` | Positive integer or default |
| `dedupWindowSeconds` | number | `20` | Positive integer or default (was a module constant in the reference; surfaced as config for testability) |
| `createdAt` | string (ISO) | now on first write | Preserved across re-enables |
| `updatedAt` | string (ISO) | now on each write | Set on every config write |

**State transitions**: `absent → enabled` (opt-in), `enabled ⇄ disabled` (disable / re-enable;
only `enabled` and `updatedAt` change), config never auto-deleted by the core.

## ProjectContext

Resolved per call; not persisted.

| Field | Type | Notes |
|---|---|---|
| `cwd` | string | Caller's working directory |
| `root` | string | Git root via `git rev-parse --show-toplevel`, else `cwd` |
| `configPath` | string | `${root}/.checkpoint.json` |
| `config` | CheckpointConfig \| undefined | Loaded + normalized, or undefined if no config file |

## ConversationEntry (caller-supplied, normalized by core)

The adapter extracts these from its own transcript and hands them to the core; the core does
not read any agent transcript itself.

| Field | Type | Notes |
|---|---|---|
| `role` | string | e.g. `user`, `assistant`, `bashExecution`; `unknown` fallback |
| `timestamp` | string (ISO) \| undefined | Per-entry time |
| `content` | string \| ContentBlock[] \| object | String, block array, or arbitrary object (stringified) |

**ContentBlock** (when `content` is an array): `{ type: "text", text }`,
`{ type: "thinking" }` → `[thinking omitted]`, `{ type: "toolCall", name, arguments }` →
`[tool call: name] {json}`, `{ type: "image" }` → `[image omitted]`, else `[<type>]`.

**Derived for output**: each entry renders to `messageToText` then `truncate(text,
maxTextPerEntry)`; empty text → `[no text content]`. Only the last `recentEntries` are
included; a real user message = role `user` with non-empty text (drives skip-empty).

## GitFacts

Point-in-time repository snapshot embedded in a checkpoint; not persisted separately.

| Field | Source command | Fallback |
|---|---|---|
| `branch` | `git branch --show-current` | `unknown` |
| `status` | `git status --short` | `clean` (empty) / `git status unavailable` (error) |
| `diffStat` | `git diff --stat` | `none` |
| `recentCommits` | `git log --oneline -5` | `none` |

Non-repo or non-zero exit degrades each field to its fallback rather than failing capture.

## Checkpoint (output artifact)

One markdown file written to `pending/`. Filename:
`${ISO.replace(/[:.]/g,'-')}-${safeReason}.md`, de-duplicated with a numeric suffix on
collision. Body sections (in order): title, header lines (Time, Reason, Project root, CWD,
Session file), `## Integration note`, `## Git facts`, `## Recent conversation`.

## Stores (filesystem)

| Store | Path | Owner of writes |
|---|---|---|
| Pending | `${root}/${pendingDir}/*.md` + `.gitkeep` | Core writes checkpoints here |
| Archive | `${root}/${archiveDir}/*.md` + `.gitkeep` | Recovery workflow moves files in; **core only prunes** |
| Config | `${root}/.checkpoint.json` | Core (opt-in/disable) |
| Ignore | `${root}/.gitignore` | Core appends `pendingDir/*.md`, `archiveDir/*.md` rules idempotently |

**Prune rule**: list `archiveDir/*.md` sorted lexicographically; if count >
`maxArchivedCheckpoints`, unlink the oldest excess (best-effort; prune failure never fails
capture).

## Result types (returned to callers)

- `CaptureResult`: `{ written: boolean; filePath?: string; skippedReason?: "disabled" |
  "empty-session" | "reload" | "duplicate"; error?: string }`
- `OptInResult`: `{ configPath; pendingDir; archiveDir; addedIgnoreRules: string[] }`
- `StatusResult`: `{ configured: boolean; enabled: boolean; pendingDir; archiveDir;
  pendingCount: number; archivedCount: number }`
- `SessionStartResult`: `{ pendingCount: number; prunedCount: number }`
