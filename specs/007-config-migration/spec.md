# Feature Specification: Config Single-Source Migration

**Feature Branch**: `007-config-migration`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Config single-source migration (007): make root `.checkpoint.json` the single source of truth across all projects. Scan sibling directories for ones still using the legacy `.pi/checkpoint.json`, and for each: merge the legacy config into `.checkpoint.json` (preserving settings, the same `...existing` merge `optIn` does), then remove `.pi/checkpoint.json`. The legacy-delete is only safe after `004` re-points pi at the shared core. The merge logic lives once in the core; the cross-project sweep is a one-off maintenance script (NOT a global PATH CLI). Default to dry-run; modify other repos' working trees only, never auto-commit them."

## Clarifications

### Session 2026-06-24

Resolved by the maintainer's standing instruction to apply best judgment; recorded here for traceability.

- Q: What form/scope does the sweep take? → A: A single repository-local Node script `scripts/migrate-configs.mjs` (no PATH binary, no slash command). Default scan root = the **parent directory of this repo** (immediate sibling projects); `--root <path>` overrides. Legacy detection is at each project's **root only** (`<dir>/.pi/checkpoint.json`), not nested.
- Q: How is the `004` ordering gate enforced (don't delete legacy while the old pi extension still reads it)? → A: The merge **always writes canonical before removing legacy**, and the sweep runs a one-time precondition guard: if the legacy pi reference (`~/.pi/agent/extensions/checkpoint.ts`) is present AND the shared-core pi adapter (`~/.pi/agent/extensions/checkpoint`, installed by `006`) is absent, the sweep refuses to delete legacy files unless `--force`. This makes the `004`/`006` precondition operative, not just documented.
- Q: Safety defaults? → A: Dry-run by default (report planned actions, change nothing); `--apply` performs writes. Never auto-commits any repo. In `--apply`, a sibling that is a git repo with a **dirty** working tree is skipped and reported (so the migration stays an isolated, reviewable change) unless `--force`; clean git repos and non-git dirs are migrated and reported.
- Q: What qualifies, and precedence when both files exist? → A: Any project-root dir with a legacy `.pi/checkpoint.json` qualifies. Disabled configs migrate too (the disabled state is preserved). When **both** `.checkpoint.json` and `.pi/checkpoint.json` exist, the canonical file **wins** (left byte-untouched) and the legacy file is removed.
- Q: Where does the merge logic live? → A: In the **core** (`@checkpoint/core`), as a single per-directory `migrateConfig(root, { apply })` reusing the existing `loadConfig` / `normalizeConfig` / `writeConfig`. The script only does discovery, git-dirty checks, the precondition guard, and reporting — zero config logic duplicated (Constitution I).

## User Scenarios & Testing *(mandatory)*

Across the maintainer's machine, projects were opted into checkpointing at different times: older
ones via the pi-era `.pi/checkpoint.json`, newer ones via the agent-neutral `.checkpoint.json`. The
core already reads both, but the legacy file is a lingering second source of truth. Now that pi has
been re-pointed at the shared core (`004`) and the adapters are installable (`006`), the legacy files
can be safely consolidated. This feature is a one-shot, safe, reviewable migration that leaves every
project with a single canonical `.checkpoint.json`.

The "user" is the maintainer running a one-off cleanup on their own machine. It is not a runtime
feature and exposes no new agent command.

### User Story 1 - Preview the migration across all projects (Priority: P1)

The maintainer runs the sweep with no flags and sees, per discovered project, exactly what *would*
happen — migrate (legacy→canonical + remove legacy), remove-redundant-legacy (both present), already
canonical, or not configured — without anything on disk changing. This is the default (dry-run).

**Why this priority**: A migration that edits files across many sibling repos must be previewable
before it touches anything. Dry-run is the safe default and the foundation everything else builds on.

**Independent Test**: Point the sweep at a temp tree containing a mix of legacy-only, both-present,
canonical-only, and unconfigured dirs; confirm the report classifies each correctly and no file on
disk is created, modified, or deleted.

**Acceptance Scenarios**:

1. **Given** sibling projects in mixed config states, **When** the maintainer runs the sweep with no
   flags, **Then** it prints a per-project planned action and a summary, and changes nothing on disk.
2. **Given** a project with only `.pi/checkpoint.json`, **When** previewed, **Then** it is reported
   as a planned "migrate" (write canonical, remove legacy).
3. **Given** a project with both files, **When** previewed, **Then** it is reported as planned
   "remove redundant legacy" (canonical kept).

---

### User Story 2 - Apply the migration, preserving settings (Priority: P1)

With `--apply`, the maintainer performs the migration: each legacy-only project gets a canonical
`.checkpoint.json` carrying its existing settings (including a disabled state and original
timestamps), and its `.pi/checkpoint.json` is removed. Projects already canonical are untouched.

**Why this priority**: This is the actual goal — eliminating the legacy second source of truth. It
must preserve each project's configured behavior exactly (no project silently re-enabled, retuned,
or reset).

**Independent Test**: In a temp tree, run with `--apply`; confirm legacy-only dirs now have a
canonical file equal (after normalization) to the legacy settings, the legacy file is gone, a
disabled legacy config stays disabled, and canonical-only dirs are byte-unchanged.

**Acceptance Scenarios**:

1. **Given** a legacy-only project, **When** the maintainer runs `--apply`, **Then** a canonical
   `.checkpoint.json` is written with the legacy settings preserved and `.pi/checkpoint.json` is
   removed.
2. **Given** a legacy config with `enabled:false` and custom tuning, **When** migrated, **Then** the
   canonical file is also disabled and retains the custom tuning.
3. **Given** a project with both files, **When** `--apply` runs, **Then** the legacy file is removed
   and the canonical file is left byte-for-byte unchanged.
4. **Given** an already-migrated project (canonical only), **When** `--apply` runs again, **Then**
   nothing changes (idempotent).

---

### User Story 3 - Safe-by-default across many repos (Priority: P2)

The sweep protects the maintainer's other repositories: it never commits anything, it skips git
repos with uncommitted changes (so its edits don't tangle with work-in-progress), and it refuses to
delete legacy files while the old pi extension that still reads them is the one installed — unless
explicitly forced.

**Why this priority**: The sweep writes into *other* projects' working trees. Without these guards a
single run could mix into unrelated WIP or break a project whose installed pi still depends on the
legacy file. The core migrate + preview (US1/US2) are usable before every guard exists, so this is
P2, but it is required before the sweep is run for real.

**Independent Test**: Create a dirty git sibling and a clean one; confirm `--apply` skips the dirty
one (reported) and migrates the clean one. Simulate "legacy pi installed, shared-core pi absent" and
confirm the sweep refuses to delete legacy without `--force`.

**Acceptance Scenarios**:

1. **Given** a sibling git repo with uncommitted changes, **When** `--apply` runs, **Then** that
   repo is skipped and reported (not modified), and `--force` includes it.
2. **Given** the legacy pi extension installed and the shared-core pi adapter absent, **When** the
   sweep would delete legacy files, **Then** it refuses with a clear message unless `--force`.
3. **Given** any run, **When** it completes, **Then** no repository has been committed to by the
   tool.

---

### Edge Cases

- **No projects found / empty scan root** → report "nothing to migrate" and exit success.
- **Unreadable or malformed legacy JSON** → report that project as an error and skip it; continue
  with the rest (best-effort), never aborting the whole sweep.
- **Legacy file but the `.pi/` dir holds other content** → remove only `.pi/checkpoint.json`, leave
  the rest of `.pi/` intact.
- **Permission denied writing canonical / removing legacy** → report the project as failed; do not
  remove legacy if canonical could not be written (never lose the only copy).
- **Scan root is not a directory / does not exist** → clear usage error.
- **The current repo appears among siblings** → handled like any other (skipped if not legacy-configured).
- **Re-run after a completed migration** → every project reports already-canonical / not-configured;
  no changes (idempotent).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a repository-local maintenance script that discovers projects
  under a scan root (default: this repo's parent directory; `--root` overrides) and reports, per
  project, the migration action that applies.
- **FR-002**: For a project with only the legacy `.pi/checkpoint.json`, the system MUST write a
  canonical `.checkpoint.json` preserving the legacy settings, then remove the legacy file.
- **FR-003**: The migration MUST preserve a project's configured behavior — including a disabled
  state and original `createdAt` — and MUST NOT silently re-enable, retune, or reset a project.
- **FR-004**: For a project with BOTH files, the canonical file MUST win (left byte-unchanged) and
  the legacy file MUST be removed.
- **FR-005**: The system MUST default to dry-run (report only); an explicit `--apply` is REQUIRED to
  change any file.
- **FR-006**: The system MUST NOT commit to any repository, ever.
- **FR-007**: In `--apply`, the system MUST skip and report a sibling git repo whose working tree is
  dirty (unless `--force`); clean git repos and non-git directories are migrated.
- **FR-008**: The system MUST enforce the `004`/`006` ordering: it MUST refuse to delete legacy files
  when the legacy pi extension is installed and the shared-core pi adapter is not, unless `--force`.
- **FR-009**: The migration MUST write the canonical file before removing the legacy file, and MUST
  NOT remove the legacy file if writing canonical failed (no data loss).
- **FR-010**: The system MUST be idempotent — re-running over already-migrated projects changes
  nothing and reports them as already-canonical / not-configured.
- **FR-011**: The system MUST be best-effort across projects — a malformed/unreadable/permission-
  denied project is reported and skipped without aborting the rest.
- **FR-012**: Every run MUST report per-project the project path and the action
  (migrated / removed-redundant-legacy / already-canonical / not-configured / skipped / failed) plus
  a summary; dry-run output MUST match what `--apply` would do.
- **FR-013**: The per-directory merge/remove logic MUST live once in `@checkpoint/core`, reusing the
  existing config load/normalize/write; the script MUST NOT duplicate config logic (Constitution I).
- **FR-014**: The system MUST NOT introduce a global `PATH` binary or an in-agent command, and MUST
  NOT curate or read checkpoint content (constitution non-goals preserved).

### Key Entities *(include if feature involves data)*

- **Project (scan target)**: a directory under the scan root that may hold `.checkpoint.json`
  and/or `.pi/checkpoint.json`, optionally a git repo with a clean/dirty working tree.
- **Migration result (per project)**: the classified action, the canonical/legacy paths, and whether
  canonical was written / legacy removed (the unit the report and idempotency build on).
- **Sweep report**: the aggregate of per-project results plus a summary, identical in shape between
  dry-run and apply.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After one `--apply` run over a tree of legacy-configured projects, every project has a
  single canonical `.checkpoint.json` and zero `.pi/checkpoint.json` files remain (for those that
  qualified and were not safety-skipped).
- **SC-002**: Each migrated project's effective configuration (enabled/disabled and all tuning) is
  identical before and after migration.
- **SC-003**: A dry-run changes nothing on disk while listing exactly the actions an `--apply` would
  take.
- **SC-004**: Re-running `--apply` after completion produces zero file changes (idempotent).
- **SC-005**: No repository is ever committed to by the tool, and no dirty git repo is modified
  without `--force`, in 100% of runs.
- **SC-006**: No project ever loses its configuration — the legacy file is never removed unless the
  canonical file was successfully written, in 100% of cases.

## Assumptions

- **Audience is the maintainer** running a one-off local cleanup; not a runtime feature, no agent
  command, no registry/network involvement.
- **`004` is satisfied** (pi reads canonical via the shared core) and `006` can install the
  shared-core pi adapter; the precondition guard (FR-008) operationalizes this rather than assuming
  it blindly.
- **The script is a single dependency-free Node ESM file** (`scripts/migrate-configs.mjs`), run from
  the repo, consistent with `006`'s installer and the constitution non-goals.
- **Scan is one level deep** (immediate children of the scan root), legacy detection at each
  project root; deeper/nested discovery is out of scope for v1.
- **Git-dirtiness is determined per sibling** via its own working-tree status; non-git siblings are
  migrated (no commit concern) and reported as such.
- **Scan root is overridable** so automated tests run against temporary trees and never touch the
  maintainer's real sibling projects.
