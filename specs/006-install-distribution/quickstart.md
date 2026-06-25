# Quickstart: Install / Distribution (006)

How to install the adapters from this repo into your agents, verify it worked, and run the in-agent
smoke tests this feature unblocks. The repo is the single source of truth; agent dirs are install
targets.

## Prerequisites

- Node.js ≥18.
- The repo cloned locally. The installer builds adapters as needed (`--no-build` to skip).
- The agents you want to install for present on the machine (pi, Claude Code, and/or Codex).

## Install everything (symlink mode, default)

```bash
node scripts/install.mjs install            # all adapters, symlink-from-repo, builds if stale
```

Expected: a per-adapter report ending in a summary. Symlink mode means later `git pull` + rebuild is
picked up with no re-install.

### Install a single adapter

```bash
node scripts/install.mjs install --agent codex
```

### Preview without changing anything

```bash
node scripts/install.mjs install --dry-run
node scripts/install.mjs uninstall --dry-run
```

### Copy mode (fallback where symlinks aren't viable)

```bash
node scripts/install.mjs install --mode copy
```

## Verify

```bash
node scripts/install.mjs status            # reports what is installed per adapter
```

Manual spot-checks:

- **pi**: `~/.pi/agent/extensions/checkpoint` resolves into `<repo>/adapters/pi`. If the legacy
  `~/.pi/agent/extensions/checkpoint.ts` was present, install reported a conflict — re-run with
  `--force` to replace the old reference with the shared-core adapter.
- **Claude Code**: the repo is registered as a local marketplace and the `checkpoint` plugin is
  enabled (see report); `.claude-plugin/marketplace.json` exists at the repo root.
- **Codex**: `~/.codex/prompts/` holds the four prompt files and `~/.codex/config.toml` has a
  `notify = ["node", "<abs>/dist/index.js", "notify"]` line (preceded by the checkpoint sentinel
  comment, in the root table) with a real absolute bridge path — no `<BRIDGE>` placeholder.

## Uninstall

```bash
node scripts/install.mjs uninstall                 # all
node scripts/install.mjs uninstall --agent codex   # one
```

Expected: only tool-created links/files and the managed Codex `notify` line / Claude marketplace
registration are removed; unrelated config in `config.toml` and other extensions stay intact.

## Run the unblocked in-agent smoke tests

Installing makes the previously-deferred smoke tests runnable. Each is a manual in-TUI pass:

- **Claude Code (002 T031)**: open a Claude Code session in an opted-in project; run each
  `/checkpoint*` command; confirm auto-capture on session end/precompact and the startup pending
  notice. Note: slash-command bash receives `${CLAUDE_SKILL_DIR}` (not `$CLAUDE_PLUGIN_ROOT`, which is
  hook-only), and only for `SKILL.md`-based skills — hence the commands ship as `skills/<name>/SKILL.md`
  invoking `${CLAUDE_SKILL_DIR}/../../dist/index.js`.
- **pi (004 T023)**: open a pi session; run the four commands; confirm `session_start` pending
  notice and `session_shutdown` capture. Confirms pi's extension loader resolves the adapter +
  `@checkpoint/core` (validates Decision 3 in research.md; switch to the bundle fallback if not).
- **Codex (005 T024)**: in a Codex session, invoke the four custom prompts and confirm the bridge
  runs; complete a turn and confirm the `notify` program writes a best-effort checkpoint.

Record results against the respective `tasks.md` entries.

## Test the installer itself (no real agent dirs touched)

```bash
node --test tests/install/*.test.mjs
```

These exercise symlink/copy/idempotency/uninstall/conflict/dry-run and Codex `notify` root-table
insert/update/remove entirely against temporary target roots — the real `~/.pi`, `~/.codex`,
`~/.claude` are never modified.
