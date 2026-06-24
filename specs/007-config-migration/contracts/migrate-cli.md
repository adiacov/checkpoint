# Contract: Core `migrateConfig` + Sweep CLI

## Core: `migrateConfig(root, options?)`

```ts
migrateConfig(root: string, options?: { apply?: boolean }): ConfigMigrationResult
```

- Pure per-directory operation; reuses `loadConfig`/`normalizeConfig`/`writeConfig` from `config.ts`.
- `apply` defaults to `false` (dry-run: classify + set the `would*` flags, mutate nothing).
- Returns a `ConfigMigrationResult` (see data-model.md). Never throws for a normal per-directory
  failure (malformed legacy JSON, permission) — returns `action: "failed"` with `error` set.
- Guarantees: writes canonical before removing legacy; never removes legacy if canonical write fails;
  when both files exist, leaves canonical byte-unchanged and removes only legacy.
- Exported from `@checkpoint/core` (`core/src/index.ts`) alongside its result type.

## Sweep CLI: `scripts/migrate-configs.mjs`

```text
node scripts/migrate-configs.mjs [flags]
```

| Flag                     | Default                  | Meaning                                                            |
| ------------------------ | ------------------------ | ----------------------------------------------------------------- |
| `--root <path>`          | parent dir of this repo  | Scan root; immediate children are the candidate projects.         |
| `--apply`                | off (dry-run)            | Perform changes. Without it, nothing on disk changes.             |
| `--force`                | off                      | Include dirty git repos AND override the pi ordering guard.       |
| `--pi-extensions <path>` | `~/.pi/agent/extensions` | Override the dir checked by the ordering guard (tests/advanced).  |
| `-h`, `--help`           | —                        | Usage; exit 0.                                                    |

### Behavioral contract

1. **Dry-run default** (FR-005, SC-003): no `--apply` ⇒ report only, zero filesystem changes.
2. **Discovery** (FR-001): immediate child dirs of `--root`; each classified via `migrateConfig`.
3. **Preserve settings** (FR-002, FR-003, SC-002): legacy→canonical keeps enabled/disabled, tuning,
   and `createdAt` (delegated to the core's normalize/preserve).
4. **Both files** (FR-004): canonical wins (byte-unchanged), legacy removed.
5. **No commits** (FR-006, SC-005): the tool never invokes `git commit`.
6. **Dirty-git skip** (FR-007): in `--apply`, dirty git siblings are skipped+reported unless `--force`.
7. **Ordering guard** (FR-008): if legacy pi reference present and shared-core pi absent, refuse to
   delete legacy files unless `--force`.
8. **No data loss** (FR-009, SC-006): canonical written before legacy removed; legacy kept if write fails.
9. **Idempotent** (FR-010, SC-004): re-run ⇒ all already-canonical / not-configured; no changes.
10. **Best-effort** (FR-011): a failed project is reported and skipped; the sweep continues.
11. **Reporting** (FR-012): per-project `path`, `gitState`, `outcome`, detail + a summary; dry-run
    output matches `--apply`.

### Exit codes

| Code | Meaning                                                                                    |
| ---- | ----------------------------------------------------------------------------------------- |
| 0    | Completed; no failures and nothing blocked (clean dry-run or apply).                       |
| 1    | At least one project `failed`, or the ordering guard blocked a deletion without `--force`. |
| 2    | Usage error (bad flag, `--root` missing/not a directory).                                  |

### Report format (illustrative)

```text
checkpoint migrate-configs — root=/home/me/projects  (dry-run)

  /home/me/projects/old-app      clean    migrated                  legacy → canonical, remove legacy
  /home/me/projects/both-app     clean    redundant-legacy-removed  canonical kept, remove legacy
  /home/me/projects/new-app      clean    already-canonical
  /home/me/projects/wip-app      dirty    skipped                   dirty; --force to include
  /home/me/projects/notes        non-git  not-configured

summary: 1 migrated, 1 redundant-legacy-removed, 1 already-canonical, 1 skipped, 1 not-configured
```
