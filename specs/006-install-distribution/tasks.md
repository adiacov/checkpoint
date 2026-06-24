# Tasks: Install / Distribution

**Feature**: `006-install-distribution` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Design inputs: [research.md](./research.md), [data-model.md](./data-model.md),
[contracts/installer-cli.md](./contracts/installer-cli.md), [quickstart.md](./quickstart.md).

The deliverable is a single dependency-free Node ESM script `scripts/install.mjs` (verbs
`install`/`uninstall`/`status`) plus a repo-root `.claude-plugin/marketplace.json` and tests under
`tests/install/`. The installer contains **no** checkpoint logic (Constitution I) — it only
places/links files and wires the documented Codex `notify` line and Claude marketplace registration.
All tests run against temporary target roots; the real `~/.pi`, `~/.codex`, `~/.claude` are never
touched by automated tests. Paths are repo-root-relative unless stated.

## Phase 1: Setup

- [x] T001 Create directories `scripts/` and `tests/install/` at the repo root.
- [x] T002 Add `.install/` (per-machine manifest dir) to the repo root `.gitignore`.
- [x] T003 [P] Create `.claude-plugin/marketplace.json` at the repo root: a single-plugin marketplace named `checkpoint-local` declaring the `checkpoint` plugin with a local `source` pointing at `./adapters/claude-code` (mirror the field shape observed in the official marketplace manifest: `name`, `description`, `owner`, `plugins[].source`).

## Phase 2: Foundational (blocks all stories)

**Goal**: the shared installer skeleton — CLI parsing, per-agent descriptors, manifest I/O, fs/path
helpers, the planner, and the reporter — that every verb reuses. No mutating behavior yet beyond
manifest plumbing.

- [x] T004 In `scripts/install.mjs`, implement CLI parsing (Run Options in data-model.md): verbs `install|uninstall|status`; flags `--agent` (claude|pi|codex|all, comma/repeat), `--mode symlink|copy` (default symlink), `--dry-run`, `--force`, `--no-build`, `--target-root <agent=path>` (repeatable), `-h/--help`. Usage error → exit 2. No deps beyond Node stdlib.
- [x] T005 [P] In `scripts/install.mjs`, define the three Install Descriptors (data-model.md): `pi` (sourcePath `adapters/pi`, requiresBuild, dir symlink target `<piRoot>/checkpoint`, conflict-marker for legacy `checkpoint.ts`), `codex` (prompts `adapters/codex/prompts/*` → `<codexRoot>/prompts/`, plus `extraWiring: codex-notify`; requiresBuild for the bridge), `claude` (`extraWiring: claude-marketplace`; requiresBuild). Include each agent's default target root and allow `--target-root` override.
- [x] T006 [P] In `scripts/install.mjs`, implement manifest I/O for `.install/manifest.json` (data-model.md): `readManifest()` (missing → empty v1), `writeManifest()` (atomic write), `addEntry()`/`removeEntry()`/`findEntry()`. Never throws on a missing/corrupt manifest (treat as empty, warn).
- [x] T007 [P] In `scripts/install.mjs`, implement fs/path helpers: `resolveTargetRoots(opts)`, `isRepoPointingSymlink(target)` (lstat + readlink resolves inside repo), `ensureDir`, `symlinkInto`, `copyTree`/`copyFile`, `removePath`. Pure helpers, unit-testable.
- [x] T008 Implement the build-if-stale helper in `scripts/install.mjs`: `ensureBuilt(adapterDir, {noBuild})` comparing newest mtime of `dist/` vs `src/` (build the core first when its `dist` is stale), running `npm run build` via `child_process`; `--no-build` skips and requires a current `dist/` (else throw a clear error). Build failure is contained to the calling adapter.
- [x] T009 Implement the planner + reporter in `scripts/install.mjs`: `plan(opts)` produces ordered Planned Actions from (descriptors × options × on-disk state) without mutating; `report(actions)` prints one line per item (`agent`, `target`, `mode`, `action`, detail) + a summary; exit-code mapping (0 success/dry-run/status, 1 any conflict-without-force/failed, 2 usage). Best-effort across adapters.

**Checkpoint**: `node scripts/install.mjs status` and `--dry-run` run end-to-end against a temp
target root and print a coherent (empty) plan; no real agent dirs touched.

## Phase 3: User Story 1 — Install an adapter into its agent (P1)

**Goal**: symlink-mode install places each adapter so its agent loads it; Codex `notify` + Claude
marketplace wired; builds if stale; idempotent; reports. **Independent test**: install one adapter
into a temp target root; assert the expected link/files exist (resolving into the repo) and, for
Codex, that `config.toml` has a resolved-absolute-path `notify` line; re-run → `no-op`.

- [x] T010 [US1] Implement pi symlink install in `scripts/install.mjs`: ensure built, create `<piRoot>/checkpoint` → `<repo>/adapters/pi` (dir symlink), record a `link` manifest entry. Idempotent (existing correct repo-pointing symlink → no-op).
- [x] T011 [US1] Implement Codex prompts symlink install: ensure `<codexRoot>/prompts/` exists, symlink each `adapters/codex/prompts/*.md` into it, record `link` entries. Idempotent.
- [x] T012 [US1] Implement the `codex-notify` wiring in `scripts/install.mjs`: resolve the absolute bridge path (`<repo>/adapters/codex/dist/index.js`), insert a managed `notify = ["node", "<abs>", "notify"]` line into `config.toml`'s **root table — before the first `[table]` header**, preceded by the sentinel comment marker; create `config.toml` if absent; if a managed line exists, update in place; record a `config` manifest entry with the marker. (Line-aware edit per research.md Decision 5.)
- [x] T013 [US1] Implement the `claude-marketplace` wiring in `scripts/install.mjs`: ensure built, register this repo as a filesystem-path marketplace in `<claudeRoot>/plugins/known_marketplaces.json` (entry pointing at the repo, mirroring the observed schema) and mark the `checkpoint` plugin enabled in the appropriate Claude config; record `config` manifest entries. Idempotent. (Per research.md Decision 4; exact enablement key confirmed at smoke test T026.)
- [x] T014 [US1] Wire build-if-stale (T008) into the install path for all `requiresBuild` adapters and the resolved bridge/dist paths used above; ensure a build failure leaves no partial install for that adapter.
- [x] T015 [P] [US1] [Test] `tests/install/install.test.mjs`: symlink install of pi + codex into temp roots → assert pi dir symlink resolves into repo, codex prompt symlinks exist; re-run → all `no-op`; assert manifest entries written. Use `--no-build` with a pre-seeded fake `dist/` to keep tests fast/hermetic. Include an **isolation assertion** (SC-004): installing only `--agent codex` leaves the pi and Claude target roots completely unmodified.
- [x] T016 [P] [US1] [Test] `tests/install/codex-notify.test.mjs`: into a temp `config.toml` containing `[projects."x"]` tables, insert the managed `notify` → assert it lands in the **root table before the first header**, with the sentinel and a resolved absolute path; re-run → idempotent update, not a duplicate; an existing managed line is updated in place.

**Checkpoint**: `node scripts/install.mjs install --agent codex --no-build` (temp roots) installs
prompts + a correct root-table `notify`; re-run reports `no-op`.

## Phase 4: User Story 2 — Uninstall an adapter (P1)

**Goal**: remove exactly what install created; preserve unrelated content; idempotent. **Independent
test**: install then uninstall in temp roots; assert links/files gone, the managed Codex `notify`
line removed while other `config.toml` content is byte-intact, manifest entries cleared; uninstall
again → `no-op` "nothing to remove".

- [x] T017 [US2] Implement `uninstall` link/file removal in `scripts/install.mjs`: for each manifest `link`/`copy` entry (and repo-pointing symlinks at known targets), remove it and drop the manifest entry. Absent → `no-op`. Never remove non-tool content.
- [x] T018 [US2] Implement managed-`notify` removal: locate the sentinel-marked line in `config.toml`, remove only that line (+ its sentinel comment), leave the rest byte-intact; drop the manifest entry. Absent → `no-op`.
- [x] T019 [US2] Implement Claude marketplace de-registration: remove the repo's known-marketplace entry and the plugin enablement this tool added (per manifest), leaving other marketplaces/plugins intact.
- [x] T020 [P] [US2] [Test] Extend `tests/install/install.test.mjs`: full install→uninstall round-trip in temp roots → targets restored, manifest emptied, unrelated pre-seeded files preserved; second uninstall → `no-op`.
- [x] T021 [P] [US2] [Test] Extend `tests/install/codex-notify.test.mjs`: after removal, the managed line + sentinel are gone and a pre-existing unrelated `[projects."x"]`/`[tui]` content is unchanged byte-for-byte.

## Phase 5: User Story 3 — Preview & safe-by-default (P2)

**Goal**: dry-run mutates nothing; conflict-stop on user content (incl. legacy pi `checkpoint.ts`)
unless `--force`. **Independent test**: dry-run install/uninstall in temp roots → plan printed, zero
fs change; pre-seed a non-tool file at a target → `conflict`, untouched; `--force` → replaced.

- [x] T022 [US3] Implement `--dry-run` short-circuit in the executor: run the planner, print the plan, return before any mutation; assert (in code) no fs write occurs on the dry-run path.
- [x] T023 [US3] Implement conflict detection in the planner: a target occupied by content that is not a repo-pointing symlink, not in the manifest, and (for `config.toml`) has no sentinel → `conflict` action; `--force` converts `conflict`→`updated` (replace/remove user content). Treat legacy `<piRoot>/checkpoint.ts` as user content.
- [x] T024 [P] [US3] [Test] Extend `tests/install/install.test.mjs`: (a) dry-run install/uninstall make zero fs changes but print planned actions; (b) a pre-seeded real file/dir at a symlink target → `conflict`, left intact, exit code 1; (c) `--force` replaces it and records the manifest entry; (d) a pre-seeded legacy `checkpoint.ts` triggers the pi conflict path.

## Phase 6: User Story 4 — Copy+sync fallback (P3)

**Goal**: `--mode copy` places real copies, re-syncs on re-run, converges across modes, and
uninstalls via the manifest. **Independent test**: copy-install into temp roots → real files (not
links); change source + re-run → files re-synced; switch modes → converges; uninstall → copies gone.

- [x] T025 [US4] Implement copy mode in placement + planner: `--mode copy` copies trees/files instead of symlinking, records `copy` manifest entries; re-run re-syncs (overwrite changed, remove tool-created stale files); detect an existing install of the *other* mode and converge (clean up the prior form). Copy-mode uninstall relies solely on the manifest.
- [x] T026 [P] [US4] [Test] Extend `tests/install/install.test.mjs`: copy-install → assert real files (not symlinks); modify a source file + re-run copy → target updated; symlink-install then copy-install → converges to copies (old symlink removed); uninstall copy → all copies removed via manifest.

## Phase 7: Polish & Cross-Cutting

- [x] T027 [P] Update each adapter's README "Install" section (`adapters/pi/README.md`, `adapters/claude-code/README.md`, `adapters/codex/README.md`) to reference `scripts/install.mjs` (replace the "delivered by 006 / manual dev install" placeholders) and note the per-agent target + any `--force` caveat (legacy pi `checkpoint.ts`).
- [x] T028 [P] Update `adapters/codex/config.example.toml` to note that `<BRIDGE>` is auto-resolved by `scripts/install.mjs` and the managed line is placed in the root table with a sentinel.
- [x] T029 [P] Update the add-an-agent procedure / per-agent mapping (Constitution Principle V; the relevant `specs/*/contracts/agent-mapping.md` and any project doc) to include the "wire install" step = add one Install Descriptor in `scripts/install.mjs`.
- [x] T030 Run the full installer test suite: `node --test tests/install/*.test.mjs` — all green; confirm no test wrote outside its temp root.
- [x] T031 Update `STATE.md`: mark 006 done (what shipped, how verified, residual smoke-test items), and move "Next" to 007. Keep it consistent with [quickstart.md](./quickstart.md).
- [x] T032 [MANUAL] Run the unblocked in-agent smoke tests and record results against their tasks: Claude Code 002 T031, pi 004 T023 (also confirms research.md Decision 3 — dir-symlink vs bundle fallback), Codex 005 T024. These require live agent installs and stay manual (FR-016, quickstart.md).

## Dependencies & Execution Order

- **Setup (T001–T003)** → **Foundational (T004–T009)** must complete before any user story.
- **US1 (P1, T010–T016)** is the MVP: install works. Depends only on Foundational.
- **US2 (P1, T017–T021)** depends on Foundational + the manifest entries US1 writes (test round-trips assume install exists).
- **US3 (P2, T022–T024)** depends on the planner (Foundational) + placement (US1).
- **US4 (P3, T025–T026)** depends on placement/planner; orthogonal to US2/US3 logic.
- **Polish (T027–T032)** last; T032 is manual and depends on a real install.
- `[P]` tasks within a phase touch different files (e.g. separate test files, separate READMEs) and may run in parallel; same-file tasks are sequential.

## Implementation Strategy

- **MVP = Setup + Foundational + US1** (`scripts/install.mjs install` in symlink mode for all three
  adapters, building as needed, idempotent, reporting). That alone unblocks installing the adapters.
- Add **US2** immediately after (reversibility is required before driving the smoke-test loop).
- **US3** hardens safety (dry-run + conflict-stop); **US4** adds the copy fallback.
- Finish with docs + the manual smoke tests that this feature exists to unblock.
