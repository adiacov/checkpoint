# Implementation Plan: Codex Adapter

**Branch**: `005-codex-adapter` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-codex-adapter/spec.md`

## Summary

Wire the Codex CLI into `@checkpoint/core` with a thin adapter under `adapters/codex/`. Codex
invokes external programs in two ways the adapter uses: its `notify` config runs a program on
`agent-turn-complete`, and its custom **prompts** (`~/.codex/prompts/*.md`) expand into the user
message. So the adapter reuses the Claude Code **bridge** pattern — a compiled Node CLI
(`src/index.ts` dispatch + `src/bridge.ts`) with subcommands `manual | optin | disable | status |
archive` (shared surface) plus a new `notify` subcommand that parses the `agent-turn-complete` JSON
and calls `capture(reason:"turn-complete")`. The four command prompts instruct the agent to run the
bridge via its shell tool. All checkpoint behavior stays in the core; the only adapter logic is
event parsing, transcript translation, and result formatting (Constitution Principle V).

Automatic capture is **best-effort** by necessity: Codex has no session-start/end/pre-compact event,
so the per-turn `notify` is the only signal, bounded by the core's dedup window. Every gap is
documented in the per-agent mapping table, not emulated with divergent behavior.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node ≥18 (ESM), compiled to `dist/` via `tsc` — same
toolchain as `core/`, `adapters/claude-code`, `adapters/pi`.

**Primary Dependencies**: `@checkpoint/core` (local `file:../../core`) for all logic. No agent SDK;
Codex integration is declarative (prompt markdown + a `config.toml notify` snippet) plus a Node
bridge using only `node:*` builtins.

**Storage**: None of its own. Config/checkpoints are owned by the core (`.checkpoint.json`,
`sessions/pending/`, `sessions/archive/` in the consuming project).

**Testing**: `node --import tsx --test "tests/*.test.ts"` (mirrors core). Unit tests target
transcript translation (notify-payload + best-effort rollout); a contract/neutrality test asserts
the subcommand surface, the four prompts, the reason mapping, and that no checkpoint logic lives in
the adapter.

**Target Platform**: Codex CLI. The `notify` program and the command prompts invoke the bridge via
`node <bridge>/dist/index.js <sub>`; the concrete path is resolved by feature 006 (placeholder in
prompts + `config.example.toml`). Repo stays the single source of truth.

**Project Type**: Agent adapter (thin bridge wrapping a shared library).

**Performance Goals**: Negligible; capture is bounded by the core. The `notify` program must exit
fast and never block Codex.

**Constraints**: No checkpoint logic in the adapter (Principle I). No global PATH binary — the
bridge is invoked by path, never installed on `PATH`. No session-start/end/pre-compact event in
Codex — documented gaps, not defects. Hard-kill / true session-end cannot be captured (inherent).

**Scale/Scope**: One adapter, four command prompts, one bridge CLI (six subcommands), one
translation module. ~Small.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
| --- | --- | --- |
| I. Write the Logic Once | Bridge imports `@checkpoint/core`; adds zero capture/dedup/prune/config/git/markdown logic. | PASS — bridge only parses, translates, delegates, formats. |
| II. Identical Command Surface | Exposes `checkpoint`, `checkpoint-optin`, `checkpoint-disable`, `checkpoint-status` with reference semantics. | PASS — four command prompts; see contracts/commands.md. |
| III. Raw Capture, Not Curation | Adapter passes raw translated entries; no summarizing/ranking/promotion. | PASS — translation preserves, never curates. |
| IV. Functional Parity | Shared capabilities match the other adapters; Codex-forced gaps documented, not diverged. | PASS — gaps in contracts/agent-mapping.md (Principle II's "genuinely impossible" clause). |
| V. Thin Documented Wrapper | Lives in `adapters/codex/`; add-an-agent steps followed; mapping table updated. | PASS — see contracts/agent-mapping.md. |

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/005-codex-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 — Codex notify/prompt/rollout mechanics + decisions
├── data-model.md        # Phase 1 — notify payload / rollout line → ConversationEntry mapping
├── quickstart.md        # Phase 1 — build + smoke-test guide
├── contracts/
│   ├── commands.md      # Command-prompt + notify → core contract
│   └── agent-mapping.md # Per-agent mapping table entry for Codex (Principle V), incl. gaps
└── checklists/
    └── requirements.md  # Spec quality checklist (passing)
```

### Source Code (repository root)

```text
adapters/codex/
├── prompts/                 # Codex custom prompts (the four-command surface)
│   ├── checkpoint.md            # manual capture
│   ├── checkpoint-optin.md
│   ├── checkpoint-disable.md
│   └── checkpoint-status.md
├── src/
│   ├── transcript.ts        # notify payload + best-effort rollout JSONL → ConversationEntry[]
│   ├── bridge.ts            # parse notify JSON / args, resolve cwd, call core, format result
│   └── index.ts             # CLI entry: dispatch subcommand (notify|manual|optin|disable|status|archive)
├── tests/
│   ├── transcript.test.ts   # translation unit tests (payload + rollout, skip-empty)
│   └── contract.test.ts     # subcommand surface, 4 prompts, reason mapping, neutrality
├── config.example.toml      # the `notify = [...]` snippet to add to ~/.codex/config.toml
├── package.json             # depends on @checkpoint/core (file:../../core)
├── tsconfig.json
├── .prettierrc.json / .prettierignore
└── README.md                # what it is, wiring, best-effort gaps, build
```

**Structure Decision**: A standalone Codex adapter directory under the existing `adapters/` tree
(matches Constitution `adapters/<agent>/`). The compiled bridge (`dist/`) is what the `notify`
program and the command prompts invoke via `node <path>/dist/index.js <sub>`. Tooling mirrors the
other adapters so there is one mental model across the repo.

## Phase 0 — Research

See [research.md](./research.md). Key decisions: reuse the bridge pattern (Codex runs external
programs); auto-capture on `agent-turn-complete` only, reason `turn-complete`, dedup-bounded;
transcript primary source = the notify payload (stable), best-effort rollout for manual; commands
are prompt expansions that instruct the agent to run the bridge; documented gaps for the missing
start/end/compact events; custom-prompts deprecation noted with skills as a future path.

## Phase 1 — Design

- [data-model.md](./data-model.md) — `agent-turn-complete` payload and best-effort rollout line →
  `ConversationEntry` translation rules.
- [contracts/commands.md](./contracts/commands.md) — the command-prompt + notify surface and its
  delegation to the core, with testable invariants.
- [contracts/agent-mapping.md](./contracts/agent-mapping.md) — the Codex row of the per-agent
  mapping table, with every best-effort capability gap recorded.
- [quickstart.md](./quickstart.md) — build + bridge smoke-test validation guide.

## Complexity Tracking

No constitution violations; nothing to justify.
