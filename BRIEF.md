# Checkpoint — Project Brief / Handoff

Handoff context for the agent that will do the transition work inside the dedicated `checkpoint` repo. Read together with `PROJECT.md` (stable identity).

## Origin: the existing pi extension

The behavior already exists as a pi-coding-agent extension. Source of truth in `life-os`:

```text
projects/pi-extensions/checkpoint/checkpoint.ts   # version-controlled source (~460 lines)
projects/pi-extensions/checkpoint/README.md
```

Installed (runtime) copy on the machine:

```text
~/.pi/agent/extensions/checkpoint.ts
```

Per-project opt-in config (pi today; example from life-os):

```text
.pi/checkpoint.json
{ version, enabled, pendingDir, archiveDir, includeReload,
  skipEmptySessions, maxArchivedCheckpoints, recentEntries,
  maxTextPerEntry, createdAt, updatedAt }
```

### What the extension does

- On **session shutdown**: if enabled, not a `reload` (unless `includeReload`), session has a real user message (`skipEmptySessions`), and not a duplicate within ~20s → write a checkpoint markdown to `pendingDir`.
- Checkpoint contents: timestamp, reason, project root, cwd, session file path, an integration note, **git facts** (branch, `status --short`, `diff --stat`, `log --oneline -5`), and the **last N conversation messages** (`recentEntries`, default 24), each truncated to `maxTextPerEntry` (default 4000). Thinking blocks omitted; tool calls summarized.
- On **session start**: prune archive to `maxArchivedCheckpoints` (default 50) and notify how many pending checkpoints need review.
- Commands (typed inside the pi TUI): `/checkpoint` (manual write), `/checkpoint-enable`, `/checkpoint-disable`, `/checkpoint-status`. Enable also creates dirs, `.gitkeep`s, and `.gitignore` rules for `pendingDir/*.md` and `archiveDir/*.md`.

### The only agent-specific touchpoints

Everything else is plain Node + filesystem (portable). Agent-specific:

1. **Commands + lifecycle trigger** — `pi.registerCommand(...)`, `pi.on("session_shutdown"/"session_start")`.
2. **Conversation source** — `ctx.sessionManager.getBranch()`.
3. **Git exec** — `pi.exec(...)` (trivially replaced by direct git).

## Target: agent extensions over a shared core

Not a shell CLI. The deliverable is **per-agent extensions that expose the same in-TUI commands and run the same logic**, plus the same automatic lifecycle capture. The shared logic is written once; each agent gets a thin wrapper.

### Where the code lives

Single source of truth is the dedicated `../checkpoint` repo:

```text
../checkpoint/
  core/            # shared checkpoint logic (Node/TS) — git facts, markdown format,
                   # opt-in config, prune, skip-empty, dedup. No agent SDK.
  adapters/
    pi/            # pi extension: registerCommand + session_start/shutdown -> core
    claude/        # Claude plugin: slash commands + hooks (SessionEnd/Start/PreCompact) -> core
    codex/         # Codex: prompts (slash commands) + notify -> core
  install …        # symlink/copy each adapter into the agent's extension dir, pointing at core
```

The repo is authoritative; agent extension dirs (`~/.pi/agent/extensions/`, Claude plugin dir, `~/.codex/`) are install targets. Prefer **symlink-from-repo** so there is one true copy; a copy+sync step (like pi's current `cp`) is the fallback.

### Commands (identical across agents)

`/checkpoint`, `/checkpoint-optin` (enable), `/checkpoint-disable`, `/checkpoint-status` — all invoked from inside each agent's TUI, all calling the shared core.

### Per-agent mapping

| Concern | pi | Claude Code | Codex |
|---|---|---|---|
| Extension form | native extension | **plugin** (bundles commands + hooks) | prompts + config |
| In-TUI commands | `registerCommand` ✅ | slash commands in plugin / `.claude/commands` ✅ | `~/.codex/prompts/` ✅ |
| Auto on exit | `session_shutdown` ✅ | `SessionEnd` hook ✅ | `notify` ⚠️ best-effort |
| Startup notice | `session_start` ✅ | `SessionStart` hook ✅ (can inject context) | ⚠️ limited |
| Pre-summarization | — | `PreCompact` hook ✅ (new win) | — |
| Conversation source | `sessionManager` | `transcript_path` JSONL | transcript/log if available |
| Wiring location | extension file | `~/.claude/` plugin + `settings.json` hooks | `~/.codex/config.toml` |

Automatic capture is full on pi + Claude Code, best-effort on Codex. The command set is identical everywhere.

## Per-project opt-in config

- New file: **`.checkpoint.json`** at repo root (agent-neutral; replaces `.pi/checkpoint.json`). Read legacy `.pi/checkpoint.json` during transition.
- **Tracked in git** (opt-in + tuning travel with the repo), matching current behavior. (Open to flipping to ignored/machine-local if the user prefers.)
- Raw checkpoints git-ignored: `sessions/pending/*.md`, `sessions/archive/*.md`; `.gitkeep`s tracked. `/checkpoint-optin` sets up dirs + ignore rules.

## Decisions made (during life-os discussion)

1. **Per-agent extensions, not a shell CLI** — the surface is each agent's in-TUI commands + lifecycle. No global `checkpoint` binary on `PATH`.
2. **Shared core + thin wrappers**, core imports no agent SDK; core is authoritative in the `checkpoint` repo.
3. **Language: keep Node/TS** for the core — the existing ~460-line logic ports almost verbatim.
4. **Opt-in config → `.checkpoint.json`** at repo root, tracked in git; accept legacy `.pi/checkpoint.json` during transition.
5. **Add `PreCompact`** as an extra Claude trigger (no pi equivalent) — captures state right before context summarization.
6. **Install via symlink-from-repo** preferred (single source of truth); copy+sync fallback.
7. **Ship order:** core → Claude plugin → pi extension (the two actually used) → Codex later.

## Add-a-new-agent workflow (first-class requirement)

How the user wants to operate long-term: when a new coding agent appears, the user tells the in-repo agent "I added coding agent X," and the agent follows a documented procedure. Per new agent:

1. Identify the agent's extension surface: how it registers in-TUI commands, its session-start/end lifecycle hooks, and how it exposes the conversation transcript.
2. Write a thin adapter under `adapters/<agent>/` that registers the four commands + lifecycle handlers and calls the shared core (no logic duplicated).
3. Wire install: place/symlink the adapter into the agent's extension dir; document install + opt-in steps.
4. Add a row to the per-agent mapping table and note capability gaps (e.g., no auto-exit hook → manual command only).
5. Smoke-test: each command from the TUI, auto checkpoint on exit (if supported), startup pending notice.

## Open questions

- Final shared-core internal interface and how each adapter invokes it.
- Codex: exactly what its `notify`/config can trigger automatically (needs hands-on verification).
- Symlink vs copy install on each platform; whether to provide an install script.
- Test strategy (the original relied on manual/smoke testing).

## Effort estimate

~**2–4 focused days** for a clean v1: extract shared core (~0.5–1d), Claude plugin incl. JSONL parser + commands + hooks (~0.5–1d), pi extension rewire to core (~0.5d), Codex adapter (~0.5d + research), repo/install/docs/tests (~0.5–1d). Codex can come after v1.

## Next steps

1. Create the dedicated `checkpoint` repo (scaffold with `agent-ws`).
2. Copy this `PROJECT.md` identity into it; this `BRIEF.md` is the transition handoff.
3. The in-repo agent: extract the shared core from `checkpoint.ts`, build the Claude plugin + pi extension over it, document the add-a-new-agent workflow, then verify parity with the original extension.
