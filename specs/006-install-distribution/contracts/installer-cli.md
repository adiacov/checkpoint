# Contract: Installer CLI (`scripts/install.mjs`)

The installer's public interface is its command line. This is the contract tests assert against.

## Invocation

```text
node scripts/install.mjs <verb> [flags]
```

### Verbs

| Verb        | Meaning                                                                              |
| ----------- | ----------------------------------------------------------------------------------- |
| `install`   | Place/link the selected adapters into their agent locations (build first if needed). |
| `uninstall` | Remove what this tool created for the selected adapters.                             |
| `status`    | Report current installed state per adapter; mutate nothing.                          |

Missing/unknown verb → exit non-zero with usage text.

### Flags

| Flag                   | Applies to        | Default     | Meaning                                                                 |
| ---------------------- | ----------------- | ----------- | ---------------------------------------------------------------------- |
| `--agent <a>`          | all               | `all`       | One of `claude`, `pi`, `codex`, `all`. Repeatable or comma-separated.   |
| `--mode <m>`           | install           | `symlink`   | `symlink` (preferred) or `copy` (fallback).                            |
| `--dry-run`            | install/uninstall | off         | Print the plan; make **no** filesystem changes.                       |
| `--force`              | install/uninstall | off         | Replace/remove user content at a target (overrides conflict-stop).     |
| `--no-build`           | install           | off (=build)| Skip building; require an up-to-date `dist/` or fail.                  |
| `--target-root <a=p>`  | all (test/advanced)| real homes | Override an agent's target root (used by tests; repeatable per agent).  |
| `-h`, `--help`         | all               | —           | Usage text; exit 0.                                                    |

## Behavioral contract

1. **Default mode is symlink** (FR-002). Symlink targets resolve into the repo so rebuilds are seen
   with no re-install (SC-007).
2. **Selection** (FR-004): `--agent` scopes the run; default is all three. Other agents are never
   touched when one is selected (SC-004).
3. **Build-if-stale** (FR-005): missing/stale `dist/` triggers a build (core first), unless
   `--no-build`, which then requires a current `dist/` or fails that adapter.
4. **Codex wiring** (FR-006): install places the four prompts AND inserts the managed `notify` line
   into `config.toml`'s **root table** with the bridge path resolved to an absolute path and a
   sentinel marker. No `<BRIDGE>` placeholder remains.
5. **Idempotency** (FR-007, SC-002): re-running with the same inputs makes no changes and reports
   `no-op`.
6. **Uninstall is exact** (FR-008, SC-003): removes only tool-created links/files and the managed
   `notify` line / marketplace registration; unrelated content is preserved.
7. **Conflict-stop** (FR-009, SC-005): a target holding user content (not a repo-pointing symlink,
   not in the manifest, no sentinel) is reported as `conflict` and left unchanged unless `--force`.
   The legacy pi `checkpoint.ts` is treated as user content.
8. **Dry-run** (FR-010, SC-006): prints the same plan the real run would execute and changes nothing.
9. **Reporting** (FR-011): one line per item — `agent`, `target`, `mode`, `action`, and a detail
   string. A final summary counts actions by type.
10. **Best-effort across adapters** (FR-012): one adapter's failure/conflict does not abort others;
    each item is atomic (no half-installed adapter).
11. **No global binary, no curation** (FR-013): the script is run from the repo only; it never reads
    or writes checkpoint content.

## Exit codes

| Code | Meaning                                                                                     |
| ---- | ------------------------------------------------------------------------------------------ |
| 0    | All selected items reached a successful terminal state (installed/updated/removed/no-op), or a clean dry-run/status. |
| 1    | At least one item ended in `conflict` (without `--force`) or `failed`. Other items still processed (best-effort) and reported. |
| 2    | Usage error (bad verb/flag).                                                               |

## Report format (example, illustrative)

```text
checkpoint install — mode=symlink  (dry-run)

  pi      ~/.pi/agent/extensions/checkpoint        symlink  installed
  claude  ~/.claude (marketplace: checkpoint)      config   installed
  codex   ~/.codex/prompts/ (4 prompts)            symlink  installed
  codex   ~/.codex/config.toml (notify)            config   installed

summary: 4 installed, 0 updated, 0 no-op, 0 conflict, 0 failed
```

Conflict example:

```text
  pi      ~/.pi/agent/extensions/checkpoint.ts     -        conflict  (legacy reference present; rerun with --force to replace)
```
