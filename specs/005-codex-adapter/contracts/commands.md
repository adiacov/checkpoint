# Contract: Commands & Automation → Core (Codex)

The adapter's external surface. Every row delegates to `@checkpoint/core`; the adapter adds no
checkpoint logic. "Core call" uses the signatures in `core/src/api.ts`. The surface is a compiled
bridge CLI invoked by Codex's `notify` program and by the command prompts (via the agent's shell).

## Bridge subcommands (`node <bridge>/dist/index.js <sub> [args]`)

| Subcommand | Source of input | Core call | Output |
| --- | --- | --- | --- |
| `notify` | `agent-turn-complete` JSON in `argv[3]` (the single notify argument) | `capture(cwd, "turn-complete", { entries, sessionFile })` | result/skip line; **always exit 0** |
| `manual` | `cwd` arg; best-effort newest rollout for cwd | `capture(cwd, "manual", { entries, sessionFile })` | `Checkpoint written: <rel>` / opt-in guidance / skip |
| `optin` | `cwd` arg | `optIn(cwd)` | config path, dirs, ignore rules |
| `disable` | `cwd` arg | `disable(cwd)` | `Checkpointing disabled (config kept).` |
| `status` | `cwd` arg | `status(cwd)` | configured?, enabled?, pending/archived counts, dirs |
| `archive` | `[names…] <cwd>` args | `archive(cwd, names?)` | moved/skipped/pruned summary |

`notify` is the only lifecycle-class subcommand: it must never throw and always exits 0 so Codex's
notification step can never be disrupted. `manual`/`optin`/`disable`/`status`/`archive` mirror the
Claude Code bridge subcommands exactly (same delegation, same output), re-expressed here.

## Command prompts (the four-command surface — Principle II)

`prompts/<name>.md`; `name.md` → `/name` in Codex. Each is a prompt expansion that instructs the
agent to run the matching bridge subcommand via its shell tool and report the output.

| Prompt file | Slash command | Instructs the agent to run | Core call (via bridge) |
| --- | --- | --- | --- |
| `checkpoint.md` | `/checkpoint` | `node <bridge> manual "$PWD"` | `capture(…, "manual")` |
| `checkpoint-optin.md` | `/checkpoint-optin` | `node <bridge> optin "$PWD"` | `optIn` |
| `checkpoint-disable.md` | `/checkpoint-disable` | `node <bridge> disable "$PWD"` | `disable` |
| `checkpoint-status.md` | `/checkpoint-status` | `node <bridge> status "$PWD"` | `status` |

`<bridge>` is a documented placeholder path resolved at install (feature 006). Command names,
semantics, and output match the other adapters. No extra commands. The `archive` subcommand is NOT a
fifth prompt (recovery is the agent-driven workflow; surface stays the four `/checkpoint*`).

## Automatic capture wiring (`config.example.toml`)

```toml
# Add to ~/.codex/config.toml — runs the bridge on each completed turn (best-effort capture).
notify = ["node", "<bridge>/dist/index.js", "notify"]
```

Codex appends the `agent-turn-complete` JSON as the final argument; the bridge reads it from `argv`.

## Reason mapping vs. reference

| Reason | Reference (`reference/checkpoint.ts`) | Codex adapter |
| --- | --- | --- |
| `manual` | `/checkpoint` command | `/checkpoint` prompt → bridge `manual` |
| `shutdown` | `session_shutdown` | — (no session-end event; see gaps) |
| `reload` | `session_shutdown` reason `reload` | — (no pre-compact event; see gaps) |
| `turn-complete` | — (n/a) | `notify` on `agent-turn-complete` (best-effort proxy for session capture) |

## Failure policy

- `notify`: tolerant of malformed/partial JSON (no capture, no throw); always exit 0.
- Command subcommands: a core error is reported (FR-012), never swallowed; non-lifecycle subcommands
  may surface a non-zero exit, `notify` never does.

## Invariants (testable)

- C1. Exactly four prompt files exist with the canonical names.
- C2. The bridge dispatches exactly `notify | manual | optin | disable | status | archive`; `notify`
  maps to reason `turn-complete`, `manual` to `manual`.
- C3. No source file under `adapters/codex/src/` runs git, writes/moves checkpoint files, computes
  dedup/prune/skip-empty, or reads/writes `.checkpoint.json` — all via the core. (Neutrality test.)
- C4. The adapter imports checkpoint behavior from `@checkpoint/core` and declares it as the single
  runtime dependency; no `bin`/PATH binary.
