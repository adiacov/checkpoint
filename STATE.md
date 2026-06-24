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

**Feature 2 — Claude Code adapter (`002-claude-code-adapter`): DONE and merged to `main`.**

A thin Claude Code plugin in `adapters/claude-code/` (`@checkpoint/claude-code`) wraps the core
with zero duplicated checkpoint logic (enforced by a neutrality test):

- Four slash commands (`/checkpoint`, `/checkpoint-optin`, `/checkpoint-disable`,
  `/checkpoint-status`) + `SessionStart`/`SessionEnd`/`PreCompact` hooks, all delegating to a thin
  Node bridge → the core.
- `SessionEnd`→`shutdown`, `PreCompact`→`reload` (reload-gating left to the core's `includeReload`),
  manual→`manual`, mirroring the pi reference's reasons.
- Only real logic is transcript translation (`src/transcript.ts`): Claude JSONL →
  `ConversationEntry[]`, incl. the `tool_result`-only → `role:"tool"` rule that keeps the core's
  skip-empty correct. 15 tests, build/typecheck/lint clean.
- Verified end-to-end against the core (bridge smoke: opt-in, auto-capture, dedup, pending notice,
  status, empty-skip, not-opted-in no-op).
- **Remaining gap**: in-TUI smoke test (`tasks.md` T031) not yet run — needs the plugin installed
  in a live Claude Code session (depends on the `006` install, or a manual dev install). Also
  unconfirmed until then: whether `$CLAUDE_PLUGIN_ROOT` is available to slash-command bash (it is
  for hooks per docs).

## Active work

None in progress. Pick the next feature from the backlog below (`003` is next).

## Next action — feature backlog

Build one at a time with spec-kit (`/speckit-specify`). Numbered to match future branch numbers
(core was `001`). Recommended order is top-to-bottom.

1. ~~**Claude Code adapter** (`002`)~~ — DONE (see Current status).
2. **Recovery / integration workflow** (`003`) — START HERE. Review
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
- `specs/002-claude-code-adapter/` — spec, plan, contracts (incl. the per-agent mapping table),
  data-model, tasks for the merged Claude Code adapter.
- `core/README.md` — how the core works and how an adapter calls it.
- `adapters/claude-code/README.md` — what the Claude Code plugin adds and how to build it.
- `.specify/memory/constitution.md` — non-negotiable architecture (core/adapter split, command
  surface, parity, add-an-agent discipline).
- `PROJECT.md` / `BRIEF.md` — stable identity and the transformation plan.
