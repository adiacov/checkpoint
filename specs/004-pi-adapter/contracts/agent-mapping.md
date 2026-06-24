# Per-Agent Mapping Table (Principle V) — pi

The documented record of how the pi agent satisfies the shared surface, including capability gaps.
The Claude Code row lives in `specs/002-claude-code-adapter/contracts/agent-mapping.md`; this file
adds the pi row. (These per-feature tables are the living record until consolidated into a single
top-level doc.)

## pi

| Capability | Mechanism | Status |
| --- | --- | --- |
| `/checkpoint` (manual capture) | `pi.registerCommand("checkpoint")` → `capture(reason:"manual")` | ✅ |
| `/checkpoint-optin` | `pi.registerCommand("checkpoint-optin")` → `optIn` | ✅ |
| `/checkpoint-disable` | `pi.registerCommand("checkpoint-disable")` → `disable` | ✅ |
| `/checkpoint-status` | `pi.registerCommand("checkpoint-status")` → `status` | ✅ |
| Auto-capture on session end | `pi.on("session_shutdown")` → `capture(reason:"shutdown")` | ✅ |
| Auto-capture before context loss | `pi.on("session_shutdown", reason:"reload")` → `capture(reason:"reload")` | ✅ (reload-gated by the core via `includeReload`) |
| Start-of-session pending notice | `pi.on("session_start")` → `sessionStart` | ✅ |
| Capture on hard kill (`kill -9`/crash) | — | ❌ Gap: no lifecycle event fires on hard kill; inherent and shared with the reference. Not worked around. |

## Reason mapping vs. reference

| Reason | pi (`reference/checkpoint.ts`) | pi adapter (004) |
| --- | --- | --- |
| `manual` | `/checkpoint` command | `checkpoint` command |
| `shutdown` | `session_shutdown` (default) | `session_shutdown` (default) |
| `reload` | `session_shutdown` reason `reload`, gated by `includeReload` | `session_shutdown` reason `reload`, gated by the core via `includeReload` |

The mapping is identical to the reference; the only change is that the gating/skip/dedup decisions
now live in the shared core rather than inline in the handler.

## Naming note (intentional, not a regression)

The reference extension registers the enable command as `checkpoint-enable`. The canonical
cross-agent surface (Principle II) names it `checkpoint-optin`, as the Claude Code adapter does and
as the `002` mapping table anticipated for pi. This adapter therefore registers `checkpoint-optin`:
a deliberate, documented rename — behavior (write config, create dirs/ignore rules) is unchanged,
so behavioral parity (Principle IV) holds.

## Difference from the Claude Code adapter (intentional)

- **In-process, not a bridge**: pi runs extensions in-process, so there is no out-of-process Node
  bridge, no markdown command files, and no `hooks.json`. Handlers call the core directly.
- **Live transcript**: entries come from `ctx.sessionManager`, not parsed JSONL files; the manual
  command and lifecycle handlers share one translation path.
- **No `user → tool` role remap**: pi has no "tool result as a user message" convention, so the
  skip-empty translation rule the Claude adapter needs (R7) is unnecessary here.

## Add-an-agent checklist status (for this adapter)

- [x] Identify the agent's extension surface (in-process extension: `registerCommand` + `on` +
  `sessionManager` + `ui.notify` via `ExtensionAPI`).
- [x] Write the adapter (`adapters/pi/`).
- [ ] Wire install (place/symlink into `~/.pi/agent/extensions/`) — deferred to feature 006;
  pointer documented in README.
- [x] Update this mapping table.
- [~] Smoke-test: core path exercised via unit/contract tests + a scripted handler smoke test
  (`tests/smoke.test.ts`, all green); in-TUI run pending a live pi install (feature 006).
