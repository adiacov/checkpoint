# Research: Install / Distribution (006)

Phase 0 research resolving the placement-mechanism unknowns deferred from `/speckit-clarify`. Each
decision is grounded in the observed local agent layout (inspected on the maintainer's machine) and
the project constitution. Where an agent's internal loader cannot be confirmed without running it,
the residual question is explicitly listed as "confirm at smoke test" — which is exactly what this
feature unblocks.

## Decision 1 — Installer form: single dependency-free Node script

**Decision**: One repo-local ESM script `scripts/install.mjs`, run as `node scripts/install.mjs
<verb> [flags]`. No build step, no npm dependencies (Node stdlib only). Verbs: `install`,
`uninstall`, `status`. Flags: `--agent <claude|pi|codex|all>` (default `all`), `--mode
<symlink|copy>` (default `symlink`), `--dry-run`, `--force`, `--no-build`, and a target-root
override for tests.

**Rationale**: Matches the project's stated one-off-maintenance-script precedent (the planned
`scripts/migrate-configs.mjs` for 007), keeps the constitution non-goal "no global `PATH` binary",
and avoids adding a build/toolchain for the installer itself. A `.mjs` with zero deps is trivially
runnable and testable with `node:test`.

**Alternatives considered**: (a) per-adapter install scripts — rejected: duplicates the safety/
manifest/report logic three times. (b) A TypeScript package built to `dist/` — rejected:
unnecessary toolchain for a maintenance script. (c) npm `postinstall`/workspace scripts — rejected:
no root workspace exists and it couples install to package management.

## Decision 2 — Tool-managed vs. user content (safe uninstall + conflict detection)

**Decision**: Three complementary signals.
1. **Symlinks** whose resolved target is inside this repo → tool-managed (safe to replace/remove).
2. **Install manifest** `.install/manifest.json` (git-ignored, per-machine) records every item the
   tool created: agent, mode, target path, and for Codex the fact that a `notify` line was added.
   Copy-mode files (which are indistinguishable from user files on disk) are known *only* via the
   manifest.
3. **Sentinel marker**: the managed Codex `notify` line is preceded by a comment marker
   (e.g. `# checkpoint-managed (006) — do not edit this line`) so it is identifiable even if the
   manifest is lost.

Anything at a target matching none of these is user content → conflict-stop unless `--force`.

**Rationale**: Symlink-target checking is the cheapest correct signal for the default mode; the
manifest is required because copy-mode files carry no intrinsic marker; the sentinel is defense in
depth for the one edit we make to a user-owned file (`config.toml`). Together they make uninstall
remove *exactly* what was installed (SC-003) and make conflict detection reliable (SC-005).

**Alternatives considered**: marker files alongside copied content (noisier, pollutes target dirs);
hashing to detect tool-written files (fragile across rebuilds); trusting the target dir is
exclusively ours (false — `~/.pi/agent/extensions/` already holds `git.ts`, `life-os.ts`, etc.).

## Decision 3 — pi placement

**Observed**: `~/.pi/agent/extensions/` contains single files: `git.ts`, `life-os.ts`,
`telegram.ts`, and the **legacy** `checkpoint.ts` (the pre-006 vendored reference). pi loads
TypeScript extension files directly.

**Problem**: The new pi adapter (`adapters/pi/src/index.ts`) is a package that imports
`@checkpoint/core`. A bare single-file symlink into the extensions dir would break Node module
resolution for `@checkpoint/core` (resolution would start from `~/.pi/agent/extensions/`, not the
repo).

**Decision**: Symlink the **adapter package directory** into the extensions dir as a single named
entry: `~/.pi/agent/extensions/checkpoint` → `<repo>/adapters/pi`. This keeps the adapter's own
`node_modules/@checkpoint/core` (a `file:` link to the repo core) resolvable, and the repo stays the
source of truth. The legacy `~/.pi/agent/extensions/checkpoint.ts` is **user content** (not created
by this tool) → install conflict-stops and reports it; replacing it (removing the legacy single file
so the shared-core adapter takes over) requires `--force`.

**Confirm at smoke test (004 T023)**: whether pi discovers an extension exposed as a *directory*
(resolving its entry) versus only top-level `*.ts` files. **Fallback if pi only loads top-level
files**: produce a bundled single-file build (core inlined) and symlink it as
`~/.pi/agent/extensions/checkpoint.ts`. The installer's pi descriptor isolates this choice to one
place so switching primary→fallback is a localized change. The pi README already anticipates an
install-time wiring step here.

**Rationale**: Directory-symlink preserves dependency resolution and the single-source-of-truth
guarantee with no bundler; the bundle fallback exists only if pi's loader requires it. We avoid
deciding blind: the very smoke test this feature unblocks is where pi's loader behavior is confirmed.

## Decision 4 — Claude Code placement (marketplace model)

**Observed**: `~/.claude/plugins/` holds `known_marketplaces.json` (each entry has a `source` and an
`installLocation` filesystem path) and `marketplaces/<name>/.claude-plugin/marketplace.json` listing
plugins. The adapter already ships `.claude-plugin/plugin.json`. Plugins are installed *through a
marketplace*, not by dropping a dir into a plugins folder.

**Decision**: Add a repo-root `.claude-plugin/marketplace.json` declaring a single-plugin
marketplace whose `checkpoint` plugin source points at `./adapters/claude-code` (a local, in-repo
path). Local install = register **this repo** as a filesystem-path marketplace (an entry in
`~/.claude/plugins/known_marketplaces.json` whose `installLocation` is the repo path — the
symlink-from-repo equivalent: it references the repo, so rebuilds are picked up) and mark the
`checkpoint` plugin enabled. The installer writes these registrations and records them in the
manifest for clean uninstall.

**Confirm at smoke test (002 T031)**: the exact enabled-plugins key Claude Code reads
(settings vs. a plugins config file) and whether the supported path is writing the JSON directly vs.
driving `/plugin marketplace add <path>` + `/plugin install`. The installer prefers writing the
known-marketplace registration + enablement directly (scriptable, reversible) and the smoke test
confirms Claude Code honors it; if not, the documented fallback is the interactive `/plugin` flow,
with the installer still creating the marketplace manifest and printing the two commands to run.

**Rationale**: Using the marketplace manifest is the sanctioned plugin distribution path and keeps
the repo authoritative via a path-source marketplace. Adding `marketplace.json` is a small, durable
repo artifact (also the basis for any future public distribution). Residual uncertainty is confined
to *how enablement is persisted*, which the smoke test settles.

**Alternatives considered**: symlinking the plugin dir straight into a marketplace's `plugins/`
folder (unsupported, fragile against marketplace refresh); committing to a published GitHub
marketplace (out of scope — this is a local maintainer install, not registry distribution).

## Decision 5 — Codex placement (prompts dir + TOML `notify`)

**Observed**: `~/.codex/prompts/` does not exist yet (must be created). `~/.codex/config.toml`
exists with content and is real TOML containing `[projects."..."]` and `[tui...]` table headers.

**Decision (prompts)**: Place the four `adapters/codex/prompts/*.md` into `~/.codex/prompts/`
(symlink each file, or the prompts dir, back to the repo; copy in copy mode). Create the dir if
absent.

**Decision (notify)**: Insert a single managed `notify = ["node", "<resolved-bridge>/dist/index.js",
"notify"]` line into `config.toml`, with `<resolved-bridge>` resolved to the absolute path of the
installed Codex bridge. **Critical TOML rule**: a bare key belongs to whatever table header precedes
it, so the managed `notify` MUST be written into the **root table — before the first `[table]`
header**, never appended at end-of-file (which would nest it under `[tui...]`). The line is preceded
by the sentinel comment marker. Install behavior: if no managed `notify` exists, insert it at the top
of the root table; if a managed one exists, update it in place; if the user has their *own*
unmarked top-level `notify`, conflict-stop unless `--force`. Uninstall removes only the managed line
(and its sentinel), leaving the rest of `config.toml` byte-intact.

**Rationale**: Codex's only automation hook is `notify` on `agent-turn-complete` (per the shipped
`config.example.toml`), so this single line is the whole auto-capture wiring. Correct root-table
placement is the one genuine TOML hazard and is handled explicitly. The sentinel + manifest make the
edit reversible and safe (SC-003, SC-005). Resolving `<BRIDGE>` to an absolute path satisfies FR-006
(no placeholder left behind).

**Implementation note**: To avoid a TOML-parser dependency (installer stays dep-free), the edit is
done by line-aware text manipulation anchored on the sentinel marker and the position of the first
`[` table header — covered directly by `tests/install/codex-notify.test.mjs`. If line-aware editing
proves too brittle in testing, the fallback is a tiny vendored minimal-TOML key-insert helper; the
dependency-free constraint is preferred but not worth incorrectness.

## Decision 6 — Build orchestration

**Decision**: Before placing an adapter, the installer checks whether `adapters/<x>/dist` exists and
is newer than `adapters/<x>/src` (mtime comparison of newest files). If missing/stale, run that
adapter's build (`npm run build` in the adapter dir; the core must be built first — run
`core` build if its `dist` is stale too). `--no-build` skips this and *requires* an up-to-date
`dist`, failing clearly otherwise. Build failure aborts that adapter only (best-effort across
adapters per FR-012), leaving no partial install.

**Rationale**: Symlink mode points at `dist/`, so a stale/missing `dist` would install a broken
adapter (FR-005). mtime staleness is a cheap, good-enough heuristic for a maintainer tool; `--no-build`
exists for CI/repeatable installs where the build is a separate prior step.

**Alternatives considered**: always build (slower, surprising); never build / require manual build
(more footguns). The chosen default (build-if-stale) is the safe, low-friction middle.

## Cross-cutting: idempotency, dry-run, reporting, best-effort

- **Idempotency**: every action first reads current state (symlink target, manifest, sentinel) and
  is a no-op when already in the desired state (SC-002).
- **Dry-run**: a single planning pass produces the action list; `--dry-run` prints it and returns
  before any filesystem mutation (FR-010, SC-006).
- **Reporting**: one report line per adapter — agent, target, mode, action
  (installed/updated/removed/skipped/conflict/no-op) — plus per-action detail (FR-011).
- **Best-effort**: in an `all` run, one adapter's failure/conflict does not abort the others; each
  adapter install is individually atomic (FR-012).
