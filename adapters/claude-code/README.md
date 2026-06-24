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

The hooks and slash commands invoke `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" <subcommand>`, so
`npm run build` must have produced `dist/`.

## Install

Automated install (symlink-from-repo preferred, copy+sync fallback) is delivered by the
install/distribution feature (`006`). Until then, point Claude Code at this directory as a plugin
(e.g. via a local marketplace or in-place plugin load) with the core built. The repository remains
the single source of truth; the plugin directory is an install target, never edited in place.
