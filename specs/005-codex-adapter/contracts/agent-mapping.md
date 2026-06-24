# Per-Agent Mapping Table (Principle V) — Codex

The documented record of how the Codex agent satisfies the shared surface, including capability
gaps. The Claude Code row lives in `specs/002-claude-code-adapter/contracts/agent-mapping.md` and the
pi row in `specs/004-pi-adapter/contracts/agent-mapping.md`; this file adds the Codex row.

## Codex

| Capability | Mechanism | Status |
| --- | --- | --- |
| `/checkpoint` (manual capture) | `prompts/checkpoint.md` → agent runs bridge `manual` → `capture(reason:"manual")` | ✅ (best-effort: depends on the agent running the bridge) |
| `/checkpoint-optin` | `prompts/checkpoint-optin.md` → bridge `optin` → `optIn` | ✅ (best-effort) |
| `/checkpoint-disable` | `prompts/checkpoint-disable.md` → bridge `disable` → `disable` | ✅ (best-effort) |
| `/checkpoint-status` | `prompts/checkpoint-status.md` → bridge `status` → `status` | ✅ (best-effort) |
| Auto-capture during session | `config.toml notify` on `agent-turn-complete` → `capture(reason:"turn-complete")` | ⚠️ Best-effort: per-turn proxy (no session-end event), dedup-bounded; may accrue multiple pending over a long session. |
| Start-of-session pending notice | — | ❌ Gap: Codex emits no session-start event. `/checkpoint-status` surfaces the pending count on demand. |
| Auto-capture on true session end | — | ❌ Gap: no session-end event; `turn-complete` is the closest proxy. |
| Auto-capture before context loss (reload) | — | ❌ Gap: no pre-compaction event. |
| Capture on hard kill (`kill -9`/crash) | — | ❌ Gap: inherent, shared with all adapters. |

## Reason mapping vs. reference

| Reason | pi (`reference/checkpoint.ts`) | Codex |
| --- | --- | --- |
| `manual` | `/checkpoint` command | `/checkpoint` prompt → bridge `manual` |
| `shutdown` | `session_shutdown` (default) | — (no event) |
| `reload` | `session_shutdown` reason `reload` | — (no event) |
| `turn-complete` | — | `notify` on `agent-turn-complete` (Codex-only best-effort capture) |

## Best-effort & deprecation caveats (intentional, documented)

- **Prompt-only commands**: Codex custom prompts are prompt *expansions*, not code. A command works
  only if the agent follows the instruction and has shell access — inherently best-effort.
- **Custom-prompts deprecation**: OpenAI deprecates custom prompts in favor of skills, with observed
  version churn in the prompts directory. The adapter uses prompts for v1; skills are a future
  migration path and would invoke the same bridge (no logic change).
- **Per-turn auto-capture**: `agent-turn-complete` is the only automation event, so capture is
  approximated per turn and bounded by the core's dedup window. Recommend a larger
  `dedupWindowSeconds` for Codex projects; the recovery/archive workflow handles accumulated pending.

These gaps are recorded, not emulated with divergent behavior (Principle II's "genuinely impossible"
clause + Principle IV).

## Difference from the other adapters (intentional)

- **Bridge pattern, like Claude Code** (compiled CLI invoked externally), not pi's in-process model.
- **Single automation event**: `notify`/`agent-turn-complete` only — versus Claude Code's
  Start/End/PreCompact hooks and pi's `session_start`/`session_shutdown`.
- **Prompt-expansion commands**: versus Claude Code's executable slash commands and pi's
  `registerCommand`.

## Add-an-agent checklist status (for this adapter)

- [x] Identify the agent's extension surface (custom prompts + `notify` program; bridge CLI).
- [x] Write the adapter (`adapters/codex/`).
- [ ] Wire install (prompts → `~/.codex/prompts/`, `notify` → `~/.codex/config.toml`, bridge path) —
  deferred to feature 006; pointer documented in README + `config.example.toml`.
- [x] Update this mapping table.
- [~] Smoke-test: bridge/core path exercised via unit/contract tests + a scripted bridge smoke test
  (`tests/smoke.test.ts`, all green); in-Codex prompt-driven run pending a live Codex install
  (feature 006).
