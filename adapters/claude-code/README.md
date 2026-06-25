# Claude Code checkpoint adapter

The Claude Code integration for [checkpoint](../../core). It's a thin plugin: it registers the
four checkpoint slash commands, hooks Claude Code's session lifecycle, translates Claude's
transcript into the core's neutral format, and calls [`@checkpoint/core`](../../core) for
everything else. No checkpoint logic lives here (that's the whole point — see the
[constitution](../../.specify/memory/constitution.md)).

## What it adds to Claude Code

**Slash commands** (identical surface across every agent):

| Command               | Does                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `/checkpoint`         | Write a manual checkpoint of the current session now.                                 |
| `/checkpoint-optin`   | Opt this project in (creates `.checkpoint.json`, the `sessions/` dirs, ignore rules). |
| `/checkpoint-disable` | Turn checkpointing off for this project (config kept).                                |
| `/checkpoint-status`  | Show configured/enabled state and pending/archived counts.                            |

**Lifecycle hooks** (automatic capture — no command needed):

| Event          | Action                                         | Reason     |
| -------------- | ---------------------------------------------- | ---------- |
| `SessionStart` | prune archive + show pending count             | —          |
| `SessionEnd`   | capture                                        | `shutdown` |
| `PreCompact`   | capture (suppressed if `includeReload: false`) | `reload`   |

Capture only happens in projects that have been opted in. Opt-in is agent-neutral, so a project
opted in via any other agent is recognized here too.

### Recovery / archive (not a slash command)

Capture is only half the lifecycle. Reviewing the raw checkpoints in `sessions/pending/` and
promoting the still-relevant bits into durable memory is an **agent-driven workflow** — see the
single authoritative procedure in [`WORKFLOWS.md`](../../WORKFLOWS.md). Its mechanical close-out
step (moving processed files to `sessions/archive/`) is exposed by the bridge as an `archive`
subcommand, which the workflow invokes once it has extracted what it needs:

```bash
# archive specific reviewed checkpoints
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" archive 2026-06-24T...-manual.md "$PWD"
# or archive all pending checkpoints (trailing arg is always the cwd)
node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" archive "$PWD"
```

This is deliberately **not** a fifth slash command: the user-facing surface stays the four
`/checkpoint*` commands (constitution Principle II), and the move/prune logic lives entirely in
[`@checkpoint/core`](../../core)'s `archive()` — the adapter only translates args and renders the
result. Curation (deciding what's durable) is the agent's job, never the code's (Principle III).

### Capability gap

Capture cannot run on a hard kill (`kill -9`/crash) because no lifecycle hook fires. This is
inherent and shared with the pi reference — see [agent mapping](../../specs/002-claude-code-adapter/contracts/agent-mapping.md).

## Build & test

```bash
cd ../../core && npm install && npm run build   # the core must be built first
cd ../adapters/claude-code && npm install && npm run build
npm test        # transcript translation + contract/neutrality guard
```

`npm run build` bundles `src/` (and its `@checkpoint/core` import) into a single self-contained
`dist/index.js` via esbuild, so the shipped plugin needs no `node_modules` at runtime. Both entry
points invoke that file, but they reach it through **different** variables — the only directory
variable each context actually exposes:

- **Hooks** (`hooks/hooks.json`): `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" <subcommand>` — Claude
  substitutes `${CLAUDE_PLUGIN_ROOT}` (the plugin root) in hook configs.
- **Slash commands** (`skills/<name>/SKILL.md`): `node "${CLAUDE_SKILL_DIR}/../../dist/index.js" <subcommand>` —
  command bash injection does **not** receive `${CLAUDE_PLUGIN_ROOT}`. The only path variable it
  substitutes is `${CLAUDE_SKILL_DIR}`, and Claude only substitutes it for true skills (a `SKILL.md`
  under `skills/`), **not** for flat `commands/*.md` files (where it expands to empty). So each command
  is a `skills/<name>/SKILL.md`; `${CLAUDE_SKILL_DIR}` resolves to that skill's own directory and the
  bridge is two levels up at `../../dist/index.js`.

## Install

Use the repo's installer (feature `006`):

```bash
node scripts/install.mjs install --agent claude      # symlink-from-repo (default); copy+sync via --mode copy
node scripts/install.mjs uninstall --agent claude    # clean removal
node scripts/install.mjs status                       # what's installed
```

The installer drives Claude Code's own plugin CLI (so it loads exactly the way Claude expects):
it runs `claude plugin marketplace add <repo>` (the repo-root
[`.claude-plugin/marketplace.json`](../../.claude-plugin/marketplace.json) declares the `checkpoint`
plugin with source `./adapters/claude-code`) then `claude plugin install checkpoint@checkpoint-local`.
Idempotent; `uninstall` runs `claude plugin uninstall` + `marketplace remove`. Requires the `claude`
CLI on `PATH` (reported clearly if absent). See [`scripts/install.mjs`](../../scripts/install.mjs).

> **Note:** unlike the pi/Codex adapters (live symlinks from the repo), Claude Code copies the plugin
> into its own cache at the current git commit. After changing the adapter, rebuild and run
> `claude plugin update checkpoint@checkpoint-local` (or re-run the installer's uninstall+install) to
> pick it up, then restart the Claude session so it reloads the command/hook definitions. Because
> `dist/index.js` is a self-contained bundle, the cache copy resolves with no dependency on the repo
> or on `node_modules`.
