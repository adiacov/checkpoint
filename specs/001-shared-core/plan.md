# Implementation Plan: Shared Checkpoint Core

**Branch**: `001-shared-core` | **Date**: 2026-06-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-shared-core/spec.md`

## Summary

Extract the agent-neutral checkpoint logic from the reference pi extension
(`~/.pi/agent/extensions/checkpoint.ts`, 459 lines) into a standalone Node/TS core module
that imports no agent SDK. The core exposes four capabilities — capture, opt-in/disable,
status, and a session-start routine — over a stable interface that any agent adapter calls.
It owns git-facts collection, the markdown checkpoint format, opt-in config read/write with
defaults, directory + ignore-rule setup, skip-empty/dedup, and archive pruning. Capture
reads already-extracted conversation entries handed in by the caller; transcript reading and
command/lifecycle registration stay in the adapters (out of scope here). One deliberate
improvement over the reference is recorded: dedup becomes stateless (newest-pending-file
mtime) instead of an in-memory process global, per the spec clarification.

## Technical Context

**Language/Version**: TypeScript on Node.js 24.x (LTS-class; repo machine has v24.15.0).
Target a conservative `tsconfig` (ES2022/NodeNext) so adapters on older Node still consume it.

**Primary Dependencies**: None at runtime — Node built-ins only (`node:fs`, `node:path`,
`node:child_process`). No agent SDK, no third-party packages. Dev-only: TypeScript, a test
runner (`node:test` + `tsx`), and a linter/formatter.

**Storage**: Filesystem only. Project-root `.checkpoint.json` (config), `sessions/pending/*.md`
and `sessions/archive/*.md` (checkpoints), `.gitkeep` placeholders, `.gitignore` rules.

**Testing**: `node:test` run via `tsx`, against temp directories (real `git init` fixtures for
git-facts and non-repo paths). Deterministic, no network, no agent runtime.

**Target Platform**: Node.js library consumed in-process by each agent adapter (pi extension,
Claude plugin, Codex). Cross-platform path handling (POSIX + Windows separators normalized).

**Project Type**: Single library (the shared core). Adapters are separate, later features.

**Performance Goals**: Capture completes well under one session-shutdown budget (aspirational
target < 250 ms excluding git subprocess latency — not a spec-level requirement and not gated
by a test); checkpoint size bounded to `recentEntries × maxTextPerEntry` + constant-size header
regardless of session length (this bound *is* enforced, via SC-003 / quickstart Scenario 5).

**Constraints**: Agent-neutral (no SDK imports); git subprocess calls must degrade gracefully
in non-repo dirs; never throw away a checkpoint silently; never track raw checkpoint markdown.

**Scale/Scope**: Single-user personal infrastructure; a handful of opted-in repos; archive
bounded to `maxArchivedCheckpoints` (default 50). ~460 reference lines re-expressed as a
testable module of similar size.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution v1.0.0 — evaluated against the five principles:

| Principle | Gate | Status |
|---|---|---|
| I. Write the Logic Once (Agent-Neutral Core) | Core imports no agent SDK; all logic lives once here | ✅ PASS — Node built-ins only; the whole feature *is* this principle |
| II. Identical Command Surface Everywhere | Core exposes capture/optin/disable/status/start so adapters surface identical commands | ✅ PASS — single interface, behavior centralized |
| III. Raw Capture, Not Curation | Core only writes raw evidence; no summarization/promotion | ✅ PASS — markdown body is raw git facts + entries; integration note defers curation |
| IV. Functional Parity With Reference | Reproduce capture/config/skip-empty/dedup/prune behavior | ✅ PASS — ported from `checkpoint.ts`; one intentional change (stateless dedup) documented in research.md |
| V. Adding an Agent Is a Thin Wrapper | Interface callable with zero logic duplication | ✅ PASS — contract defines the seam adapters call |

**Result**: PASS. No violations; Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-core/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── core-interface.md # Public interface of the shared core
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
core/
├── src/
│   ├── index.ts            # Public surface: re-exports the core API
│   ├── api.ts              # capture / optIn / disable / status / sessionStart orchestration
│   ├── config.ts           # load/normalize/write config, defaults, legacy .pi fallback
│   ├── git.ts              # git facts via injected command runner; non-repo degradation
│   ├── checkpoint.ts       # markdown checkpoint formatting (header + git facts + entries)
│   ├── entries.ts          # conversation-entry normalization, truncation, thinking/tool handling
│   ├── store.ts            # pending/archive dirs, .gitkeep, .gitignore rules, prune, counts, dedup
│   └── types.ts            # CheckpointConfig, ProjectContext, ConversationEntry, results
└── tests/
    ├── config.test.ts
    ├── git.test.ts
    ├── checkpoint.test.ts
    ├── entries.test.ts
    ├── store.test.ts
    └── api.test.ts

package.json                # core package manifest (name, type:module, scripts)
tsconfig.json               # NodeNext / ES2022, declaration output for adapters
```

**Structure Decision**: Single-library layout under `core/`. The reference's monolithic
`checkpoint.ts` is decomposed by concern (config, git, formatting, entries, store, API
orchestration) so each is unit-testable in isolation — directly serving Constitution
Principle I (logic once, cleanly seamed) and the spec's per-capability acceptance scenarios.
Agent SDK boundaries are honored by **dependency injection**: the caller passes a git command
runner and the already-extracted conversation entries, so `core/` never imports `pi`, Claude,
or Codex packages. Adapters will live under a future `adapters/` tree (out of scope).

## Complexity Tracking

> No constitution violations. Section intentionally empty.
