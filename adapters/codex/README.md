# Codex checkpoint adapter

The [Codex CLI](https://developers.openai.com/codex) integration for [checkpoint](../../core). It's
a thin **bridge**: a compiled Node CLI that Codex's `notify` program and the four command prompts
both invoke. It translates Codex's conversation inputs into the core's neutral format and calls
[`@checkpoint/core`](../../core) for everything else. No checkpoint logic lives here (that's the
whole point — see the [constitution](../../.specify/memory/constitution.md)).

Codex is the third planned adapter. Its extension surface is the thinnest of the three, so
automatic capture here is explicitly **best-effort** — and every gap is documented below rather than
faked.

## What it adds to Codex

**Commands** (identical surface across every agent) — Codex custom prompts in `prompts/`. Each
`name.md` becomes `/name` and instructs the agent to run the matching bridge subcommand via its
shell tool and report the output:

| Command               | Runs (bridge subcommand) | Does                                                          |
| --------------------- | ------------------------ | ------------------------------------------------------------- |
| `/checkpoint`         | `manual`                 | Write a manual checkpoint of the current session now.         |
| `/checkpoint-optin`   | `optin`                  | Opt this project in (config, `sessions/` dirs, ignore rules). |
| `/checkpoint-disable` | `disable`                | Turn checkpointing off for this project (config kept).        |
| `/checkpoint-status`  | `status`                 | Show configured/enabled state and pending/archived counts.    |

**Automatic capture** — Codex's `config.toml` `notify` program (see `config.example.toml`). Codex
runs it on every `agent-turn-complete`, passing the event JSON; the bridge writes a best-effort
checkpoint (reason `turn-complete`) for opted-in projects. The core decides
configured/enabled/skip-empty/dedup; the bridge never gates.

Opt-in is agent-neutral, so a project opted in via any other agent is recognized here too.

## Best-effort gaps (documented, not emulated)

Codex's surface forces real limits. None is worked around with divergent behavior (see
[agent mapping](../../specs/005-codex-adapter/contracts/agent-mapping.md)):

- **No start-of-session pending notice** — Codex emits no session-start event. Use
  `/checkpoint-status` to see the pending count on demand.
- **No true session-end / pre-compact event** — `agent-turn-complete` is the only automation signal,
  so auto-capture is a per-turn proxy, bounded by the core's dedup window. Over a long session
  several pending checkpoints can accrue; raise `dedupWindowSeconds` in the project's
  `.checkpoint.json` to reduce volume, and let the recovery/archive workflow clean up.
- **Prompt-only commands** — Codex custom prompts are prompt _expansions_, not code. A command works
  only if the agent follows the instruction and has shell access.
- **Custom-prompts deprecation** — OpenAI marks custom prompts deprecated in favor of skills. The
  adapter uses prompts for v1; a future skills migration would invoke the same bridge unchanged.
- **Hard kill** — no event fires on `kill -9`/crash (inherent, shared with every adapter).

## How it differs from the other adapters

- **Bridge pattern, like Claude Code** (a compiled CLI invoked externally), not pi's in-process
  model — Codex runs external programs (`notify`; and a prompt asks the agent to run a shell
  command).
- **One automation event** (`notify`/`agent-turn-complete`) versus Claude Code's
  Start/End/PreCompact hooks and pi's `session_start`/`session_shutdown`.
- **Transcript**: the `agent-turn-complete` payload (stable) for auto-capture; a best-effort read of
  the newest Codex session rollout (`~/.codex/sessions/**/rollout-*.jsonl`, version-variable) for the
  manual command, degrading to git-facts-only when unavailable.

## Recovery / archive

Reviewing pending checkpoints and promoting the durable bits is the agent-driven workflow in
[`WORKFLOWS.md`](../../WORKFLOWS.md); its mechanical close-out lives in
[`@checkpoint/core`](../../core)'s `archive()` (exposed as the bridge's `archive` subcommand). This
is deliberately **not** a fifth command — the user-facing surface stays the four `/checkpoint*`.

## Build & test

```bash
cd ../../core && npm install && npm run build   # the core must be built first
cd ../adapters/codex && npm install && npm run build
npm test        # transcript translation + contract/neutrality guard + scripted smoke test
npm run typecheck && npm run lint
```

The `notify` program and command prompts invoke `node "<BRIDGE>/dist/index.js" <subcommand>`, so
`npm run build` must have produced `dist/`.

## Install

Automated install (placing `prompts/*.md` in `~/.codex/prompts/`, adding the `notify` snippet to
`~/.codex/config.toml`, and resolving the `<BRIDGE>` path) is delivered by the install/distribution
feature (`006`). The `<BRIDGE>` placeholder in the prompts and `config.example.toml` is filled in at
install time. The repository remains the single source of truth; Codex's config dir is an install
target, never edited in place.
