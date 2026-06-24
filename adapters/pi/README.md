# pi checkpoint adapter

The [pi](https://github.com/earendil-works) integration for [checkpoint](../../core). It's a thin,
**in-process** pi extension: the default export registers the four checkpoint commands, hooks pi's
session lifecycle, translates pi's live conversation into the core's neutral format, and calls
[`@checkpoint/core`](../../core) for everything else. No checkpoint logic lives here (that's the
whole point — see the [constitution](../../.specify/memory/constitution.md)).

This adapter replaces the original `reference/checkpoint.ts` extension — the parity baseline the
whole project is ported from — re-pointed at the shared core so the logic lives exactly once.

## What it adds to pi

**Commands** (identical surface across every agent):

| Command               | Does                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------- |
| `/checkpoint`         | Write a manual checkpoint of the current session now.                                 |
| `/checkpoint-optin`   | Opt this project in (creates `.checkpoint.json`, the `sessions/` dirs, ignore rules). |
| `/checkpoint-disable` | Turn checkpointing off for this project (config kept).                                |
| `/checkpoint-status`  | Show configured/enabled state and pending/archived counts.                            |

**Lifecycle handlers** (automatic capture — no command needed):

| Event              | Action                                           | Reason                |
| ------------------ | ------------------------------------------------ | --------------------- |
| `session_start`    | prune archive + show pending count               | —                     |
| `session_shutdown` | capture (passes the shutdown reason to the core) | `shutdown` / `reload` |

The core decides everything: not-configured / disabled / empty-session / duplicate are skipped
silently, and `reload` shutdowns are suppressed unless `includeReload` is set. Capture only happens
in projects that have been opted in. Opt-in is agent-neutral, so a project opted in via any other
agent is recognized here too, and projects still configured only via the legacy
`.pi/checkpoint.json` continue to work during the transition (the core reads both).

### Naming note

The original reference extension registered the enable command as `checkpoint-enable`. This adapter
uses the canonical cross-agent name `checkpoint-optin` (constitution Principle II), matching the
Claude Code adapter. That's a rename only — the behavior (write config, create dirs and ignore
rules) is unchanged.

### How it differs from the Claude Code adapter

pi runs extensions **in-process**, so — unlike the Claude Code plugin — there is no out-of-process
bridge CLI, no markdown command files, and no `hooks.json`. The handlers call the core's async
functions directly. The conversation comes from pi's live session manager (not a transcript file),
so the manual command and the lifecycle handlers share one translation path. Git is run through
`pi.exec` (preserving reference behavior), injected into the core as its command runner.

### Recovery / archive

Reviewing the raw checkpoints in `sessions/pending/` and promoting the still-relevant bits into
durable memory is an **agent-driven workflow** — see the single authoritative procedure in
[`WORKFLOWS.md`](../../WORKFLOWS.md). Its mechanical close-out (moving processed files to
`sessions/archive/`) lives entirely in [`@checkpoint/core`](../../core)'s `archive()`. This adapter
deliberately exposes **no fifth command**: the user-facing surface stays the four `/checkpoint*`
commands (Principle II). Curation (deciding what's durable) is the agent's job, never the code's
(Principle III).

### Capability gap

Capture cannot run on a hard kill (`kill -9`/crash) because no lifecycle event fires. This is
inherent and shared with the reference extension — see
[agent mapping](../../specs/004-pi-adapter/contracts/agent-mapping.md).

## Build & test

```bash
cd ../../core && npm install && npm run build   # the core must be built first
cd ../adapters/pi && npm install
npm test        # transcript translation + contract/neutrality guard + scripted smoke test
npm run build && npm run typecheck && npm run lint
```

> Type note: this in-repo package declares a minimal local `ExtensionAPI` shim (`src/pi-types.ts`)
> for the slice of pi's API it uses, so it builds without pulling the full pi SDK. The shapes mirror
> the reference's usage; at install time the shim can be swapped for `import type` from
> `@earendil-works/pi-coding-agent` with no code change.

## Install

Automated install (placing/symlinking this extension into `~/.pi/agent/extensions/`) is delivered
by the install/distribution feature (`006`). Until then, the repository remains the single source of
truth; the pi extensions directory is an install target, never edited in place.
