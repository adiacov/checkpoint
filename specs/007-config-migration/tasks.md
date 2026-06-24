# Tasks: Config Single-Source Migration

**Feature**: `007-config-migration` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Design inputs: [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/migrate-cli.md](./contracts/migrate-cli.md), [quickstart.md](./quickstart.md).

Two deliverables: a core capability `migrateConfig` (in `@checkpoint/core`, reusing the existing
config load/normalize/write — **no config logic duplicated**, Constitution I) and a dependency-free
sweep script `scripts/migrate-configs.mjs`. All tests run against temporary directory trees; the
maintainer's real sibling projects and `~/.pi` are never touched. Paths are repo-root-relative.

## Phase 1: Setup

- [x] T001 Create `tests/migrate/` at the repo root (core tests live in `core/tests/`, which already exists).

## Phase 2: Foundational — core `migrateConfig` (blocks the sweep)

**Goal**: the per-directory migration capability the script orchestrates. **Independent test**: call
`migrateConfig` on temp dirs in each of the four config states, dry-run and apply.

- [x] T002 Implement `core/src/migrate.ts`: `migrateConfig(root, { apply })` returning `ConfigMigrationResult` (data-model.md). Classify by file presence (research.md Decision 2): `not-configured` / `already-canonical` / `migrated` / `redundant-legacy-removed`. Reuse `loadConfig`/`normalizeConfig`/`writeConfig` and `CONFIG_FILENAME`/`LEGACY_CONFIG_RELATIVE_PATH` from `config.ts`. In `migrated`, write canonical **before** removing legacy; on write failure return `action:"failed"` with `error` and leave legacy intact (FR-009). In `redundant-legacy-removed`, leave canonical byte-unchanged and remove only `<root>/.pi/checkpoint.json` (FR-004, Decision 3). `apply:false` mutates nothing and sets the `would*` flags. Never throws for a per-directory error (FR-011).
- [x] T003 Export `migrateConfig` and its `ConfigMigrationResult` type from `core/src/index.ts`.
- [x] T004 [P] [Test] `core/tests/migrate.test.ts`: all four classifications; dry-run makes no fs change but sets flags; `migrated` preserves settings incl. `enabled:false` and `createdAt` (FR-003, SC-002); `redundant-legacy-removed` leaves canonical byte-for-byte identical and removes legacy (FR-004); malformed legacy JSON → `failed`, legacy intact (FR-011, SC-006); re-run is idempotent (FR-010). Temp dirs only.

**Checkpoint**: `cd core && npm run build && npm test` green; `migrateConfig` usable by the script.

## Phase 3: User Story 1 — Preview the migration (P1)

**Goal**: the sweep discovers sibling projects and reports the planned action per project, changing
nothing (dry-run default). **Independent test**: point `--root` at a temp tree with mixed states →
correct per-project classification, zero fs change.

- [x] T005 [US1] Implement arg parsing + discovery in `scripts/migrate-configs.mjs` (dependency-free ESM, mirrors `scripts/install.mjs`): flags `--root` (default `dirname(REPO_ROOT)`), `--apply`, `--force`, `--pi-extensions`, `-h/--help`; usage error → exit 2. Discover immediate child dirs of `--root` and call `migrateConfig(child, { apply:false })` for the plan. Import `migrateConfig` from the built core.
- [x] T006 [US1] Implement the reporter + exit-code mapping in `scripts/migrate-configs.mjs`: one line per project (`path`, `gitState`, `outcome`, detail) + summary (contracts/migrate-cli.md); exit 0 clean, 1 any failed/guard-blocked, 2 usage. Export functions for `node:test`.
- [x] T007 [P] [US1] [Test] `tests/migrate/migrate-configs.test.mjs`: build a temp tree with legacy-only, both-present, canonical-only, and unconfigured child dirs; run the sweep in dry-run → assert each project's reported outcome and that **no** file is created/modified/deleted (SC-003).

**Checkpoint**: `node scripts/migrate-configs.mjs --root <temp>` previews correctly and mutates nothing.

## Phase 4: User Story 2 — Apply the migration (P1)

**Goal**: `--apply` performs the migration preserving settings; idempotent. **Independent test**:
`--apply` on a temp tree → legacy-only dirs become canonical (settings preserved), legacy removed,
canonical-only untouched; re-run → no changes.

- [x] T008 [US2] Wire `--apply` through the sweep: call `migrateConfig(child, { apply:true })` for eligible projects; map the core action to the project outcome; never invoke `git commit` (FR-006).
- [x] T009 [P] [US2] [Test] Extend `tests/migrate/migrate-configs.test.mjs`: `--apply` over the temp tree → legacy-only dir has canonical equal (after normalize) to the legacy settings and no legacy file; a disabled+tuned legacy config stays disabled+tuned (SC-002); both-present dir keeps canonical byte-unchanged and loses legacy (FR-004); a second `--apply` changes nothing (SC-004); a legacy file whose canonical write is forced to fail leaves legacy intact (SC-006).

## Phase 5: User Story 3 — Safe-by-default across repos (P2)

**Goal**: dirty-git skip + the `004`/`006` ordering guard. **Independent test**: dirty git sibling
skipped (included with `--force`); guard refuses legacy deletion when old pi installed + shared-core
absent.

- [x] T010 [US3] Implement the git-dirty check in `scripts/migrate-configs.mjs`: per sibling, `git -C <dir> status --porcelain` → `clean` / `dirty` / `non-git` (non-zero rc). In `--apply`, dirty git siblings are `skipped` + reported unless `--force` (FR-007); clean git + non-git are migrated.
- [x] T011 [US3] Implement the ordering guard (research.md Decision 6): one-time check of `--pi-extensions` (default `~/.pi/agent/extensions`) — if `checkpoint.ts` present AND `checkpoint` (shared-core install) absent, refuse to delete legacy files (block the `migrated`/`redundant-legacy-removed` deletions) unless `--force`; report clearly and set exit 1. Dry-run still runs (deletes nothing).
- [x] T012 [P] [US3] [Test] Extend `tests/migrate/migrate-configs.test.mjs`: a dirty git sibling (seed `git init` + an uncommitted file) is `skipped` under `--apply`, migrated with `--force`; with a fake `--pi-extensions` containing `checkpoint.ts` and no `checkpoint`, `--apply` refuses to delete legacy (exit 1) and `--force` overrides; assert the tool never creates a commit.

## Phase 6: Polish & Cross-Cutting

- [x] T013 [P] Run all gates: `cd core && npm run build && npm test && npm run typecheck && npm run lint`; `cd .. && node --test tests/migrate/*.test.mjs` — all green; confirm no test wrote outside its temp tree.
- [x] T014 [P] Update `STATE.md`: mark 007 done (what shipped, how verified), remove it from the backlog, and note the project's feature set is complete; keep consistent with [quickstart.md](./quickstart.md).
- [x] T015 [P] Add a short "Config migration" pointer to `core/README.md` (the new `migrateConfig` capability) and reference `scripts/migrate-configs.mjs` from the maintenance/scripts context, so the one-off sweep is discoverable.

## Dependencies & Execution Order

- **Setup (T001)** → **Core (T002–T004)** must complete before the sweep (the script imports `migrateConfig`).
- **US1 (T005–T007)** is the MVP: discovery + preview. Depends on the core.
- **US2 (T008–T009)** depends on US1 (apply reuses discovery/report).
- **US3 (T010–T012)** layers safety onto the apply path; depends on US1/US2.
- **Polish (T013–T015)** last.
- `[P]` tasks touch different files (separate test files, separate docs) and may run in parallel.

## Implementation Strategy

- **MVP = Setup + Core + US1** (`migrateConfig` + dry-run sweep) — previews the whole migration safely.
- Add **US2** (apply, the actual consolidation), then **US3** (the guards required before running it
  for real across repos). Finish with gates + docs.
