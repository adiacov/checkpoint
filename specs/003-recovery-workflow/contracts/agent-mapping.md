# Per-Agent Mapping Table — Recovery / Integration (Principle V)

This is the 003 delta to the canonical mapping in
`specs/002-claude-code-adapter/contracts/agent-mapping.md`. It records how the recovery/integration
capability is surfaced per agent and any capability gaps. When 002's table is next consolidated,
fold these rows in.

## Claude Code — recovery/integration rows

| Capability | Mechanism | Status |
| --- | --- | --- |
| Archive processed checkpoints (mechanical move pending → archive) | bridge `archive` subcommand → core `archive()` | ✅ |
| Bounded recovery procedure (review → curate → archive) | `WORKFLOWS.md` agent procedure (automatic at session start + on demand) | ✅ workflow, not code |
| Promote durable bits into project memory | Agent judgment per `WORKFLOWS.md` + consuming project instructions | ✅ by design not code (Principle III) |
| Recovery as a slash command | — | ❌ Intentional gap: no fifth slash command; recovery is a workflow + internal `archive` subcommand, preserving the four-command surface (Principle II) and pi parity. Not a divergence. |

## Why `archive` is a subcommand, not a slash command

- Constitution Principle II fixes the user-facing surface at the four `/checkpoint*` commands.
- The pi reference treats recovery as a workflow (move processed files to archive), not a command —
  so a workflow + mechanical op preserves parity (Principle IV).
- The agent invokes `archive` via Bash during the `WORKFLOWS.md` recovery procedure; it is internal
  plumbing, surfaced and documented in the adapter README, not a new command users type.

## Discipline check (Principle I)

- All move + prune logic stays in `@checkpoint/core` (`store.ts` + `api.ts`). The adapter's
  `runArchive`/`formatArchive` only translate args and render the result. The neutrality/contract
  test is extended to assert no move/prune logic is reimplemented in the adapter.

## Add-an-agent note

When a future adapter (pi 004, Codex 005) lands, it surfaces recovery the same way: expose the core
`archive` op through that agent's thinnest invocation path, and point its docs at the single
authoritative `WORKFLOWS.md` recovery procedure. Capability gaps go in this table.
