# @checkpoint/core

Agent-neutral shared checkpoint core: git facts, the markdown checkpoint format, opt-in config,
archive prune, skip-empty/dedup, and the startup pending-count. This is the single source of
truth that every agent adapter (pi, Claude Code, Codex) calls — no checkpoint logic is
duplicated in an adapter (Constitution Principle I).

The core imports **no agent SDK** and only Node built-ins. Adapters supply the two
agent-specific inputs: a git command runner and the already-extracted conversation entries.

## Install / build

```bash
cd core
npm install
npm run build   # emits dist/*.js + dist/*.d.ts
npm test        # node:test suite (temp-dir fixtures, no network)
npm run lint    # prettier --check
```

## Capabilities

All capabilities take `(cwd, deps)` (capture also takes a `reason`) and resolve the project
root + config internally. See `../specs/001-shared-core/contracts/core-interface.md`.

```ts
import {
	capture,
	detectProject,
	disable,
	optIn,
	sessionStart,
	status,
	type CoreDeps,
} from "@checkpoint/core";

// Adapter supplies a git runner and the conversation entries it extracted from its transcript.
const deps: CoreDeps = {
	runGit: myRunner, // optional; defaults to a node:child_process runner
	entries: myEntries, // required for capture
	sessionFile: "/path/to/session", // optional header value
};

await optIn(cwd); // write .checkpoint.json, create dirs/.gitkeep, add .gitignore rules
await capture(cwd, "shutdown", deps); // write a checkpoint to sessions/pending (guarded)
await sessionStart(cwd); // prune archive to max, return pending count
await status(cwd); // { configured, enabled, pendingDir, archiveDir, pendingCount, archivedCount }
await disable(cwd); // set enabled=false only (reversible)
```

`capture` never throws on a normal skip: it returns `{ written: false, skippedReason }` for
not-configured / disabled / reload / empty-session / duplicate, and `{ written: false, error }`
on an IO failure (a checkpoint is never silently dropped — FR-016).

## Configuration (`.checkpoint.json`)

Tracked in git so opt-in and tuning travel with the repo. Defaults (match the reference):

| Field | Default |
|---|---|
| `recentEntries` | 24 |
| `maxTextPerEntry` | 4000 |
| `maxArchivedCheckpoints` | 50 |
| `dedupWindowSeconds` | 20 |
| `includeReload` | false |
| `skipEmptySessions` | true |
| `pendingDir` | `sessions/pending` |
| `archiveDir` | `sessions/archive` |

The legacy `.pi/checkpoint.json` is read as a fallback during the transition.

## Parity with the reference, and the one intentional deviation

This core is ported from the pi extension `reference/checkpoint.ts` and preserves its observable
behavior (FR-015 / SC-006). There is **one intentional behavior change**, per the spec
clarification and `research.md` §D2:

> **Dedup is stateless.** The reference used an in-memory module global
> (`lastAutomaticCheckpoint`, keyed by `{root, reason}`) that only dedups within one running
> process and is lost on restart. The core instead detects a recent capture by the **newest
> pending file's mtime**, which is stateless and cross-process safe (two agents ending sessions
> in the same repo dedup correctly). Consequence: dedup no longer keys on `reason` — any capture
> within `dedupWindowSeconds` is suppressed.

All other capture/config/skip-empty/prune behavior is reproduced as-is.

## Scope

Linux is the supported/validated platform (Windows is out of scope). Transcript reading and
command/lifecycle registration belong to each adapter; the core only consumes the entries it is
handed. Adapters live under a future `adapters/` tree.
