# Implementation Plan: pi Adapter

**Branch**: `004-pi-adapter` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-pi-adapter/spec.md`

## Summary

Replace the vendored, self-contained pi extension (`reference/checkpoint.ts`) with a thin pi
adapter under `adapters/pi/` that imports `@checkpoint/core` and delegates every checkpoint
decision to it. Per Constitution Principle V the adapter contributes only three things: command
registration (the four-command surface via `pi.registerCommand`), lifecycle wiring (`session_start`
/ `session_shutdown` via `pi.on`, including shutdown-reason passthrough so the core does reload
gating), and transcript translation (pi session-manager entries → the core's
`ConversationEntry[]`). All checkpoint behavior — git facts, markdown format, opt-in config,
dedup, skip-empty, prune, pending-count — stays in the core.

Unlike the Claude Code adapter, pi runs extensions **in-process** through its `ExtensionAPI`, so
there is **no external Node "bridge" process, no markdown command files, and no `hooks.json`**: the
extension module calls the core's async functions directly from its command/event handlers.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node ≥18 (ESM) — same toolchain as `core/` and
`adapters/claude-code/`.

**Primary Dependencies**: `@checkpoint/core` (local `file:../../core`) for all logic;
`@earendil-works/pi-coding-agent` as a **type-only** dev dependency for `ExtensionAPI` (matches the
reference's `import type`). No runtime agent SDK.

**Storage**: None of its own. Config/checkpoints are owned by the core (`.checkpoint.json` or legacy
`.pi/checkpoint.json`; `sessions/pending/`, `sessions/archive/`).

**Testing**: `node --import tsx --test "tests/*.test.ts"` (mirrors core + claude-code). Unit tests
target the transcript-translation module (the only real adapter logic); a contract/neutrality test
asserts the four commands + two lifecycle handlers are registered with the documented reason
mapping and that no source file re-implements checkpoint logic.

**Target Platform**: pi coding agent, loaded as an in-process extension from
`~/.pi/agent/extensions/`. Install/wiring is feature 006; this feature delivers the adapter source,
tests, and docs in-repo. The repo stays the single source of truth.

**Project Type**: Agent adapter (thin in-process extension wrapping a shared library).

**Performance Goals**: Negligible; capture is bounded by the core. Lifecycle handlers add no
perceptible startup/shutdown delay.

**Constraints**: No checkpoint logic in the adapter (Principle I). No global PATH binary (the
extension is loaded by pi, never installed on `PATH`). Hard-kill cannot fire `session_shutdown` —
documented gap, not a defect, identical to the reference.

**Scale/Scope**: One adapter, four commands, two lifecycle handlers, one translation module.
~Small — smaller than the Claude Code adapter (no bridge/CLI/JSONL layer).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
| --- | --- | --- |
| I. Write the Logic Once | Adapter imports `@checkpoint/core`; adds zero capture/dedup/prune/config/git/markdown logic. | PASS — handlers only translate + delegate. |
| II. Identical Command Surface | Registers exactly `checkpoint`, `checkpoint-optin`, `checkpoint-disable`, `checkpoint-status` with reference semantics. | PASS — canonical names; see contracts/commands.md. |
| III. Raw Capture, Not Curation | Adapter passes raw translated entries; no summarizing/ranking/promotion. | PASS — translation preserves, never curates. |
| IV. Functional Parity | Reasons (manual/shutdown/reload), reload gating, skip-empty, dedup, pending-notice guard match `reference/checkpoint.ts`. | PASS — mappings derived from the reference. |
| V. Thin Documented Wrapper | Lives in `adapters/pi/`; add-an-agent steps followed; mapping table updated. | PASS — see contracts/agent-mapping.md. |

No violations → Complexity Tracking left empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-pi-adapter/
├── plan.md              # This file
├── research.md          # Phase 0 — pi extension surface mechanics + decisions
├── data-model.md        # Phase 1 — pi session entry → ConversationEntry mapping
├── quickstart.md        # Phase 1 — build + smoke-test guide
├── contracts/
│   ├── commands.md      # Command + lifecycle → core contract
│   └── agent-mapping.md # Per-agent mapping table entry for pi (Principle V)
└── checklists/
    └── requirements.md  # Spec quality checklist (passing)
```

### Source Code (repository root)

```text
adapters/pi/
├── src/
│   ├── transcript.ts        # pi session entries → ConversationEntry[] (the only real logic)
│   └── index.ts             # default export: registers commands + lifecycle handlers, calls core
├── tests/
│   ├── transcript.test.ts   # translation unit tests (roles, order, structured blocks, skip-empty)
│   └── contract.test.ts     # 4 commands + 2 lifecycle handlers registered; reason mapping; neutrality
├── package.json             # depends on @checkpoint/core (file:../../core); pi SDK type-only dev dep
├── tsconfig.json
├── .prettierrc.json / .prettierignore
└── README.md                # what it is + install pointer (humans)
```

**Structure Decision**: A standalone pi extension directory under the existing `adapters/` tree
(matches Constitution `adapters/<agent>/`). The default-exported function is what pi invokes with
its `ExtensionAPI`; it wires handlers that call the core directly — no compiled CLI is invoked out
of process (the key shape difference from the Claude Code adapter). Tooling mirrors `core/` and
`adapters/claude-code/` so there is one mental model across the repo.

## Phase 0 — Research

See [research.md](./research.md). Key decisions: in-process extension (no bridge); inject a
`runGit` that delegates to `pi.exec` to preserve reference parity and avoid assuming
`child_process` availability in pi's runtime; read the live `sessionManager` entries for both
lifecycle capture and the manual command; let the core own all reason/gating/dedup decisions.

## Phase 1 — Design

- [data-model.md](./data-model.md) — pi session-manager entry → `ConversationEntry` translation
  rules (the skip-empty correctness rule, block mapping, order preservation).
- [contracts/commands.md](./contracts/commands.md) — the command + lifecycle surface and its
  delegation to the core, with testable invariants.
- [contracts/agent-mapping.md](./contracts/agent-mapping.md) — the pi row of the per-agent mapping
  table, capability gaps, and add-an-agent checklist status.
- [quickstart.md](./quickstart.md) — build + smoke-test validation guide.

## Complexity Tracking

No constitution violations; nothing to justify.
