# checkpoint

**Never lose a coding session.** `checkpoint` captures your git state and recent conversation at the
end of a session — automatically — so the next session, in *any* coding agent, can pick up where you
left off.

It's one shared engine surfaced as the **same four commands inside every supported agent**: Claude
Code, [pi](https://github.com/earendil-works), and Codex.

---

## The problem

Coding-agent sessions are amnesiac. When a session ends, is compacted, or you switch tools, the
context — what you were doing, why, what's half-finished, which files changed — is gone. This happens
in *every* agent, so solving it once per agent is wasteful and inconsistent.

## What it does

At the end of a session (or on demand), `checkpoint` writes a single Markdown file to the project's
`sessions/pending/` containing:

- **git facts** — branch, status, diff stat, recent commits;
- **recent conversation** — the last N entries of the session, truncated sanely.

That file is raw recovery *evidence*, not curated memory. At the start of your next session the agent
sees how many checkpoints are pending and can reconcile the still-relevant bits into your project's
durable notes, then archive what it processed. Capture is deliberately "dumb and faithful" — deciding
what's worth keeping is the agent's job, never the tool's.

It is **not** a CLI you run from a shell to take notes. You type `/checkpoint…` *inside* an agent.

## How it's built

```
@checkpoint/core            the entire logic, written once, no agent SDK
  └─ adapters/claude-code    thin Claude Code plugin  (slash commands + lifecycle hooks)
  └─ adapters/pi             thin pi extension        (in-process commands + handlers)
  └─ adapters/codex          thin Codex bridge        (prompts + notify program)
```

The core owns git collection, the checkpoint format, opt-in config, archive pruning, skip-empty and
dedup. Each adapter only adapts three things to its agent: how commands register, how lifecycle
events fire, and how the transcript is read. Adding a new agent is a thin, documented wrapper — never
a rewrite.

---

## Install

> **Prerequisites:** Node.js ≥ 18 and git. Works on any OS that runs Node (symlink mode is default;
> use `--mode copy` where symlinks aren't available).

Installing is a **one-time, per-machine** setup — it places each adapter into the directory its agent
loads from, linked back to this repo (so the repo stays the single source of truth and future updates
need no re-install). After this you only ever use slash commands.

```bash
# 1. clone, then build the shared core
git clone git@github.com:adiacov/checkpoint.git
cd checkpoint/core && npm install && npm run build && cd ..

# 2. install dependencies for the adapter(s) you want
cd adapters/claude-code && npm install && cd ../..    # and/or adapters/pi, adapters/codex

# 3. install into your agents (builds adapters automatically if needed)
node scripts/install.mjs install                       # all three
node scripts/install.mjs install --agent pi            # just one
```

Useful flags: `--dry-run` (preview, change nothing), `--mode copy` (copy instead of symlink),
`--force` (replace existing/legacy content), `--no-build` (use an existing build).

```bash
node scripts/install.mjs status         # what's installed
node scripts/install.mjs uninstall      # clean removal (optionally --agent <name>)
```

The installer is idempotent, never overwrites unrelated content (it stops and reports a conflict
instead), and `uninstall` removes only what it created. There is intentionally **no global
`checkpoint` binary on your PATH** — installs and maintenance are run from this repo.

---

## Usage

Once an adapter is installed, the **same four commands** are available inside that agent's session:

| Command               | What it does                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `/checkpoint-optin`   | Opt this project in: create `.checkpoint.json`, the `sessions/` dirs, ignore rules |
| `/checkpoint`         | Write a checkpoint of the current session now                                     |
| `/checkpoint-status`  | Show configured/enabled state and pending/archived counts                         |
| `/checkpoint-disable` | Turn checkpointing off for this project (config kept)                             |

### Day-to-day flow

1. **Once per project**, inside any agent: `/checkpoint-optin`.
2. **Work normally.** A checkpoint is captured automatically when the session ends (and, in Claude
   Code, right before context compaction).
3. **Next session**, the agent shows the pending count and reconciles `sessions/pending/` into your
   durable notes, then archives what it processed.

Opt-in is **agent-neutral** — a project opted in via one agent is recognized by all of them, because
they share `.checkpoint.json`.

### Automatic capture per agent

| Agent           | Commands | Automatic capture                                  | Notes                                             |
| --------------- | -------- | -------------------------------------------------- | ------------------------------------------------- |
| **Claude Code** | ✅       | session end **and** before compaction (`PreCompact`) | Full lifecycle support                           |
| **pi**          | ✅       | session shutdown                                   | In-process extension                              |
| **Codex**       | ✅       | after each completed turn (`notify`)               | Best-effort: Codex has no session-end event       |

Capture cannot run on a hard kill (`kill -9` / crash) — no lifecycle event fires. This is inherent
and shared by all agents.

---

## Configuration

A project opts in via a tracked **`.checkpoint.json`** at its root, so the setting travels with the
repo. Sensible defaults apply; common knobs:

| Field                | Default            | Meaning                                          |
| -------------------- | ------------------ | ------------------------------------------------ |
| `enabled`            | `true`             | Master on/off for the project                    |
| `recentEntries`      | `24`               | How many conversation entries to capture         |
| `maxTextPerEntry`    | `4000`             | Per-entry text truncation                        |
| `dedupWindowSeconds` | `20`               | Suppress near-duplicate captures within a window |
| `maxArchivedCheckpoints` | `50`           | Archive prune ceiling (oldest removed first)     |

Raw checkpoints live in `sessions/pending/` and `sessions/archive/` (git-ignored; `.gitkeep`s
tracked).

### Migrating older projects

Projects configured with the legacy pi-era `.pi/checkpoint.json` are read transparently. To
consolidate everything onto the canonical `.checkpoint.json`, a one-off sweep is provided (dry-run by
default, never commits, skips dirty repos):

```bash
node scripts/migrate-configs.mjs            # preview across sibling projects
node scripts/migrate-configs.mjs --apply    # consolidate for real
```

---

## Repository layout

```
core/                     @checkpoint/core — the shared engine (+ tests)
adapters/claude-code/     Claude Code plugin
adapters/pi/              pi extension
adapters/codex/           Codex bridge (prompts + notify)
scripts/install.mjs       one-time per-agent installer
scripts/migrate-configs.mjs   legacy → canonical config sweep
specs/                    spec-kit artifacts per feature (spec, plan, tasks, …)
WORKFLOWS.md              session/recovery workflow authority
PROJECT.md / BRIEF.md     project identity and the transformation plan
STATE.md                  canonical current-state entrypoint
```

## Development

Each package is independent (build with its own `tsc`, tests via `node:test`):

```bash
cd core && npm install && npm run build && npm test     # 68 tests
cd adapters/<agent> && npm install && npm test          # adapter tests
node --test tests/install/*.test.mjs                    # installer (12)
node --test tests/migrate/*.test.mjs                    # config sweep (6)
```

Architecture rules (core/adapter split, identical command surface, raw-capture-not-curation, parity
with the reference pi extension, thin add-an-agent wrappers) are governed by
[`.specify/memory/constitution.md`](.specify/memory/constitution.md).

> **Project status:** the engine, all three adapters, the installer, and the config migration are
> implemented and unit-tested. The final in-agent (in-TUI) smoke tests across live Claude Code / pi /
> Codex sessions are the remaining verification step — see [`STATE.md`](STATE.md).

## License

[MIT](LICENSE) © 2026 Alexandru Diacov
