# Contract: Commands & Hooks → Core

The adapter's external surface. Every row delegates to `@checkpoint/core`; the adapter adds no
checkpoint logic. "Core call" uses the signatures in `core/README.md`.

## Slash commands (the four-command surface — Principle II)

| Command | Core call | Success output | Skip / error output |
| --- | --- | --- | --- |
| `/checkpoint` | `capture(cwd, "manual", { entries, sessionFile })` | `Checkpoint written: <relative path>` | disabled → `Checkpointing is disabled here. Run /checkpoint-optin first.`; not-configured → same opt-in guidance; empty → `Skipped: empty session`; error → `Checkpoint failed: <msg>` |
| `/checkpoint-optin` | `optIn(cwd)` | reports config path, dirs created, ignore rules added; safe to re-run | error → surfaced |
| `/checkpoint-disable` | `disable(cwd)` | `Checkpointing disabled (config kept).` | error → surfaced |
| `/checkpoint-status` | `status(cwd)` | configured?, enabled?, pending count, archived count, dirs | error → surfaced |

Command names, semantics, and output MUST match the pi reference and any other adapter. No extra
commands, no renames.

## Lifecycle hooks (`hooks/hooks.json`)

| Event (matcher) | Bridge subcommand | Core call | Notes |
| --- | --- | --- | --- |
| `SessionStart` (all sources) | `session-start` | `sessionStart(cwd)` | Print pending notice only if enabled + UI present + `pendingCount > 0` |
| `SessionEnd` (all reasons) | `session-end` | `capture(cwd, "shutdown", deps)` | Silent no-op if not opted in / disabled / empty / duplicate (core-decided) |
| `PreCompact` (manual + auto) | `pre-compact` | `capture(cwd, "reload", deps)` | Core suppresses when `includeReload:false` (returns `skippedReason:"reload"`) |

Hook command form (exec form, path via `${CLAUDE_PLUGIN_ROOT}`):

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js", "session-start"] }] }],
    "SessionEnd":   [{ "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js", "session-end"] }] }],
    "PreCompact":   [{ "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js", "pre-compact"] }] }]
  }
}
```

## Bridge I/O contract

- **Hook subcommands** (`session-start`, `session-end`, `pre-compact`): read the hook JSON from
  **stdin**; use `cwd` and (for capture) `transcript_path`. Read + translate the transcript
  (data-model.md) into `entries`. Always exit `0`; never block. Print human-readable result to
  stdout (becomes session context for SessionStart).
- **Command subcommands** (`manual`, `optin`, `disable`, `status`): receive `cwd` as an argument
  (the slash command passes it); `manual` resolves the newest project transcript for that `cwd`.
- **Failure policy**: a core error is reported (FR-008), never swallowed; lifecycle subcommands
  still exit `0` so they cannot break the session.

## Invariants (testable)

- C1. Exactly four commands declared; names match the surface above.
- C2. Exactly three hooks declared, mapped to reasons `shutdown` / `reload` and `sessionStart`.
- C3. No source file under `adapters/claude-code/src/` imports git, writes checkpoint markdown,
  computes dedup/prune/skip-empty, or reads/writes `.checkpoint.json` — all via the core.
