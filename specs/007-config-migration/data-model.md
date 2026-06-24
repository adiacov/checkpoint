# Data Model: Config Single-Source Migration (007)

Filesystem only; no persistent state of its own (the presence of the two config files *is* the
state, which is what makes the migration idempotent).

## Entity: ConfigMigrationResult (core, per directory)

Returned by `migrateConfig(root, { apply })`.

| Field                  | Type                                                                                  | Notes                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `root`                 | absolute path                                                                         | The directory inspected.                                          |
| `action`               | `not-configured \| already-canonical \| migrated \| redundant-legacy-removed \| failed` | Classification per research.md Decision 2.                        |
| `canonicalPath`        | absolute path                                                                         | `<root>/.checkpoint.json`.                                        |
| `legacyPath`           | absolute path                                                                         | `<root>/.pi/checkpoint.json`.                                     |
| `wroteCanonical`       | boolean                                                                               | True when canonical was (or, in dry-run, *would be*) written.     |
| `removedLegacy`        | boolean                                                                               | True when legacy was (or *would be*) removed.                     |
| `error`                | string \| null                                                                        | Set when `action === "failed"` (malformed JSON, permission, etc.).|

**Invariants**:

- `migrated` ⇒ canonical written **before** legacy removed; on write failure → `action: "failed"`,
  `removedLegacy: false`, legacy left intact (FR-009, SC-006).
- `redundant-legacy-removed` ⇒ `wroteCanonical: false` (canonical left byte-unchanged), `removedLegacy: true`.
- `already-canonical` / `not-configured` ⇒ both flags false.
- In dry-run (`apply: false`), no filesystem mutation occurs; the flags describe the intended action.
- Never throws for a normal per-directory error — returns `failed` so the sweep stays best-effort.

## Entity: SweepOptions (script, parsed from CLI)

| Field          | Type            | Default                | Source flag        |
| -------------- | --------------- | ---------------------- | ------------------ |
| `root`         | path            | `dirname(REPO_ROOT)`   | `--root`           |
| `apply`        | boolean         | false (dry-run)        | `--apply`          |
| `force`        | boolean         | false                  | `--force`          |
| `piExtensions` | path            | `~/.pi/agent/extensions` | `--pi-extensions` (test/advanced) |

## Entity: SweepProjectOutcome (script, per project)

Wraps a `ConfigMigrationResult` with sweep-level disposition.

| Field        | Type                                                                                      | Notes                                              |
| ------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `path`       | absolute path                                                                            | The sibling project dir.                           |
| `gitState`   | `clean \| dirty \| non-git`                                                              | From `git -C <dir> status --porcelain`.            |
| `outcome`    | `migrated \| redundant-legacy-removed \| already-canonical \| not-configured \| skipped \| failed` | Final per-project disposition.                     |
| `detail`     | string                                                                                    | Reason (e.g. "dirty; --force to include", error).  |

**Disposition rules**:

- `gitState === "dirty"` and not `--force` ⇒ `outcome: "skipped"` (no migration attempted).
- Otherwise the core `action` maps straight through; a core `failed` ⇒ `outcome: "failed"`.
- Dry-run reports the action the project *would* get (identical to `--apply`), with no mutation.

## Entity: PreconditionGuard (script, one-time)

| Field             | Type    | Notes                                                                       |
| ----------------- | ------- | -------------------------------------------------------------------------- |
| `legacyPiPresent` | boolean | `<piExtensions>/checkpoint.ts` exists (old reference extension installed).   |
| `sharedCorePresent` | boolean | `<piExtensions>/checkpoint` exists (the `006` shared-core install).         |
| `blocksDeletion`  | boolean | `legacyPiPresent && !sharedCorePresent` → refuse legacy deletion w/o `--force`. |

## Entity: SweepReport (script)

Aggregate of `SweepProjectOutcome[]` plus a summary counting outcomes by type. Identical shape in
dry-run and `--apply` (SC-003). Drives the exit code: non-zero if any `failed`, or if the guard
blocked an intended deletion without `--force`.
