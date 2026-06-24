# Implementation Plan: Claude Code Adapter

**Branch**: `002-claude-code-adapter` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-claude-code-adapter/spec.md`

## Summary

Wire Claude Code into the existing `@checkpoint/core` engine with a thin, self-contained Claude
Code **plugin** under `adapters/claude-code/`. The plugin contributes only three things, per
Constitution Principle V: command registration (four slash commands), lifecycle wiring (three
hooks), and transcript translation (Claude Code JSONL → the core's `ConversationEntry[]`). All
checkpoint behavior — git facts, markdown format, opt-in config, dedup, skip-empty, prune — stays
in the core and is reached through a single thin Node bridge that both the hooks and the slash
commands invoke.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node ≥18 (ESM), compiled to `dist/` via `tsc` — same
toolchain as `core/`.

**Primary Dependencies**: `@checkpoint/core` (local `file:../../core`). No agent SDK; Claude Code
integration is purely declarative (plugin manifest + `hooks.json` + markdown commands) plus a Node
bridge that uses only `node:*` builtins.

**Storage**: None of its own. Checkpoints/config are owned by the core (`.checkpoint.json`,
`sessions/pending/`, `sessions/archive/` in the consuming project).

**Testing**: `node --import tsx --test "tests/*.test.ts"` (mirrors core). Unit tests target the
transcript-translation module (the only real adapter logic); a contract test asserts the four
commands and three hooks are declared and mapped to the documented reasons.

**Target Platform**: Claude Code (TUI/CLI) as a plugin, installed via marketplace or in-place;
repo remains the single source of truth (symlink/copy install is feature 006).

**Project Type**: Agent adapter (thin plugin wrapping a shared library).

**Performance Goals**: Negligible; capture is bounded by the core. Hook execution must add no
perceptible startup/shutdown delay (well under the hook timeout).

**Constraints**: No checkpoint logic in the adapter (Principle I). No global PATH binary — the
bridge is invoked by absolute path via `${CLAUDE_PLUGIN_ROOT}`, never installed on `PATH`
(Technical Constraints). Hard-kill cannot fire hooks — documented gap, not a defect.

**Scale/Scope**: One adapter, four commands, three hooks, one translation module. ~Small.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
| --- | --- | --- |
| I. Write the Logic Once | Adapter imports `@checkpoint/core` and adds zero capture/dedup/prune/config/git logic. | PASS — bridge only translates + delegates. |
| II. Identical Command Surface | Exposes exactly `/checkpoint`, `/checkpoint-optin`, `/checkpoint-disable`, `/checkpoint-status` with reference semantics. | PASS — see contracts/commands.md. |
| III. Raw Capture, Not Curation | Adapter passes raw entries; no summarizing/ranking/promotion. | PASS — translation preserves, never curates. |
| IV. Functional Parity | Reasons (manual/shutdown/reload), reload gating, pending-notice guard match `reference/checkpoint.ts`. | PASS — mappings derived from reference (spec Clarifications). |
| V. Thin Documented Wrapper | Lives in `adapters/claude-code/`; add-an-agent steps followed; mapping table updated. | PASS — see contracts/agent-mapping.md. |

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-claude-code-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 — Claude Code plugin/hook mechanics + decisions
├── data-model.md        # Phase 1 — transcript line → ConversationEntry mapping
├── quickstart.md        # Phase 1 — install + smoke-test guide
├── contracts/
│   ├── commands.md      # Slash-command + hook→core contract
│   └── agent-mapping.md # Per-agent mapping table entry (Principle V)
└── checklists/
    └── requirements.md  # Spec quality checklist (already passing)
```

### Source Code (repository root)

```text
adapters/claude-code/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (name, version, hooks, commands)
├── commands/                # Markdown slash commands (the four-command surface)
│   ├── checkpoint.md            # manual capture
│   ├── checkpoint-optin.md
│   ├── checkpoint-disable.md
│   └── checkpoint-status.md
├── hooks/
│   └── hooks.json           # SessionStart / SessionEnd / PreCompact → bridge
├── src/
│   ├── transcript.ts        # JSONL transcript → ConversationEntry[] (the only real logic)
│   ├── bridge.ts            # parse hook stdin / args, resolve cwd+transcript, call core
│   └── index.ts             # CLI entry: dispatch subcommand
├── tests/
│   ├── transcript.test.ts   # translation unit tests (roles, order, structured blocks)
│   └── contract.test.ts     # manifest declares 4 commands + 3 hooks, reason mapping
├── package.json             # depends on @checkpoint/core (file:../../core)
├── tsconfig.json
└── README.md                # what it is + install pointer (humans)
```

**Structure Decision**: A standalone Claude Code plugin directory under a new top-level
`adapters/` tree (matches Constitution `adapters/<agent>/`). The compiled bridge (`dist/`) is what
`hooks.json` and the slash commands invoke via `node "${CLAUDE_PLUGIN_ROOT}/dist/index.js" <sub>`.
Tooling mirrors `core/` exactly so there is one mental model across the repo.

## Complexity Tracking

No constitution violations; nothing to justify.
