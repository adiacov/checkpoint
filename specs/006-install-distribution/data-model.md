# Data Model: Install / Distribution (006)

The installer has no persistent domain data beyond a small per-machine manifest. The "entities" here
are in-memory structures plus the one on-disk record. No database; filesystem only.

## Entity: Install Descriptor (static, per adapter)

Declarative knowledge of how one adapter is installed. The full set lives in `install.mjs`; adding an
agent = adding one descriptor (Principle V).

| Field            | Type                          | Notes                                                                                 |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `agent`          | `"claude" \| "pi" \| "codex"` | Stable key; also the `--agent` value.                                                  |
| `sourcePath`     | path (repo-relative)          | What is placed/linked (e.g. `adapters/pi`, `adapters/codex/prompts`).                  |
| `requiresBuild`  | boolean                       | If true, ensure `dist/` current before placing.                                       |
| `buildDir`       | path (repo-relative) \| null  | Where to run `npm run build` (and its `src`/`dist` for staleness).                     |
| `placements`     | Placement[]                   | One or more concrete placement actions (see below).                                   |
| `extraWiring`    | enum \| null                  | Non-file wiring step: `codex-notify` for Codex, `claude-marketplace` for Claude, null. |

### Placement (sub-entity)

| Field          | Type                       | Notes                                                              |
| -------------- | -------------------------- | ----------------------------------------------------------------- |
| `kind`         | `"link" \| "copy"`         | Effective kind = descriptor placement honoring the run `--mode`.  |
| `source`       | absolute path (in repo)    | Resolved from `sourcePath`.                                       |
| `target`       | absolute path (agent dir)  | Under the (overridable) target root for that agent.              |
| `targetIsDir`  | boolean                    | Directory entry (pi package dir) vs. single file (a prompt file). |

## Entity: Install Manifest (persisted: `.install/manifest.json`, git-ignored, per-machine)

The record of what this tool created on *this* machine, so uninstall removes exactly that and
conflict detection can tell tool-created from user content. Updated atomically after each successful
mutating action.

| Field        | Type            | Notes                                                                  |
| ------------ | --------------- | --------------------------------------------------------------------- |
| `version`    | number          | Manifest schema version (start at 1).                                  |
| `entries`    | ManifestEntry[] | One per installed item.                                                |

### ManifestEntry

| Field         | Type                          | Notes                                                                       |
| ------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `agent`       | `"claude" \| "pi" \| "codex"` | Which adapter.                                                               |
| `type`        | `"link" \| "copy" \| "config"`| `config` = a managed edit (Codex `notify`, Claude marketplace registration).|
| `target`      | absolute path                 | The created link/file, or the config file edited.                           |
| `mode`        | `"symlink" \| "copy"`         | Install mode used (for convergence on re-install with a different mode).     |
| `marker`      | string \| null                | Sentinel used for `config` edits (e.g. the Codex notify marker).            |
| `installedAt` | ISO-8601 string               | For the report / troubleshooting.                                           |

**Invariants**:

- An entry exists **iff** the item is currently installed by this tool (removed on uninstall).
- `copy` items are known *only* via the manifest (no on-disk marker), so the manifest is the source
  of truth for copy-mode uninstall.
- The manifest is advisory for *symlink* items (symlink-target-in-repo is independently sufficient),
  but is still written for a uniform report and for cross-mode convergence.

## Entity: Run Options (in-memory, parsed from CLI)

| Field         | Type                                  | Default     | Source flag            |
| ------------- | ------------------------------------- | ----------- | ---------------------- |
| `verb`        | `"install" \| "uninstall" \| "status"`| —           | positional             |
| `agents`      | set of agent keys                     | all three   | `--agent`              |
| `mode`        | `"symlink" \| "copy"`                 | `symlink`   | `--mode`               |
| `dryRun`      | boolean                               | false       | `--dry-run`            |
| `force`       | boolean                               | false       | `--force`              |
| `build`       | boolean                               | true        | `--no-build` sets false|
| `targetRoots` | map agent→root (test override)        | real homes  | env/flag override      |

## Entity: Planned Action & Report Entry (in-memory)

The planner converts (descriptors × run options × current on-disk state) into an ordered list of
Planned Actions; execution turns each into a Report Entry. Dry-run prints the plan without executing.

| Field      | Type                                                                              | Notes                                  |
| ---------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| `agent`    | agent key                                                                         |                                        |
| `target`   | absolute path                                                                     |                                        |
| `mode`     | `"symlink" \| "copy" \| "config"`                                                 |                                        |
| `action`   | `installed \| updated \| removed \| skipped \| conflict \| no-op \| build \| failed` | Terminal outcome per item.             |
| `detail`   | string                                                                            | Human-readable reason (e.g. conflict). |

**State transitions (per item, install verb)**:

```
absent            --(plan)--> installed
present+correct   --(plan)--> no-op
present+tool+stale--(plan)--> updated        (e.g. mode change, copy re-sync)
present+user      --(plan)--> conflict       (unless --force → updated)
build stale       --(plan)--> build (then installed/updated)
any + error       ----------> failed         (atomic: item left unchanged or fully rolled back)
```

For **uninstall**: tool-created item → `removed`; absent → `no-op`; user content → never touched.
