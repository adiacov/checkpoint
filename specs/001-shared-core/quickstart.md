# Quickstart: Shared Checkpoint Core

**Feature**: 001-shared-core | **Date**: 2026-06-20

This guide validates the core end-to-end without any agent. It exercises the
[core interface](./contracts/core-interface.md) against a throwaway git repo. Implementation
details live in `tasks.md`; this is a run/validation guide only.

## Prerequisites

- Node.js 18+ to *consume* the built core (it ships ES2022/NodeNext output); the core itself
  is built/tested on Node 24.x (repo machine has 24.15.0). `git` on PATH.
- The core built/runnable from `core/` (`npm install` once dev deps exist).

## Setup

```bash
# from repo root
cd core
npm install            # installs dev deps (typescript, tsx)
npm run build          # emits JS + .d.ts (adapters consume these)
```

## Validation scenarios

Each scenario maps to a spec user story / acceptance scenario. Run them in a scratch repo:

```bash
TMP=$(mktemp -d) && cd "$TMP" && git init -q && git commit --allow-empty -qm init
```

### Scenario 1 — Opt in (User Story 2 / FR-008..010)

Call `optIn(cwd)`. **Expect**: `.checkpoint.json` created with `enabled:true` and defaults
(`recentEntries:24`, `maxTextPerEntry:4000`, `maxArchivedCheckpoints:50`);
`sessions/pending/.gitkeep` and `sessions/archive/.gitkeep` created; `.gitignore` contains
`sessions/pending/*.md` and `sessions/archive/*.md`. Re-running `optIn` adds **no** duplicate
ignore rules and preserves `createdAt`.

```bash
cat .checkpoint.json
git check-ignore sessions/pending/x.md   # → prints the path (ignored)
git status --porcelain sessions/         # → only .gitkeep files tracked
```

### Scenario 2 — Capture a checkpoint (User Story 1 / FR-001..004)

Call `capture(cwd, "manual", { entries:[{role:"user",content:"hello"},
{role:"assistant",content:"hi"}] })`. **Expect**: `written:true`, one file in
`sessions/pending/*.md` whose body has the title, Time/Reason/Project root/CWD header, the
Integration note, a `## Git facts` block (Branch + Status/Diff/Commits), and a
`## Recent conversation` section with `### user — …` and `### assistant — …` entries.

### Scenario 3 — Skip-empty (FR-005)

Call `capture(cwd, "shutdown", { entries:[{role:"assistant",content:"only assistant"}] })`
with `skipEmptySessions:true`. **Expect**: `written:false`,
`skippedReason:"empty-session"`, no new file.

### Scenario 4 — Dedup (FR-006, stateless mtime)

Call `capture` twice in quick succession (within `dedupWindowSeconds`). **Expect**: first
`written:true`; second `written:false`, `skippedReason:"duplicate"` — even from a fresh
process (no in-memory state).

### Scenario 5 — Truncation & bounded output (FR-004)

Capture with an entry longer than `maxTextPerEntry` and more than `recentEntries` entries.
**Expect**: the file includes only the last `recentEntries` entries; the long one ends with
`[truncated N chars]`; thinking blocks render as `[thinking omitted]`; tool calls as
`[tool call: name] {…}`.

### Scenario 6 — Session start: pending count + prune (User Story 3 / FR-012..013)

Seed `sessions/archive/` with `maxArchivedCheckpoints + 3` markdown files and
`sessions/pending/` with 2. Call `sessionStart(cwd)`. **Expect**: `pendingCount:2`,
`prunedCount:3`, archive now holds exactly `maxArchivedCheckpoints` (oldest removed); pending
untouched (core never moves pending→archive).

### Scenario 7 — Disable & status (FR-017, FR-018)

Call `status(cwd)` → `{enabled:true, pendingDir, archiveDir, pendingCount, archivedCount}`.
Call `disable(cwd)` → `.checkpoint.json` now `enabled:false`, dirs/ignore/checkpoints intact.
`capture` afterwards → `written:false`, `skippedReason:"disabled"`.

### Scenario 8 — Non-git directory (edge case / FR-002)

Run capture in a plain `mktemp -d` (no `git init`) after opt-in. **Expect**: `written:true`
with git facts degraded (Branch `unknown`, Status `clean`/unavailable, commits `none`).

## Automated equivalent

```bash
cd core && npm test     # node:test suite covering scenarios 1–8 against temp dirs
```

**Definition of done for validation**: all eight scenarios pass manually and `npm test` is
green, with parity against the reference behavior (see research.md D2 for the one intentional
deviation: stateless dedup).
