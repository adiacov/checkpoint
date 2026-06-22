# @checkpoint/core

Never lose the context of a coding session again.

When a coding session ends, this library captures a snapshot of where you left off — your git
state plus the recent conversation — as a plain Markdown file. The next session (with any agent)
can read that snapshot and pick up where you stopped, instead of starting cold.

It's the shared engine behind the `/checkpoint` commands. Each coding agent (pi, Claude Code,
Codex) is just a thin wrapper around this core, so every agent behaves identically and there's
only one place where the logic lives.

## Why

Session memory loss is the same problem in every agent: you finish a session, close the tool,
and tomorrow the agent has no idea what you were doing. A checkpoint is a cheap insurance
policy — raw, faithful evidence of the session end, written somewhere you can recover it. It
doesn't try to be clever or summarize; it just makes sure nothing is lost.

## What you get

- **Automatic capture** at session end: git branch, status, diff, recent commits, and the last
  chunk of the conversation, written to `sessions/pending/`.
- **Opt-in per project.** Nothing happens until you opt a project in. The opt-in travels with
  the repo (it's a tracked file), so the setting follows the code.
- **Stays out of your way in git.** Raw checkpoints are git-ignored automatically; only the
  config and directory placeholders are tracked.
- **Self-limiting.** Each checkpoint is size-bounded, duplicate captures are suppressed, and the
  archive is pruned so it never grows without bound.
- **No surprises.** Empty sessions are skipped, failures are reported (never silently dropped),
  and a missing git repo degrades gracefully instead of erroring.

## Install

```bash
cd core
npm install
npm run build   # compiles to dist/ (with .d.ts type declarations)
```

Requires Node 18+ to use; built and tested on Node 24. No runtime dependencies.

## Quick start

```ts
import { optIn, capture, sessionStart, status, disable } from "@checkpoint/core";

const cwd = process.cwd();

// 1. Opt this project in (once). Creates .checkpoint.json, the sessions/ dirs, and ignore rules.
await optIn(cwd);

// 2. At the end of a session, capture a checkpoint.
//    `entries` is the recent conversation, supplied by your agent.
await capture(cwd, "shutdown", {
	entries: [
		{ role: "user", content: "let's refactor the parser" },
		{ role: "assistant", content: "done — split it into lex + parse" },
	],
});

// 3. At the start of a session, see what's waiting and tidy the archive.
const { pendingCount } = await sessionStart(cwd);
if (pendingCount > 0) console.log(`${pendingCount} checkpoint(s) to review`);

// Anytime: check state, or turn it off.
await status(cwd);
await disable(cwd);
```

## What a checkpoint looks like

A checkpoint is just Markdown you can read or grep:

```markdown
# Pending Session Checkpoint

Time: 2026-06-22T14:08:44.783Z
Reason: shutdown
Project root: /home/me/my-project
CWD: /home/me/my-project
Session file: unknown

## Integration note

This is raw session evidence, not durable memory.
On the next session, review it and persist only important goals, decisions, current
state, next actions, blockers, and durable realizations into the project's memory files.
After integration, move this file to `sessions/archive/` or otherwise mark it processed.

## Git facts

Branch: main

### Status / Diff stat / Recent commits (fenced blocks)

## Recent conversation

### user — 2026-06-22T14:08:40.000Z

let's refactor the parser
...
```

## API

Every function takes `(cwd, deps?)` — `capture` also takes a `reason`. They resolve the project
root and config for you.

| Function                     | What it does                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `optIn(cwd, deps?)`          | Turn checkpointing on: write config with defaults, create the dirs + `.gitkeep`, add ignore rules. Safe to run twice. |
| `capture(cwd, reason, deps)` | Write a checkpoint — unless a guard skips it (see below). Needs `deps.entries`.                                       |
| `sessionStart(cwd, deps?)`   | Prune the archive to its limit and return the pending count.                                                          |
| `status(cwd, deps?)`         | Report whether it's configured/enabled, the directories, and the pending/archived counts.                             |
| `disable(cwd, deps?)`        | Set `enabled: false` only. Everything else is left intact, so re-enabling just works.                                 |
| `detectProject(cwd, deps?)`  | Low-level: resolve the project root and load its config.                                                              |

**`deps`** is how an agent plugs in:

```ts
{
  entries?,      // the recent conversation (required for capture)
  runGit?,       // a command runner; defaults to a node:child_process one
  sessionFile?,  // optional value for the "Session file" header
  now?,          // override the clock (for tests)
}
```

**`capture` is guarded** and never throws on a normal skip. It returns
`{ written: false, skippedReason }` when the project isn't configured, is disabled, is a reload
you didn't opt into, is an empty session, or is a duplicate within the dedup window — and
`{ written: false, error }` if a real write fails. A checkpoint is never silently dropped.

## Configuration

A project opts in via `.checkpoint.json` at its root (tracked in git). Every field has a sensible
default, so a bare opt-in just works:

| Field                    | Default            | Meaning                                               |
| ------------------------ | ------------------ | ----------------------------------------------------- |
| `recentEntries`          | `24`               | How many recent messages to include                   |
| `maxTextPerEntry`        | `4000`             | Per-message character cap (longer ones are truncated) |
| `maxArchivedCheckpoints` | `50`               | Archive size limit before pruning kicks in            |
| `dedupWindowSeconds`     | `20`               | Suppress a second capture within this many seconds    |
| `includeReload`          | `false`            | Whether reload/restart session-ends are captured      |
| `skipEmptySessions`      | `true`             | Skip sessions with no real user message               |
| `pendingDir`             | `sessions/pending` | Where new checkpoints are written                     |
| `archiveDir`             | `sessions/archive` | Where reviewed checkpoints live                       |

(During the transition, a legacy `.pi/checkpoint.json` is read as a fallback.)

## Where this fits

The core only does capture. It does **not** read your agent's transcript, register commands, or
decide what's worth remembering — those belong to the agent adapter and to your project's own
instructions. Turning a raw checkpoint into durable memory is a separate, deliberate step you (or
your agent) take when reviewing `sessions/pending/`.

```
your agent (adapter)  ──►  @checkpoint/core  ──►  sessions/pending/*.md
   (extracts entries,         (this library:           (raw evidence you
    registers commands)        the actual logic)         review & curate)
```

## A note on duplicate suppression

If you've used the original pi extension: dedup here works slightly differently, on purpose. The
original tracked the last capture in memory, which only worked within one running process. This
version checks the newest pending file's timestamp instead — so it's stateless and works even
when two agents end sessions in the same repo. The trade-off: dedup no longer distinguishes by
reason; any capture within the window is suppressed. Everything else matches the original.

## Development

```bash
npm test        # node:test suite against temp dirs — deterministic, no network
npm run lint     # prettier --check
npm run build    # type-check + emit dist/
```

## Scope & limitations

- **Linux** is the supported platform. (Windows isn't validated.)
- **Hard kills** (`kill -9`, crashes) can't be captured — nothing can run on a hard kill. That's
  an accepted gap, not a bug.
- This is **personal infrastructure**, not a published package or a global CLI.

## License

MIT
