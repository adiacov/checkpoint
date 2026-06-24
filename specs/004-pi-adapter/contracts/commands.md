# Contract: Commands & Lifecycle → Core (pi)

The adapter's external surface. Every row delegates to `@checkpoint/core`; the adapter adds no
checkpoint logic. "Core call" uses the signatures in `core/src/api.ts`. Handlers are registered
in-process via pi's `ExtensionAPI` (`pi.registerCommand`, `pi.on`) — there is no out-of-process
bridge, no markdown command files, and no `hooks.json`.

## Commands (the four-command surface — Principle II)

Registered with `pi.registerCommand(name, { description, handler })`. `ctx` provides `cwd`,
`hasUI`, `ui.notify`, and `sessionManager`.

| Command | Core call | Success output | Skip / error output |
| --- | --- | --- | --- |
| `checkpoint` | `capture(cwd, "manual", { entries, sessionFile, runGit })` | `Checkpoint written: <relative path>` | not-configured/disabled → `Checkpointing is disabled here. Run /checkpoint-optin first.`; empty → `Skipped: empty session`; duplicate → `Skipped: duplicate of a recent checkpoint`; error → `Checkpoint failed: <msg>` |
| `checkpoint-optin` | `optIn(cwd)` | reports config path, dirs created, ignore rules added; safe to re-run | error → surfaced via `notify(…, "error")` |
| `checkpoint-disable` | `disable(cwd)` | `Checkpointing disabled (config kept; re-enable with /checkpoint-optin).` | not-configured → still a safe no-op message; error → surfaced |
| `checkpoint-status` | `status(cwd)` | configured?, enabled?, pending count, archived count, dirs | not-configured → opt-in guidance; error → surfaced |

Command names, semantics, and output MUST match the pi reference's *behavior* and the Claude Code
adapter. The enable command is named `checkpoint-optin` (canonical, Principle II) — a documented
rename of the reference's `checkpoint-enable`, behavior unchanged. No extra commands.

The manual `checkpoint` command resolves its `entries` by translating the live
`ctx.sessionManager` (data-model.md), not a transcript file.

## Lifecycle handlers (`pi.on(...)`)

| Event | Core call | Notes |
| --- | --- | --- |
| `session_start` | `sessionStart(cwd)` | Prune archive + count pending. Notify the pending count only when configured + enabled + `hasUI` + `pendingCount > 0`. Wrapped in try/catch; a failure notifies an error, never throws. |
| `session_shutdown` | `capture(cwd, event.reason ?? "shutdown", { entries, sessionFile, runGit })` | Reason passed straight through so the core gates `reload` via `includeReload`. Core decides not-configured / disabled / empty / duplicate. Wrapped in try/catch; success notifies the written path when `hasUI`. |

The adapter performs **no** gating itself (no `includeReload`, skip-empty, dedup, configured/enabled,
or prune checks) — all are the core's, matching the guard order in `api.ts`.

## Reason mapping vs. reference

| Reason | pi reference (`reference/checkpoint.ts`) | pi adapter (this feature) |
| --- | --- | --- |
| `manual` | `/checkpoint` command | `checkpoint` command → `capture(…, "manual")` |
| `shutdown` | `session_shutdown` (default reason) | `session_shutdown` → `capture(…, "shutdown")` |
| `reload` | `session_shutdown` reason `reload`, gated by `includeReload` | `session_shutdown` reason `reload` → `capture(…, "reload")`, gated by the core via `includeReload` |

Identical to the reference; the only move is that gating now lives in the core, not the handler.

## Inputs / failure policy

- Lifecycle and command handlers translate the live `sessionManager` into `entries`
  (data-model.md) and pass `sessionFile` = `getSessionFile?.()` and a `runGit` wrapping `pi.exec`.
- A core error is reported via `ctx.ui.notify(…, "error")` (FR-014), never swallowed; lifecycle
  handlers catch so a checkpoint failure cannot break the pi session.

## Invariants (testable)

- C1. Exactly four commands registered; names exactly `checkpoint`, `checkpoint-optin`,
  `checkpoint-disable`, `checkpoint-status`.
- C2. Exactly two lifecycle handlers registered (`session_start`, `session_shutdown`); shutdown
  forwards `event.reason` (defaulting to `shutdown`) into `capture`.
- C3. No source file under `adapters/pi/src/` imports git, writes checkpoint markdown, computes
  dedup/prune/skip-empty, or reads/writes `.checkpoint.json` — all via the core. (Neutrality test.)
- C4. The adapter imports checkpoint behavior from `@checkpoint/core` (the only logic source).
