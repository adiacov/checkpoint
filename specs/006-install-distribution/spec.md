# Feature Specification: Install / Distribution

**Feature Branch**: `006-install-distribution`

**Created**: 2026-06-24

**Status**: Draft

**Input**: User description: "Install / distribution (006): a mechanism to install each adapter (Claude Code plugin, pi extension, Codex bridge + prompts) from this repo into its agent's extensions/config location. Preferred approach: symlink-from-repo so the repo stays the single source of truth (per constitution), with copy+sync as a documented fallback. Targets: pi -> ~/.pi/agent/extensions/; Claude Code -> its plugin dir; Codex -> ~/.codex/prompts/ plus config.toml `notify` snippet, resolving the Codex bridge `<BRIDGE>` path. Must build adapters first where needed (dist/), be idempotent, support uninstall, default-safe, and report what it did. Unblocks the deferred in-agent smoke tests for all three adapters (002 T031, 004 T023, 005 T024). Non-features: no global PATH binary; not a memory curator."

## Clarifications

### Session 2026-06-24

Resolved by the maintainer's standing instruction to apply best judgment; recorded here for traceability.

- Q: What form does the installer take? → A: A single repository-local Node script (e.g. `scripts/install.mjs`) with verbs (`install` / `uninstall`) and flags (`--agent`, `--mode`, `--dry-run`, `--force`, target-root override). No global `PATH` binary (constitution non-goal preserved); matches the project's one-off-maintenance-script precedent.
- Q: Does install build adapters automatically? → A: Yes — when an adapter's `dist/` is missing or older than its `src/`, install runs that adapter's build before placing it; a `--no-build` flag skips and then requires an up-to-date `dist/` (else clear failure, no partial install).
- Q: How does the tool know which items it created (for safe uninstall and conflict detection)? → A: Three signals: (1) symlinks whose target resolves into this repo are tool-managed; (2) copy-mode installs and the Codex `notify` line are tracked in a per-machine install manifest stored under the repo (git-ignored); (3) the Codex `notify` line carries a sentinel comment marker. Anything at a target that is none of these is treated as user content (conflict-stop unless `--force`).
- Q: How are tests run without writing into the real `~/.pi`, `~/.codex`, `~/.claude`? → A: Every target root is overridable (e.g. a `--target-root`/env override), so automated tests install into temp directories and never touch the real home; the deferred in-agent smoke tests (002/004/005) are the only steps that use real agent locations and remain manual.
- Q: Exact per-agent placement mechanism (Claude Code local-plugin/marketplace model; pi single-`.ts`-file extensions and how it resolves `@checkpoint/core`; replacing the legacy `~/.pi/agent/extensions/checkpoint.ts` reference) → A: DEFERRED to plan/research — these are implementation mechanisms, not spec-level acceptance ambiguities. Flagged as the primary research items for `/speckit-plan`.

## User Scenarios & Testing *(mandatory)*

This repository is the single source of truth for all three adapters. Today there is no
sanctioned way to get an adapter from the repo into the place its agent loads it, so the
in-agent smoke tests deferred in features 002/004/005 stay blocked, and any manual install is
ad-hoc and undocumented. This feature provides one repeatable, safe, reversible install path.

The "user" here is the maintainer (the repo owner) installing the tool on their own machine — not
an end user pulling from a registry. Distribution = "from this working copy into my agents".

### User Story 1 - Install an adapter into its agent (Priority: P1)

The maintainer runs a single install action and an adapter becomes loadable by its agent, with the
repository remaining the source of truth. By default this uses a symlink from the agent's
extension/config location back into the repo, so future `git pull`/rebuild changes are picked up
without re-installing. The action first ensures the adapter is built (its `dist/` is present and
current) where the adapter requires a build.

Installing must be selectable per-agent (install just Claude Code, just pi, just Codex) and as
"all". For Codex specifically, installing also wires the `notify` program into the user's
`~/.codex/config.toml` with the adapter's bridge path resolved to a concrete absolute path (no
unresolved `<BRIDGE>` placeholder left behind).

**Why this priority**: This is the whole feature. Without it the three adapters cannot be exercised
in their real agents, and the project's deferred smoke tests (002 T031, 004 T023, 005 T024) stay
blocked. It is the minimum that delivers value.

**Independent Test**: Run the install for one adapter into a throwaway/test target location, then
confirm the agent's expected files exist at the target (resolving to the repo for symlink mode) and
that the agent would load them. For Codex, confirm `config.toml` contains a `notify` line pointing
at an existing built bridge file.

**Acceptance Scenarios**:

1. **Given** a clean machine with none of the adapters installed, **When** the maintainer installs
   all adapters, **Then** each agent's target location contains the adapter (Claude Code plugin, pi
   extension, Codex prompts) and Codex's `config.toml` has a working `notify` line, and the action
   reports exactly what it placed where.
2. **Given** the maintainer installs only one named adapter, **When** the action completes, **Then**
   only that adapter is installed and the others are untouched.
3. **Given** an adapter whose `dist/` is missing or stale, **When** the maintainer installs it,
   **Then** the adapter is built before being installed (or the install fails clearly telling the
   maintainer to build first), and no half-installed state is left.
4. **Given** symlink mode (the default), **When** install completes and the maintainer later changes
   the repo and rebuilds, **Then** the agent sees the new version with no re-install needed.

---

### User Story 2 - Uninstall an adapter (Priority: P1)

The maintainer can cleanly remove a previously installed adapter, restoring the agent's location to
its pre-install state. Uninstall removes only what this feature created (the symlink or copied
files, and the Codex `notify` line this feature added) and never deletes unrelated user content or
the repository itself.

**Why this priority**: Reversibility is part of "safe by default" and is needed to iterate on the
smoke tests (install → test → uninstall → fix → reinstall). A one-way installer is not acceptable
for a tool that writes into the user's agent config.

**Independent Test**: Install an adapter, then uninstall it, and confirm the target location is back
to its prior state — the symlink/copied files are gone and the Codex `notify` line added by install
is removed, while any pre-existing unrelated config remains intact.

**Acceptance Scenarios**:

1. **Given** an adapter installed by this feature, **When** the maintainer uninstalls it, **Then**
   the symlink/copied files are removed and the action reports what it removed.
2. **Given** a Codex install that added a `notify` line, **When** the maintainer uninstalls Codex,
   **Then** only that managed `notify` line is removed and the rest of `config.toml` is preserved.
3. **Given** an adapter that is not installed, **When** the maintainer uninstalls it, **Then** the
   action reports "nothing to remove" and makes no changes (idempotent).

---

### User Story 3 - Preview and safe-by-default behavior (Priority: P2)

Before changing anything, the maintainer can preview exactly what install/uninstall would do (a
dry-run) and the tool refuses to silently clobber existing, unrelated content at a target. When a
target already holds something the tool did not create, it stops and reports rather than
overwriting, unless the maintainer explicitly opts into replacing it.

**Why this priority**: This tool writes into `~/.pi`, `~/.codex`, and the Claude plugin location —
user-owned directories that may contain other things. Protecting against accidental data loss is
required by the project's engineering and constitution guidance, but the core install/uninstall
(US1/US2) can ship and be useful before a full dry-run UX exists.

**Independent Test**: Point install at a target that already contains an unrelated file/dir with the
same name; confirm the tool stops and reports a conflict without modifying it. Run install in
dry-run mode and confirm it reports the planned actions and changes nothing on disk.

**Acceptance Scenarios**:

1. **Given** a target path already occupied by content the tool did not create, **When** the
   maintainer installs without an explicit override, **Then** the tool reports the conflict and
   makes no change to that target.
2. **Given** dry-run mode, **When** the maintainer runs install or uninstall, **Then** the tool
   prints the planned actions and exits without touching the filesystem.
3. **Given** a re-run of an already-completed install (same mode), **When** install runs again,
   **Then** it is idempotent — it confirms the existing correct state and reports no changes needed.

---

### User Story 4 - Copy+sync fallback (Priority: P3)

Where symlinks are unavailable or undesirable (e.g. a filesystem or agent that does not follow
symlinks), the maintainer can choose a copy mode that copies the built adapter into the target
instead of linking. Re-running copy mode re-syncs the copied files to match the repo.

**Why this priority**: Symlink-from-repo is the preferred, documented primary path; copy is a
fallback for environments where symlinks do not work. It is genuinely needed for portability but is
not required for the maintainer's own primary machine, so it ships after the symlink path.

**Independent Test**: Install an adapter in copy mode, confirm real files (not links) exist at the
target; change the repo + rebuild, re-run copy install, and confirm the target files are updated to
match.

**Acceptance Scenarios**:

1. **Given** copy mode selected, **When** install runs, **Then** the target holds copies of the
   built adapter files (not symlinks) and the action reports copy mode.
2. **Given** an existing copy install and a changed repo, **When** the maintainer re-runs copy
   install, **Then** the copied files are re-synced to match the repo and stale files removed by
   this feature are cleaned up.
3. **Given** a copy install, **When** the maintainer uninstalls, **Then** the copied files this
   feature created are removed (same reversibility guarantee as symlink mode).

---

### Edge Cases

- **Missing agent home dir**: target parent (e.g. `~/.pi/agent/extensions/` or `~/.codex/`) does not
  exist yet → the tool creates the needed directories, or reports clearly which agent is not present
  and skips it, without failing the whole run for other adapters.
- **Stale/absent build**: adapter `dist/` is missing or older than its `src/` → build first (or fail
  with a clear "build the adapter" message); never install a non-functional adapter silently.
- **Codex config conflicts**: `config.toml` already has a `notify` line (possibly the user's own, or
  a prior install) → do not blindly append a second one; detect and update/replace the managed line,
  and on uninstall remove only the managed one.
- **Pre-existing real content at a symlink target** (not created by this tool) → conflict-stop per
  US3, do not overwrite without explicit override.
- **Broken/leftover symlink** pointing into the repo from a prior install → treated as
  tool-managed and safe to replace/remove (idempotent re-install, clean uninstall).
- **Partial failure across adapters** in an "all" run → continue best-effort, install the ones that
  can be installed, and report per-adapter success/failure at the end (no all-or-nothing rollback
  required, but each adapter is individually atomic — no half-installed adapter).
- **Re-install over a copy install with symlink mode (or vice versa)** → detect the existing mode
  and converge to the requested mode, cleaning up the other form.
- **Legacy pi reference extension present** (`~/.pi/agent/extensions/checkpoint.ts`, the pre-006
  vendored reference, not created by this tool) → treated as user content: install conflict-stops
  and reports it unless `--force` is given, so the maintainer consciously replaces the old reference
  with the shared-core pi adapter.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a repository-local install action that places each supported
  adapter (Claude Code, pi, Codex) into the location its agent loads from, runnable from this repo.
- **FR-002**: The install action MUST default to symlink-from-repo so the repository remains the
  single source of truth and rebuilds are picked up without re-installing.
- **FR-003**: The install action MUST support a copy+sync fallback mode that places real copies
  instead of symlinks and re-syncs them on re-run.
- **FR-004**: The system MUST allow installing a single named adapter, a subset, or all adapters in
  one invocation.
- **FR-005**: For any adapter that requires a build, install MUST ensure the adapter is built
  (`dist/` present and current) before placing it, building automatically when `dist/` is missing or
  stale, leaving no partial install. A `--no-build` option MUST be available that skips building and
  then requires an up-to-date `dist/`, failing clearly otherwise.
- **FR-006**: For Codex, install MUST place the custom prompts into the Codex prompts location AND
  wire the `notify` program into the user's Codex `config.toml`, with the bridge path resolved to a
  concrete absolute path (no `<BRIDGE>` placeholder remaining).
- **FR-007**: The install and uninstall actions MUST be idempotent — re-running with the same inputs
  converges to the same state and reports no spurious changes.
- **FR-008**: The system MUST provide an uninstall action that removes only what install created
  (symlinks/copied files and the managed Codex `notify` line) and preserves unrelated user content.
- **FR-009**: The system MUST NOT overwrite content at a target that it did not create, unless the
  maintainer explicitly opts into replacing it (`--force`); otherwise it MUST stop and report the
  conflict. The tool MUST be able to distinguish content it created from user content via:
  symlinks resolving into this repo, a per-machine install manifest (tracking copy-mode files and
  the Codex `notify` line), and a sentinel comment marker on the managed `notify` line.
- **FR-010**: The system MUST provide a dry-run/preview mode for both install and uninstall that
  reports planned actions and changes nothing on disk.
- **FR-011**: Every install/uninstall run MUST report what it did (or would do): per-adapter, the
  target path, the mode (symlink/copy), and the outcome (installed/updated/removed/skipped/conflict).
- **FR-012**: In a multi-adapter run, a failure for one adapter MUST NOT abort the others; the run
  MUST proceed best-effort and report per-adapter results, while each individual adapter install is
  atomic (no half-installed adapter left).
- **FR-013**: The install mechanism MUST NOT introduce a global `PATH` binary and MUST NOT perform
  any memory curation — it only places/links files and wires the documented Codex `notify` line
  (constitution non-goals preserved).
- **FR-014**: The feature MUST contain no duplicated checkpoint logic; it installs adapters and does
  not reimplement any capture/archive/config behavior (Principle I).
- **FR-015**: The feature MUST be documented so the maintainer can install, uninstall, choose
  symlink vs copy, and know each adapter's target location and prerequisites; the add-an-agent
  procedure MUST be updated to include the "wire install" step for future adapters (Principle V).
- **FR-016**: After install, the previously-deferred in-agent smoke tests (002 T031, 004 T023,
  005 T024) MUST be performable; this feature MUST document how to run them once installed.

### Key Entities *(include if feature involves data)*

- **Adapter install descriptor**: per-adapter knowledge of source location in the repo, the agent's
  target location, whether a build is required, what artifacts to place (e.g. plugin dir, extension
  entry, prompt files), and any extra wiring step (Codex `notify`). The set of these descriptors is
  what makes adding a future adapter a thin change.
- **Managed marker / record of installed items**: how the tool knows which files/links and which
  Codex `notify` line it created, so uninstall removes exactly those and conflict-detection can tell
  "tool-created" from "user-created".
- **Install report**: the per-adapter outcome summary (target, mode, action taken) shown to the
  maintainer and used to verify idempotency and dry-run.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer can install all three adapters with a single command and, immediately
  after, each agent loads its adapter (the three deferred in-agent smoke tests can be started).
- **SC-002**: Re-running install with no repo changes results in zero filesystem modifications and a
  report stating everything is already up to date (idempotency is observable).
- **SC-003**: Uninstall followed by inspection shows the agent locations restored to their
  pre-install state, with no leftover symlinks/files and the Codex `config.toml` free of the managed
  `notify` line, while unrelated config is untouched.
- **SC-004**: Installing one adapter never modifies another agent's location or config.
- **SC-005**: Attempting to install over unrelated existing content stops with a clear conflict
  report and zero data loss in 100% of conflict cases.
- **SC-006**: Dry-run for both install and uninstall changes nothing on disk while accurately
  listing the actions the real run would take.
- **SC-007**: A symlink install reflects a subsequent repo change/rebuild in the agent without any
  re-install step.

## Assumptions

- **Audience is the repo maintainer on their own machine(s)**, not public end users; "distribution"
  means repo → local agents, not publishing to a registry/marketplace. (Driven by the constitution's
  "repo is authoritative; agent extension dirs are install targets".)
- **The installer is a single repository-local Node script** (e.g. `scripts/install.mjs`) with
  `install`/`uninstall` verbs and flags (`--agent`, `--mode symlink|copy`, `--dry-run`, `--force`,
  target-root override), run from the repo — not a globally installed binary, consistent with the
  constitution non-goal "no global `checkpoint` binary on `PATH`" and the project's precedent for
  one-off maintenance scripts.
- **All target roots are overridable** (via flag/env) so automated tests install into temporary
  directories and never modify the real `~/.pi`, `~/.codex`, or `~/.claude`. Only the deferred
  in-agent smoke tests touch real agent locations, and those remain manual.
- **Default target locations** are: pi → `~/.pi/agent/extensions/`; Codex → `~/.codex/prompts/` plus
  `~/.codex/config.toml`; Claude Code → the Claude Code plugin location (exact path resolved during
  planning/research). Targets are overridable for testing (e.g. install into a temp location).
- **Symlink is preferred; copy is the fallback** — matching the constitution's install guidance.
- **Build tooling already exists per adapter** (`npm run build` produces `dist/`); this feature
  orchestrates build+place, it does not change how adapters build.
- **Each adapter is already feature-complete** (001–005 done); this feature only installs them and
  unblocks their deferred in-agent smoke tests, it does not modify adapter behavior.
- **Node is available** on the maintainer's machine (the adapters already require Node ≥18), so a
  Node-based installer is acceptable.
- **The Codex `notify` line is "managed"** via a recognizable marker (e.g. a comment tag) so it can
  be safely updated/removed without disturbing a user's own `notify` setting.
