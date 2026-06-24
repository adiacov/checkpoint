# Research: Config Single-Source Migration (007)

Phase 0 decisions. Grounded in the existing core (`core/src/config.ts`), the `006` installer
conventions, and the observed machine layout (many sibling projects under this repo's parent;
`~/.pi/agent/extensions/` holds the legacy `checkpoint.ts` reference today).

## Decision 1 — Per-directory migration logic lives in the core

**Decision**: Add `core/src/migrate.ts` exporting `migrateConfig(root, { apply })`. It reuses
`config.ts`: `loadConfig`/`normalizeConfig` to read+preserve legacy settings, `writeConfig` to emit
canonical, and `CONFIG_FILENAME` / `LEGACY_CONFIG_RELATIVE_PATH` for the two paths. The script never
parses or writes config itself.

**Rationale**: Constitution I — config handling already lives once in the core; the migration is a
new *use* of it, not a reimplementation. Writing canonical via `normalizeConfig` is exactly the
`{...existing}` preservation `optIn` already does (verified in `api.ts`): `enabled` stays as-is,
`createdAt` is preserved, tuning fields are kept and clamped.

**Alternatives considered**: implementing the read/merge/write inside the script (rejected —
duplicates config logic, violates I); a brand-new merge format (rejected — `normalizeConfig` already
defines the canonical shape).

## Decision 2 — Classification table (the four cases)

`migrateConfig` classifies a directory by which files exist:

| `.checkpoint.json` | `.pi/checkpoint.json` | action                       | apply behavior                                            |
| ------------------ | --------------------- | ---------------------------- | -------------------------------------------------------- |
| no                 | no                    | `not-configured`             | nothing                                                  |
| yes                | no                    | `already-canonical`          | nothing (idempotent)                                     |
| no                 | yes                   | `migrated`                   | write canonical from legacy (normalized), then remove legacy |
| yes                | yes                   | `redundant-legacy-removed`   | remove legacy only; canonical left **byte-unchanged**    |

**Rationale**: Covers FR-002 (legacy→canonical), FR-004 (both → canonical wins), FR-010 (idempotent).
Dry-run computes the same action and the `wouldWriteCanonical`/`wouldRemoveLegacy` flags without
touching disk (SC-003).

**Ordering / no-data-loss (FR-009, SC-006)**: in the `migrated` case, canonical is written *first*;
the legacy removal only runs if the write succeeded. If writing canonical throws, the result is
`failed` and legacy is left intact.

## Decision 3 — Removing the legacy file, not the `.pi/` dir

**Decision**: Remove only `<root>/.pi/checkpoint.json`. Leave the `.pi/` directory and any other
contents untouched (some projects keep other pi state there).

**Rationale**: Minimal, non-destructive; matches the spec edge case. Removing an emptied `.pi/` is
not worth the risk of deleting unrelated content.

## Decision 4 — Sweep discovery scope

**Decision**: `scripts/migrate-configs.mjs` scans **immediate children** of the scan root (default =
`dirname(REPO_ROOT)`, i.e. sibling projects; `--root <path>` overrides). For each child directory it
calls `migrateConfig(child, …)`. Legacy detection is at the child root only (one level deep).

**Rationale**: The maintainer's projects live as siblings under one parent (observed). One level is
predictable and bounded; deeper/recursive discovery risks touching nested vendored repos and is out
of scope for a one-off cleanup. Overridable root keeps tests hermetic (temp tree) and lets the
maintainer target a different parent.

**Alternatives considered**: recursive walk (rejected — unbounded, risks node_modules/vendored
repos); a hand-listed set of dirs (rejected — not maintainable).

## Decision 5 — Safety: dry-run default, no commits, dirty-git skip

**Decision**: Dry-run is the default; `--apply` is required to mutate. The tool never runs `git
commit`. In `--apply`, for each sibling that is a git repo, run `git -C <dir> status --porcelain`; if
non-empty (dirty), skip and report (suggest `--force`). Clean git repos and non-git dirs are
migrated; non-git dirs are reported as `non-git` for visibility.

**Rationale**: The sweep writes into *other* repos' working trees; keeping each migration an isolated,
reviewable, uncommitted change is the safe contract (FR-005, FR-006, FR-007, SC-005). Skipping dirty
repos prevents tangling the migration into unrelated WIP. Non-git dirs have no commit/review concern,
so migrating them is safe and surfaced in the report.

## Decision 6 — The `004`/`006` ordering guard

**Decision**: Before deleting any legacy file in `--apply`, run a one-time precondition check:
inspect `~/.pi/agent/extensions/` (overridable for tests). If the legacy pi reference `checkpoint.ts`
is present AND the shared-core pi adapter `checkpoint` (the `006` install) is absent, the sweep
**refuses to delete legacy files** and exits with a clear message — unless `--force`. Dry-run always
runs (it deletes nothing).

**Rationale**: This operationalizes the stated `004` dependency (Phase-007 open question 2). The old
reference pi extension reads `.pi/checkpoint.json` only; deleting it while that extension is the
installed one would make pi inert for the project (a regression). Detecting the install state turns
the precondition from a comment into an enforced guard. `--force` is the documented escape hatch for
a maintainer who knows their setup differs.

**Alternatives considered**: pure documentation (rejected — easy to footgun); a config flag the user
must set (rejected — the install state is directly observable, so check it).

## Decision 7 — Script shape mirrors `006`

**Decision**: Dependency-free Node ESM `scripts/migrate-configs.mjs` with stdlib arg parsing, a
`--root` / `--apply` / `--force` / `--pi-extensions <path>` (test override) / `-h` surface, a
per-project report line + summary, exported functions for `node:test` to call against temp trees. It
imports `migrateConfig` from the built core.

**Rationale**: Consistency with `scripts/install.mjs` (same conventions, testability, no PATH binary)
keeps the maintenance-script surface uniform and the constitution non-goals intact.
