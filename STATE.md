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

**Feature 3 — recovery / integration workflow (`003-recovery-workflow`): DONE (on branch, not yet merged).**

Builds the back half of the lifecycle the core deliberately omits, split along Principle III:

- **Mechanical (core):** new standalone `archive(cwd, names?, deps?)` capability — moves checkpoints
  pending→archive then reuses `pruneArchive`. Explicit file list or all-pending (`*.md` only, never
  `.gitkeep`); idempotent + collision-safe (skip-and-report `already-archived`, never overwrites/loses);
  batch-resilient; returns `ArchiveResult { moved, skipped, errors, prunedCount }`; never reads file
  content. Lives in `store.ts` (`archiveCheckpointFiles`) + `api.ts` (`archive`). 61 core tests green.
- **Workflow (docs):** `WORKFLOWS.md` "Pending checkpoint handling" is now the single authoritative
  recovery procedure (start-of-session step 3 points to it, no duplicate); the file-move step is
  mechanized via the `archive` op, curation stays the agent's job.
- **Adapter:** Claude Code bridge gains `runArchive`/`formatArchive` + an `archive` CLI subcommand
  (NOT a fifth slash command — four-command surface preserved). Zero duplicated move/prune logic
  (contract/neutrality test extended). 18 adapter tests green. End-to-end bridge smoke verified
  (status → targeted+missing archive → all → idempotent no-op).

Specs in `specs/003-recovery-workflow/`. Build/lint/typecheck clean in both packages.

**Feature 4 — pi adapter (`004-pi-adapter`): DONE (on branch `004-pi-adapter`, not yet merged).**

Re-points the pi extension at the shared core, replacing the vendored `reference/checkpoint.ts`
logic. A thin, **in-process** pi extension in `adapters/pi/` (`@checkpoint/pi`) with zero duplicated
checkpoint logic (neutrality test enforced):

- A single default-export module (`src/index.ts`) registers the four commands (`checkpoint`,
  `checkpoint-optin`, `checkpoint-disable`, `checkpoint-status`) and the `session_start` /
  `session_shutdown` handlers via pi's `ExtensionAPI`, each delegating to the core. No bridge CLI,
  no markdown commands, no `hooks.json` (pi runs extensions in-process — the key shape difference
  from the Claude Code adapter).
- Only real logic is transcript translation (`src/transcript.ts`): pi's live `sessionManager`
  entries → the core's `ConversationEntry[]` (string/array/bashExecution forms; block mapping). No
  `user→tool` remap needed (pi has no tool-result-as-user convention).
- Git runs through `pi.exec` (injected as the core's `runGit`), preserving reference behavior;
  `session_shutdown` passes the reason straight to the core so reload-gating/skip-empty/dedup stay
  the core's.
- Canonical command rename documented (`checkpoint-enable` → `checkpoint-optin`, Principle II —
  name only, behavior unchanged). Legacy `.pi/checkpoint.json` still works via the core.
- Type boundary: a minimal local `ExtensionAPI` shim (`src/pi-types.ts`) keeps `@checkpoint/core`
  the single runtime dependency and the build hermetic; swappable for the real pi SDK at install.
- 22 tests green (transcript + contract/neutrality + scripted smoke incl. legacy config);
  build/typecheck/lint clean. Full spec-kit artifacts in `specs/004-pi-adapter/`.
- **Remaining gap**: in-TUI smoke test (`tasks.md` T023) not yet run — needs the extension in a
  live pi session (depends on `006` install, or a manual dev install). The full core path is
  verified via the scripted handler smoke test.

## Active work

None in progress. Next: merge `004-pi-adapter` to `main`, then pick `005` (Codex adapter) from the
backlog.

## Next action — feature backlog

Build one at a time with spec-kit (`/speckit-specify`). Numbered to match future branch numbers
(core was `001`). Recommended order is top-to-bottom.

1. ~~**Claude Code adapter** (`002`)~~ — DONE (see Current status).
2. ~~**Recovery / integration workflow** (`003`)~~ — DONE (see Current status).
3. ~~**pi adapter** (`004`)~~ — DONE (see Current status).
4. **Codex adapter** (`005`) — START HERE. Prompts (slash commands) + config `notify` for
   best-effort automatic capture.
5. **Install / distribution** (`006`) — symlink-from-repo (preferred) or copy+sync to place each
   adapter into its agent's extensions dir. May be folded into the Claude adapter the first time,
   then generalized here.
6. **Config single-source migration** (`007`) — **DEPENDS ON `004`.** Make root `.checkpoint.json`
   the single source of truth across *all* projects. Scan sibling directories for ones still using
   the legacy `.pi/checkpoint.json`, and for each: merge the legacy config into `.checkpoint.json`
   (preserving settings, the same `...existing` merge `optIn` does), then remove `.pi/checkpoint.json`.
   The legacy-delete is only safe **after** `004` re-points pi at the shared core (deleting it while
   the old pi extension is installed makes pi inert for that project — a regression). The merge logic
   lives once in the core; the cross-project sweep is a one-off maintenance script (NOT a global
   PATH CLI — see non-features). Default to dry-run; modify other repos' working trees only, never
   auto-commit them. Open design questions captured in "Phase 007 — open questions" below.

Non-features (do NOT build): global shell CLI, entry curation/summarization — both forbidden by
the constitution.

### Phase 007 — open questions (resolve at `/speckit-specify` time)

1. **Scan scope/root**: "sibling directories" = the immediate children of the current project's
   parent dir (`../*`)? Configurable root + max depth? How deep do we look for `.pi/checkpoint.json`
   (root-only, or nested)?
2. **Ordering gate**: confirmed dependency on `004` — must not delete `.pi/checkpoint.json` until pi
   reads the canonical file, else pi regresses. How do we verify/assert pi has been migrated before
   the sweep deletes (e.g. require a flag, or just document the precondition)?
3. **Invocation vs. "no global CLI"**: the sweep is cross-project, so it's a one-off maintenance
   script run from this repo (e.g. `scripts/migrate-configs.mjs`), not a PATH-installed CLI and not
   an in-agent slash command. Confirm this shape stays within the non-features boundary.
4. **Safety defaults**: default to dry-run (report planned merges/deletes), require an explicit
   `--apply`; never auto-commit other repos; skip + report dirty/non-git siblings.
5. **What qualifies for migration**: only dirs with `.pi/checkpoint.json`? Migrate disabled configs
   too? Precedence when a dir already has BOTH files (canonical wins, then delete legacy)?
6. **Idempotency**: already-migrated dirs are skipped and reported; re-runs change nothing.

## Blockers

- None. Note: `main` is ahead of `origin/main` (unpushed) — push when ready.

## Relevant deeper docs

Read these only when relevant to the current task.

- `specs/001-shared-core/` — full spec, plan, contracts, data-model, tasks for the merged core.
- `specs/002-claude-code-adapter/` — spec, plan, contracts (incl. the per-agent mapping table),
  data-model, tasks for the merged Claude Code adapter.
- `specs/004-pi-adapter/` — spec, plan, contracts (pi agent-mapping row), data-model, tasks for the
  pi adapter.
- `core/README.md` — how the core works and how an adapter calls it.
- `adapters/claude-code/README.md` — what the Claude Code plugin adds and how to build it.
- `adapters/pi/README.md` — what the pi extension adds, how it differs from the Claude Code adapter,
  and how to build it.
- `.specify/memory/constitution.md` — non-negotiable architecture (core/adapter split, command
  surface, parity, add-an-agent discipline).
- `PROJECT.md` / `BRIEF.md` — stable identity and the transformation plan.
