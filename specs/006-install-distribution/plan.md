# Implementation Plan: Install / Distribution

**Branch**: `006-install-distribution` | **Date**: 2026-06-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-install-distribution/spec.md`

## Summary

Provide one repeatable, safe, reversible way to get each adapter from this repo into the location
its agent loads from. A single repository-local Node script (`scripts/install.mjs`) installs,
uninstalls, and previews per-agent placement. Default mode is symlink-from-repo (repo stays the
single source of truth); copy+sync is the fallback. It builds adapters when their `dist/` is missing
or stale, is idempotent, refuses to clobber unrelated user content, tracks what it created via an
install manifest + symlink-target checks + a sentinel marker on the Codex `notify` line, and reports
every action. Installing unblocks the deferred in-agent smoke tests (002 T031, 004 T023, 005 T024).

Per-agent placement differs because the three agents load extensions differently:

- **pi** loads extension files from `~/.pi/agent/extensions/`; the new adapter is a package that
  imports `@checkpoint/core`, so dependency resolution must travel with the install.
- **Claude Code** loads plugins through a *marketplace* model; a local install registers this repo as
  a filesystem-path marketplace and enables the `checkpoint` plugin.
- **Codex** loads custom prompts from `~/.codex/prompts/` and the auto-capture wiring is a `notify`
  key in `~/.codex/config.toml` (a TOML file whose root-table keys must precede the first `[table]`).

## Technical Context

**Language/Version**: Node.js ≥18, ESM. The installer itself is a dependency-free `.mjs` script (no
build step, no npm deps) — matching the project's one-off-maintenance-script precedent. The adapters
it installs are the existing TypeScript packages (built with their own `tsc`).

**Primary Dependencies**: None for the installer beyond the Node standard library (`node:fs`,
`node:path`, `node:os`, `node:child_process`). Adapter builds use each adapter's existing toolchain.

**Storage**: Filesystem only. Reads/writes: agent target dirs (`~/.pi/agent/extensions/`,
`~/.codex/prompts/`, `~/.codex/config.toml`, the Claude Code plugin config under `~/.claude/`), and a
git-ignored per-machine install manifest under the repo (`.install/manifest.json`).

**Testing**: `node:test` (the convention across core + adapters). Installer tests run entirely
against temporary target roots (override via flag/env) — they never touch the real `~`.

**Target Platform**: The maintainer's local machine(s), Linux/macOS (POSIX symlinks). Windows is out
of scope for v1 (copy mode would be the portability path if ever needed).

**Project Type**: CLI maintenance script + repo distribution metadata (a single project; no
client/server split).

**Performance Goals**: N/A — interactive one-shot tool; correctness/safety dominate.

**Constraints**: Must not introduce a global `PATH` binary; must not duplicate any checkpoint logic;
must be idempotent and conflict-safe; symlink installs must reflect repo rebuilds with no re-install.

**Scale/Scope**: Three adapters today; adding a fourth must be a thin change (one new install
descriptor), per constitution Principle V.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Write the Logic Once (Agent-Neutral Core)** — PASS. The installer places/links files and
  wires the documented Codex `notify` line; it contains **zero** checkpoint logic (no capture,
  archive, config, dedup). Enforced by keeping all behavior in placement/manifest code only.
- **II. Identical Command Surface Everywhere** — N/A (not a runtime command surface). The installer
  does not add or change any `/checkpoint*` command; it only installs the adapters that expose them.
- **III. Raw Capture, Not Curation** — PASS. No summarization/promotion; the installer never reads
  checkpoint content.
- **IV. Functional Parity With the Reference Extension** — PASS. No adapter behavior changes; this
  feature only distributes them. (It does, however, *enable* the replacement of the legacy pi
  reference `checkpoint.ts` with the shared-core pi adapter — a conscious `--force` action.)
- **V. Adding an Agent Is a Thin, Documented Wrapper** — PASS and directly advanced. This feature
  delivers the "wire install" step of the documented add-an-agent procedure: a new agent adds one
  install descriptor. The add-an-agent docs/mapping are updated here (FR-015).
- **Technical constraints** — PASS. Symlink-preferred / copy-fallback is honored; no global `PATH`
  binary; repo authoritative, agent dirs are install targets; the hard-kill gap is unaffected.

No violations. Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/006-install-distribution/
├── plan.md              # This file
├── research.md          # Phase 0 output — per-agent placement decisions + open-at-smoke-test items
├── data-model.md        # Phase 1 output — install descriptor, manifest, report entities
├── quickstart.md        # Phase 1 output — how to install/uninstall + run the unblocked smoke tests
├── contracts/
│   └── installer-cli.md  # Phase 1 output — CLI contract (verbs, flags, exit codes, report format)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
scripts/
└── install.mjs          # The installer: verbs (install|uninstall|status), flags, per-agent descriptors

tests/
└── install/
    ├── install.test.mjs   # symlink/copy/idempotency/uninstall/conflict/dry-run against temp roots
    └── codex-notify.test.mjs  # TOML notify insert/update/remove correctness (root-table placement)

.claude-plugin/
└── marketplace.json     # NEW at repo root — declares the `checkpoint` plugin for local Claude Code install

adapters/                # unchanged adapters being installed (claude-code, pi, codex)
.install/                # git-ignored, per-machine — manifest.json (what this tool created on this machine)
```

**Structure Decision**: Single repository-local Node script plus a small repo-root marketplace
manifest. No new package, no build step for the installer (dependency-free `.mjs`), tests via
`node:test` against temp target roots. Per-agent specifics live in declarative "install descriptors"
inside `install.mjs` so adding an agent is a thin, localized change (Principle V). The `.install/`
manifest is per-machine state and is git-ignored.

## Complexity Tracking

No constitution violations — section intentionally empty.
