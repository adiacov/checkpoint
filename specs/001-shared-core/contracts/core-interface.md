# Contract: Shared Checkpoint Core Interface

**Feature**: 001-shared-core | **Date**: 2026-06-20

This is the stable seam every agent adapter calls (Constitution Principle V, FR-014). It is a
Node/TS module interface, not a network API. Adapters provide the two agent-specific inputs
(git runner + conversation entries) and invoke the five user-facing capabilities (optIn,
disable, status, sessionStart, capture), plus the `detectProject` resolver they share. No
adapter reimplements any logic behind this surface.

## Injected dependencies

```ts
/** Runs a command and returns its exit code and captured output. */
export type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** A conversation message already extracted from the agent's transcript. */
export interface ConversationEntry {
  role: string;
  timestamp?: string;
  content: string | ContentBlock[] | Record<string, unknown>;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking" }
  | { type: "toolCall"; name: string; arguments?: unknown }
  | { type: "image" }
  | { type: string; [k: string]: unknown };

/** Everything the core needs that is agent-specific, supplied by the adapter. */
export interface CoreDeps {
  /** Defaults to a node:child_process runner if omitted. */
  runGit?: CommandRunner;
  /** Used by capture only; absent for optIn/disable/status/sessionStart. */
  entries?: ConversationEntry[];
  /** The "Session file" header value; adapter-specific, optional. */
  sessionFile?: string;
  /** Override the clock for tests. Defaults to Date.now / new Date(). */
  now?: () => Date;
}
```

## Capabilities

```ts
export interface CheckpointCore {
  /**
   * Resolve project root + config for a working directory.
   * root = git toplevel or cwd; config = normalized .checkpoint.json
   * (or legacy .pi/checkpoint.json) or undefined if not configured.
   */
  detectProject(cwd: string, deps?: CoreDeps): Promise<ProjectContext>;

  /**
   * Opt a project in: write .checkpoint.json (enabled=true, defaults applied),
   * create pending/archive dirs + .gitkeep, append .gitignore rules idempotently.
   * Returns the resolved paths and which ignore rules were newly added.
   * FR-008, FR-009, FR-010.
   */
  optIn(cwd: string, deps?: CoreDeps): Promise<OptInResult>;

  /**
   * Set enabled=false (and updatedAt). Dirs, ignore rules, and existing
   * checkpoints are left intact. No-op note if not configured. FR-017.
   */
  disable(cwd: string, deps?: CoreDeps): Promise<{ disabled: boolean; configPath: string }>;

  /**
   * Report enabled state, resolved pending/archive dirs, and pending/archived
   * counts. FR-018.
   */
  status(cwd: string, deps?: CoreDeps): Promise<StatusResult>;

  /**
   * Session-start routine: prune archive to maxArchivedCheckpoints (oldest first)
   * and return the pending count. Never moves pending→archive. FR-012, FR-013.
   */
  sessionStart(cwd: string, deps?: CoreDeps): Promise<SessionStartResult>;

  /**
   * Capture a checkpoint. Guards in order: not configured/disabled → skip;
   * reason==="reload" && !includeReload → skip; skipEmptySessions && no real
   * user message → skip; duplicate within dedup window (newest pending mtime) →
   * skip. Otherwise write the markdown checkpoint to pending/ and return its path.
   * Requires deps.entries. FR-001..FR-007, FR-011, FR-016.
   */
  capture(cwd: string, reason: string, deps: CoreDeps): Promise<CaptureResult>;
}
```

## Result contracts

```ts
export interface CaptureResult {
  written: boolean;
  filePath?: string;                // present iff written
  skippedReason?: "not-configured" | "disabled" | "empty-session" | "reload" | "duplicate";
  error?: string;                   // present iff a write/IO failure occurred (FR-016)
}

export interface OptInResult {
  configPath: string;
  pendingDir: string;
  archiveDir: string;
  addedIgnoreRules: string[];       // [] if rules already present
}

export interface StatusResult {
  configured: boolean;
  enabled: boolean;
  pendingDir: string;
  archiveDir: string;
  pendingCount: number;
  archivedCount: number;
}

export interface SessionStartResult {
  pendingCount: number;
  prunedCount: number;
}

export interface ProjectContext {
  cwd: string;
  root: string;
  configPath: string;
  config?: CheckpointConfig;        // see data-model.md
}
```

## Behavioral guarantees (testable)

1. **Agent-neutral**: importing this module pulls in no agent SDK (verified by dependency
   inspection / no `pi`/`@anthropic`/codex imports).
2. **Capture is guarded**: every skip path returns `written:false` with a `skippedReason`; no
   exceptions for normal skips. IO failures return `error` set, never a silent drop (FR-016).
3. **Idempotent opt-in**: calling `optIn` twice adds no duplicate ignore rules and preserves
   `createdAt`.
4. **Bounded output**: a captured file contains ≤ `recentEntries` entries, each ≤
   `maxTextPerEntry` chars (+ truncation marker).
5. **Stateless dedup**: two `capture` calls within `dedupWindowSeconds` (by newest pending
   mtime) → the second returns `skippedReason:"duplicate"`, independent of process identity.
6. **Archive bound**: after `sessionStart`, `archiveDir` holds ≤ `maxArchivedCheckpoints`
   files; `prunedCount` reports how many were removed.
7. **Non-repo safe**: `capture` in a non-git dir still writes a checkpoint with git facts
   degraded to fallbacks.
