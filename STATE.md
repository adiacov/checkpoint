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

**Feature 5 — Codex adapter (`005-codex-adapter`): DONE (on branch `005-codex-adapter`, not yet merged).**

Brings checkpoint to the Codex CLI as a thin **bridge** (the Claude Code pattern: a compiled Node
CLI invoked externally) in `adapters/codex/` (`@checkpoint/codex`), zero duplicated checkpoint logic
(neutrality test enforced). Codex's surface is the thinnest of the three, so automatic capture is
explicitly **best-effort** and every gap is documented, not emulated:

- **Commands**: four Codex custom prompts (`prompts/*.md`, `name.md`→`/name`) that instruct the
  agent to run the bridge subcommand (`manual`/`optin`/`disable`/`status`) via its shell and report
  output. Prompt-only (best-effort), and custom prompts are OpenAI-deprecated in favor of skills
  (documented; skills would invoke the same bridge).
- **Auto-capture**: Codex's `config.toml` `notify` program on `agent-turn-complete` (the **only**
  automation event) → `capture(reason:"turn-complete")`, dedup-bounded. `config.example.toml` ships
  the snippet. No session-start/end/pre-compact event exists → those are documented gaps
  (`/checkpoint-status` is the on-demand stand-in for the missing start notice).
- **Bridge** (`src/index.ts` dispatch + `src/bridge.ts`): subcommands `notify | manual | optin |
  disable | status | archive`; `notify` is lifecycle-class (always exit 0, never throws). Reuses the
  shared subcommand handlers thinly; single runtime dependency `@checkpoint/core`.
- **Transcript** (`src/transcript.ts`): primary = the `agent-turn-complete` payload (stable,
  guarantees a real user message for skip-empty); manual command = best-effort newest Codex rollout
  JSONL (`~/.codex/sessions/**/rollout-*.jsonl`, tolerant parser, degrades to git-facts-only).
- 19 tests green (transcript + contract/neutrality + scripted smoke); build/typecheck/lint clean.
  Externally verified against current OpenAI Codex docs. Full spec-kit artifacts in
  `specs/005-codex-adapter/`.
- **Remaining gap**: in-Codex prompt-driven smoke test (`tasks.md` T024) not yet run — needs the
  prompts + notify snippet in a live Codex install (depends on `006`, or a manual dev install). The
  full bridge/core path is verified via the scripted smoke test.

This completes all three originally-planned adapters (constitution ship order: core → Claude → pi →
Codex).

**Feature 6 — install / distribution (`006-install-distribution`): DONE and merged to `main`.**

A single dependency-free Node ESM installer `scripts/install.mjs` (verbs `install` / `uninstall` /
`status`) that places each adapter from this repo into its agent's load location. Contains **no**
checkpoint logic (Constitution I) — it only places/links files and wires two documented edits.

- **Default symlink-from-repo**, `--mode copy` fallback; `--agent claude|pi|codex|all`, `--dry-run`,
  `--force`, `--no-build`, and a `--target-root <agent=path>` test override. Builds an adapter when
  its `dist/` is missing/stale (core first); `--no-build` requires an existing `dist/`.
- **Per-agent placement**: pi → symlink the package dir to `~/.pi/agent/extensions/checkpoint` (deps
  travel with it); Codex → symlink `prompts/*.md` into `~/.codex/prompts/` **and** insert a managed
  `notify` line into `~/.codex/config.toml`'s root table (before the first `[table]` header) with the
  bridge path resolved absolute and a sentinel comment; Claude → register this repo as a local
  marketplace (new repo-root `.claude-plugin/marketplace.json`) in `known_marketplaces.json` + enable
  the `checkpoint` plugin in `settings.json`.
- **Safe & reversible**: idempotent (re-run → `no-op`); conflict-stops on user content (incl. the
  legacy pi `checkpoint.ts`) unless `--force`; uninstall removes exactly what it created (tracked via
  a git-ignored per-machine `.install/manifest.json` + repo-pointing-symlink check + the sentinel),
  preserving unrelated config byte-intact; best-effort across adapters; dry-run mutates nothing.
- 12 tests green (`tests/install/*.test.mjs`), all against a temp `$HOME` — the real `~/.pi`,
  `~/.codex`, `~/.claude` are never touched. Verified live via `--dry-run` against the real homedir.
  Full spec-kit artifacts in `specs/006-install-distribution/`.
- **Residual (confirm at the unblocked smoke tests)**: the exact Claude enabled-plugins key
  (`002` T031) and whether pi loads a directory-form extension vs. only top-level `*.ts` (`004` T023;
  bundle fallback documented). research.md Decisions 3–4.

**Feature 7 — config single-source migration (`007-config-migration`): DONE (on branch, not yet merged).**

Consolidates every project to the canonical `.checkpoint.json`, removing the legacy
`.pi/checkpoint.json` second source of truth. Two pieces, no config logic duplicated (Constitution I):

- **Core capability** `migrateConfig(root, { apply })` (`core/src/migrate.ts`, exported from
  `index.ts`): classifies a directory (`not-configured` / `already-canonical` / `migrated` /
  `redundant-legacy-removed` / `failed`) and, on apply, writes canonical from the legacy settings
  (reusing `loadConfig`/`normalizeConfig`/`writeConfig`, so enabled/disabled + tuning + `createdAt`
  are preserved) **before** removing legacy — never removing legacy if the write fails (no data
  loss). Both-present → canonical kept byte-unchanged, only legacy removed. Dry-run mutates nothing.
- **Sweep script** `scripts/migrate-configs.mjs` (dependency-free ESM, mirrors `install.mjs`):
  discovers immediate children of `--root` (default = this repo's parent), reports per project, and
  applies only under `--apply`. Never commits; skips dirty git repos (unless `--force`); enforces the
  **004/006 ordering guard** — refuses to delete legacy while the old pi reference (`checkpoint.ts`)
  is installed and the shared-core pi adapter (`checkpoint`) is not, unless `--force`.
- 68 core tests (incl. `migrate.test.ts`) + 6 sweep tests green (all against temp trees; real sibling
  projects and `~/.pi` never touched); core build/typecheck/lint clean. Verified live via dry-run
  against the real sibling tree (the guard correctly blocks deletions today because the legacy pi
  reference is still installed). Full spec-kit artifacts in `specs/007-config-migration/`.

## Active work

None in progress. The originally-planned feature set (001–007) is complete. Next: run the unblocked
in-agent smoke tests (002 T031, 004 T023, 005 T024) via a real install, and — once the shared-core pi
adapter is installed (`scripts/install.mjs install --agent pi`) — run the config sweep for real
(`node scripts/migrate-configs.mjs --apply`). Merge `007` to `main`.

## Next action — feature backlog

Build one at a time with spec-kit (`/speckit-specify`). Numbered to match future branch numbers
(core was `001`). Recommended order is top-to-bottom.

1. ~~**Claude Code adapter** (`002`)~~ — DONE (see Current status).
2. ~~**Recovery / integration workflow** (`003`)~~ — DONE (see Current status).
3. ~~**pi adapter** (`004`)~~ — DONE (see Current status).
4. ~~**Codex adapter** (`005`)~~ — DONE (see Current status).
5. ~~**Install / distribution** (`006`)~~ — DONE (see Current status). `scripts/install.mjs`
   symlink/copy-installs all three adapters; unblocks the deferred in-agent smoke tests
   (002 T031, 004 T023, 005 T024), which are now the next concrete action.
6. ~~**Config single-source migration** (`007`)~~ — DONE (see Current status). `core/src/migrate.ts`
   `migrateConfig` + `scripts/migrate-configs.mjs` sweep consolidate projects to canonical
   `.checkpoint.json`, dry-run by default, with the 004/006 ordering guard. The Phase-007 open
   questions below were resolved in `specs/007-config-migration/spec.md` (Clarifications).

The originally-planned roadmap (001–007) is complete. No further features are queued; remaining work
is operational (run the in-agent smoke tests, then the config sweep for real) and merging `007`.

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
- `specs/005-codex-adapter/` — spec, plan, contracts (Codex agent-mapping row + best-effort gaps),
  data-model, tasks for the Codex adapter.
- `core/README.md` — how the core works and how an adapter calls it.
- `adapters/claude-code/README.md` — what the Claude Code plugin adds and how to build it.
- `adapters/pi/README.md` — what the pi extension adds, how it differs from the Claude Code adapter,
  and how to build it.
- `adapters/codex/README.md` — what the Codex bridge adds, its best-effort gaps, and how to build it.
- `specs/006-install-distribution/` — spec, plan, research (per-agent placement decisions + residual
  smoke-test items), data-model, CLI contract, quickstart for the installer.
- `scripts/install.mjs` — the installer itself (install/uninstall/status); `tests/install/` its tests.
- `specs/007-config-migration/` — spec, plan, research, data-model, CLI contract, quickstart for the
  config sweep.
- `core/src/migrate.ts` — the `migrateConfig` capability; `scripts/migrate-configs.mjs` — the
  cross-project sweep; `tests/migrate/` its tests.
- `.specify/memory/constitution.md` — non-negotiable architecture (core/adapter split, command
  surface, parity, add-an-agent discipline).
- `PROJECT.md` / `BRIEF.md` — stable identity and the transformation plan.
