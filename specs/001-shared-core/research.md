# Research: Shared Checkpoint Core

**Feature**: 001-shared-core | **Date**: 2026-06-20

Phase 0 resolves the open technical decisions for extracting the reference pi extension
(`~/.pi/agent/extensions/checkpoint.ts`) into an agent-neutral core. There were no
`NEEDS CLARIFICATION` markers in Technical Context; the items below are the deliberate design
decisions that ground the plan.

## D1. Agent-neutrality via dependency injection

- **Decision**: The core imports only Node built-ins. Two agent-specific concerns are passed
  in by the caller: (a) a git **command runner** `(cmd, args) => Promise<{code,stdout,stderr}>`,
  and (b) the already-extracted **conversation entries** array. The core never imports a pi,
  Claude, or Codex package.
- **Rationale**: Constitution Principle I and FR-001. The reference reaches into
  `pi.exec(...)` and `ctx.sessionManager.getBranch()`; both are the only agent touchpoints
  (confirmed by reading the 459-line source). Injecting them keeps the seam thin and testable.
- **Alternatives considered**: (a) Core shells out to `git` directly with `node:child_process`
  — rejected as default because adapters may already have a sandboxed exec; instead the core
  ships a default `child_process` runner but accepts an injected one. (b) Core parses the
  transcript itself — rejected: transcript shape is agent-specific (pi `sessionManager` vs
  Claude JSONL), so normalization belongs in adapters.

## D2. Dedup detection — stateless mtime scan (intentional deviation from reference)

- **Decision**: Detect a "recent previous capture" by reading the **newest checkpoint file's
  mtime in `pending/`** and suppressing if `(now - mtime) < dedupWindow`
  (`MIN_SECONDS_BETWEEN_AUTOMATIC_CHECKPOINTS`, default 20s).
- **Rationale**: Spec clarification (Session 2026-06-20) and FR-006. Stateless and
  cross-process safe; works when two agents end sessions in the same repo.
- **Parity note (FR-015)**: The reference uses an in-memory module global
  `lastAutomaticCheckpoint` keyed by `{root, reason}`, which only dedups within one running
  process and is lost on restart. This is the **one intentional behavior change** in the
  extraction. Consequence: dedup no longer keys on `reason`; any capture within the window is
  suppressed. Accepted because cross-process correctness matters more than per-reason
  granularity for a single-user tool. Documented here per the constitution's parity rule.
- **Alternatives considered**: in-memory global (reference — not portable across adapters/
  processes); `config.updatedAt` comparison (mutates tracked config on every capture — noisy
  git diffs). Both rejected in the spec clarification.

## D3. Config: agent-neutral `.checkpoint.json` with legacy fallback

- **Decision**: Canonical config is `.checkpoint.json` at the git root. On load, if it is
  absent, read legacy `.pi/checkpoint.json`. `normalizeConfig` applies defaults and clamps
  (positive integers, safe relative dirs rejecting absolute/`..`). Writes always go to the
  canonical path.
- **Rationale**: FR-008/FR-009, BRIEF decision #4. Preserves the reference's normalization
  (ported verbatim) while migrating the filename.
- **Defaults (match reference)**: `recentEntries=24`, `maxTextPerEntry=4000`,
  `maxArchivedCheckpoints=50`, `dedupWindow=20s`, `includeReload=false`,
  `skipEmptySessions=true`, `pendingDir=sessions/pending`, `archiveDir=sessions/archive`,
  `version=1`.
- **Alternatives considered**: machine-local/ignored config — rejected (BRIEF keeps opt-in
  tracked in git so tuning travels with the repo); single hardcoded location with no legacy
  read — rejected (breaks transition for existing pi projects).

## D4. Git facts collection and non-repo degradation

- **Decision**: Run `git branch --show-current`, `git status --short`, `git diff --stat`,
  `git log --oneline -5` in parallel through the injected runner. Project root resolved via
  `git rev-parse --show-toplevel`, falling back to `cwd` when not a repo. Non-zero exits map
  to safe fallbacks ("unknown"/"none"/"clean") rather than throwing.
- **Rationale**: FR-002, edge case "not a git repository". Ported from `gitFactsMarkdown` and
  `safeOutput` in the reference.
- **Alternatives considered**: a git library (e.g. isomorphic-git) — rejected (adds a runtime
  dependency, violating the zero-dependency constraint; subprocess matches the reference).

## D5. Checkpoint identity / filename uniqueness

- **Decision**: Filename = `${ISO-timestamp-with :. replaced by -}-${safeReason}.md` in
  `pending/`, matching the reference. To close the collision edge case, if the target path
  already exists, append a short numeric suffix (`-2`, `-3`, …) until unique.
- **Rationale**: Edge case "clock skew / identical timestamps"; reference used the bare
  timestamp which could theoretically collide. Minimal, behavior-preserving hardening.
- **Alternatives considered**: random UUID suffix — rejected (less human-sortable; sort order
  matters for prune which sorts lexicographically).

## D6. Markdown format parity

- **Decision**: Reproduce the reference body exactly: `# Pending Session Checkpoint`, the
  Time/Reason/Project root/CWD/Session-file header lines, the `## Integration note`, the
  `## Git facts` block, and `## Recent conversation` with per-entry `### role — timestamp`
  sections. Thinking blocks → `[thinking omitted]`; tool calls → `[tool call: name] {args}`;
  images → `[image omitted]`; truncation appends `[truncated N chars]`.
- **Rationale**: FR-003/FR-004, FR-015 parity. Existing recovery instructions in `WORKFLOWS.md`
  read this format.
- **Adapter seam**: the "Session file" value and the raw entries are caller-supplied; the core
  formats whatever normalized entries it receives.

## D7. Disable / status / startup semantics (from clarifications)

- **Decision**: `disable` sets `enabled=false` only, preserving dirs/ignore/checkpoints
  (FR-017). `status` returns enabled state, resolved pending/archive dirs, pending count, and
  archived count (FR-018). `sessionStart` prunes the archive to max and returns the pending
  count (FR-012/FR-013); it never moves files pending→archive (owned by the recovery workflow).
- **Rationale**: Spec clarifications, matching the reference's `checkpoint-disable`,
  `formatStatus`, and `session_start` handlers.

## D8. Testing strategy

- **Decision**: `node:test` via `tsx`. Git-dependent tests use real `git init` temp-dir
  fixtures; git-facts unit tests inject a fake runner for deterministic output and non-repo
  paths. Filesystem tests run against `mkdtemp` temp roots and assert files/ignore rules/prune.
- **Rationale**: FR-015 parity is verified behaviorally; deterministic and offline per
  ENGINEERING.md ("fast, deterministic tests").
- **Alternatives considered**: mocking `node:fs` — rejected (real temp dirs are simpler and
  catch path-handling bugs).

## Open items carried to tasks

- Exact `package.json`/`tsconfig.json` field values (tooling detail, decided in implementation).
- Whether to publish declaration files now or when the first adapter consumes the core
  (default: emit `.d.ts` so adapters get types immediately).
