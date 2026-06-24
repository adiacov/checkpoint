# Quickstart: Config Single-Source Migration (007)

Consolidate every project to a single canonical `.checkpoint.json`, removing the legacy
`.pi/checkpoint.json`. Safe by default (dry-run); nothing changes until you pass `--apply`.

## Prerequisites

- Node.js ≥18, the core built (`cd core && npm install && npm run build`).
- Recommended: the shared-core pi adapter installed first (`node scripts/install.mjs install
  --agent pi`). The sweep refuses to delete legacy files while the *old* pi extension is the one
  installed (the `004`/`006` ordering guard) — install `006` or pass `--force` if you know better.

## Preview (default — changes nothing)

```bash
node scripts/migrate-configs.mjs                 # scans sibling projects (this repo's parent dir)
node scripts/migrate-configs.mjs --root /path/to/projects
```

Reads the per-project plan: `migrated`, `redundant-legacy-removed`, `already-canonical`,
`not-configured`, `skipped` (dirty git), or `failed`. No file is created, modified, or deleted.

## Apply

```bash
node scripts/migrate-configs.mjs --apply
node scripts/migrate-configs.mjs --apply --force     # also include dirty git repos + override the guard
```

For each legacy-only project this writes `.checkpoint.json` (preserving its settings, including a
disabled state and original `createdAt`) and removes `.pi/checkpoint.json`. Projects with both files
keep the canonical one and lose only the legacy one. It never commits anything.

## Verify

- No `.pi/checkpoint.json` remains under the scan root (for migrated/redundant projects):
  ```bash
  find <root> -maxdepth 2 -path '*/.pi/checkpoint.json'
  ```
- Each migrated project now has a `.checkpoint.json` whose effective config matches what it had
  before (use `/checkpoint-status` inside the project, or inspect the file).
- Re-run `--apply`: every project reports `already-canonical` / `not-configured` and nothing changes
  (idempotent).
- Review the uncommitted change in each touched repo (`git -C <project> diff`) and commit it yourself.

## Test (no real projects touched)

```bash
cd core && npm test                              # includes migrate.test.ts (per-directory logic)
cd ..   && node --test tests/migrate/*.test.mjs  # the sweep, against temp directory trees
```

Both run against temporary directories; your real sibling projects and `~/.pi` are never touched.
