# Per-Agent Mapping Table (Principle V)

The documented record of how each agent satisfies the shared surface, including capability gaps.
This entry covers the Claude Code adapter; other rows are added as adapters land.

## Claude Code

| Capability | Mechanism | Status |
| --- | --- | --- |
| `/checkpoint` (manual capture) | Markdown slash command → bridge `manual` | ✅ |
| `/checkpoint-optin` | Markdown slash command → bridge `optin` | ✅ |
| `/checkpoint-disable` | Markdown slash command → bridge `disable` | ✅ |
| `/checkpoint-status` | Markdown slash command → bridge `status` | ✅ |
| Auto-capture on session end | `SessionEnd` hook → `capture(reason:"shutdown")` | ✅ |
| Auto-capture before context loss | `PreCompact` hook → `capture(reason:"reload")` | ✅ (reload-gated) |
| Start-of-session pending notice | `SessionStart` hook → `sessionStart()` | ✅ |
| Capture on hard kill (`kill -9`/crash) | — | ❌ Gap: no hook fires on hard kill; inherent and shared with the reference. Not worked around. |

## Reason mapping vs. reference

| Reason | pi (`reference/checkpoint.ts`) | Claude Code |
| --- | --- | --- |
| `manual` | `/checkpoint` command | `/checkpoint` command |
| `shutdown` | `session_shutdown` (default) | `SessionEnd` hook |
| `reload` | `session_shutdown` reason `reload`, gated by `includeReload` | `PreCompact` hook, gated by `includeReload` |

## Naming note (intentional, not a regression)

The reference extension registers the enable command as `checkpoint-enable`. The canonical
cross-agent surface (Constitution Principle II) names it `/checkpoint-optin`. The Claude Code
adapter therefore uses `/checkpoint-optin`; this is a deliberate, documented rename of the
reference's `checkpoint-enable`, not a parity divergence in behavior (FR-009). The pi adapter (004)
will adopt the same canonical name.

## Add-an-agent checklist status (for this adapter)

- [x] Identify the agent's extension surface (plugin: commands + `hooks.json` + bundled scripts).
- [x] Write the adapter (`adapters/claude-code/`).
- [ ] Wire install (symlink/copy into Claude's plugin dir) — deferred to feature 006; pointer documented in README.
- [x] Update this mapping table.
- [~] Smoke-test: bridge/core path exercised (quickstart "Bridge smoke test"); in-TUI slash-command path pending a live Claude Code install (see tasks T031).
