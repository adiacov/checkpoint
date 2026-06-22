# STATE.md

Single canonical current-context entrypoint for this repository.

## Current status

**Feature 1 — shared core (`001-shared-core`): DONE and merged to `main`.**

The agent-neutral checkpoint engine lives in `core/` (`@checkpoint/core`):

- Capabilities: `optIn`, `disable`, `status`, `sessionStart`, `capture`, `detectProject`.
- Captures git facts + recent conversation as Markdown into `sessions/pending/`; opt-in via
  tracked `.checkpoint.json`; skip-empty, stateless cross-process dedup, archive prune.
- Zero runtime deps, no agent SDK (enforced by test). 46 tests, build + lint clean.
- Ported from `reference/checkpoint.ts` with one documented deviation (stateless mtime dedup
  vs. the old in-memory global) — see `core/README.md` and `specs/001-shared-core/research.md`.

Verified working as an installed dependency (npm pack → consume in a temp project).

## Active work

None in progress. Pick the next feature from the backlog below.

## Next action — feature backlog

Build one at a time with spec-kit (`/speckit-specify`). Numbered to match future branch numbers
(core was `001`). Recommended order is top-to-bottom.

1. **Claude Code adapter** (`002`) — START HERE. Thin plugin: register `/checkpoint`,
   `/checkpoint-optin`, `/checkpoint-disable`, `/checkpoint-status`; hook session
   start/end (`SessionStart`/`SessionEnd`/`PreCompact`); translate Claude's transcript into the
   core's `ConversationEntry[]`; call the core. The only agent currently in use.
2. **Recovery / integration workflow** (`003`) — do right after the first adapter. Review
   `sessions/pending/`, persist durable bits into project memory, move processed files to
   `sessions/archive/`. The core deliberately never does this; without it, pending piles up and
   the archive-prune has nothing to prune. (WORKFLOWS.md already describes the manual version.)
3. **pi adapter** (`004`) — re-point the existing `~/.pi/.../checkpoint.ts` at the shared core
   instead of duplicating logic. Lowest risk (reference is vendored).
4. **Codex adapter** (`005`) — prompts (slash commands) + config `notify` for best-effort
   automatic capture.
5. **Install / distribution** (`006`) — symlink-from-repo (preferred) or copy+sync to place each
   adapter into its agent's extensions dir. May be folded into the Claude adapter the first time,
   then generalized here.

Non-features (do NOT build): global shell CLI, entry curation/summarization — both forbidden by
the constitution.

## Blockers

- None. Note: `main` is ahead of `origin/main` (unpushed) — push when ready.

## Relevant deeper docs

Read these only when relevant to the current task.

- `specs/001-shared-core/` — full spec, plan, contracts, data-model, tasks for the merged core.
- `core/README.md` — how the core works and how an adapter calls it.
- `.specify/memory/constitution.md` — non-negotiable architecture (core/adapter split, command
  surface, parity, add-an-agent discipline).
- `PROJECT.md` / `BRIEF.md` — stable identity and the transformation plan.
