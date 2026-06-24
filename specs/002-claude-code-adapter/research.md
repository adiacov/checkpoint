# Research: Claude Code Adapter

Phase 0 output. Resolves the integration unknowns. Claude Code mechanics verified against the
official docs (code.claude.com/docs/en/hooks and /plugins-reference, fetched 2026-06-24); parity
mappings verified against `reference/checkpoint.ts`.

## Decision 1 — Package as a Claude Code plugin

**Decision**: Ship the adapter as a Claude Code plugin directory `adapters/claude-code/` with a
`.claude-plugin/plugin.json` manifest, default `commands/` (markdown slash commands), and
`hooks/hooks.json`.

**Rationale**: A plugin is the one Claude Code surface that bundles slash commands *and* lifecycle
hooks *and* its own scripts as a single installable, self-contained unit — exactly the "thin
documented wrapper" Principle V wants. `${CLAUDE_PLUGIN_ROOT}` gives bundled scripts a stable
absolute path so the repo stays the source of truth.

**Alternatives considered**: (a) Loose project-level `.claude/commands/` + `.claude/settings.json`
hooks — not self-contained, not portable across projects, harder to install once. (b) An MCP
server — heavier, introduces a long-running process and an SDK-like surface the constitution warns
against. Rejected.

## Decision 2 — One thin Node bridge, invoked by both hooks and commands

**Decision**: A single compiled entry `dist/index.js` with subcommands (`session-start`,
`session-end`, `pre-compact`, `manual`, `optin`, `disable`, `status`). Hooks invoke it with the
hook JSON on stdin; slash commands invoke it via Bash. It translates and calls `@checkpoint/core`;
it holds no checkpoint logic.

**Rationale**: Slash-command markdown files are prompts, not code, and hook commands are shell
commands — both need a deterministic executable to reach the core. One entry keeps the wrapper
thin and gives a single place to assert "no logic here."

**Alternatives considered**: Separate scripts per event (more files, duplicated arg/stdin
plumbing). Inlining logic in command markdown (non-deterministic, violates Principle I). Rejected.

## Decision 3 — Lifecycle → core mapping and capture reasons

**Decision**:

| Claude Code event | stdin fields used | Core call | Reason |
| --- | --- | --- | --- |
| `SessionStart` | `cwd` | `sessionStart(cwd)` → notice | n/a |
| `SessionEnd` | `cwd`, `transcript_path` | `capture(cwd, "shutdown", deps)` | `shutdown` |
| `PreCompact` | `cwd`, `transcript_path` | `capture(cwd, "reload", deps)` | `reload` (gated by `includeReload`) |
| `/checkpoint` (manual) | resolved cwd + newest transcript | `capture(cwd, "manual", deps)` | `manual` |

**Rationale**: Mirrors the reference's `session_shutdown` handling: `reason ?? "shutdown"`, reload
gated by `includeReload`, manual command uses `"manual"`. PreCompact is the natural analog of pi's
"reload" (context is about to be discarded/compacted). The `includeReload` gate is enforced by the
**core** (`capture` returns `skippedReason: "reload"` when configured), so the adapter passes the
reason and lets the core decide — no adapter-side gating logic.

**Alternatives considered**: Mapping PreCompact to `"shutdown"` — loses the user's `includeReload`
control and diverges from reference. Subscribing only to `SessionEnd` — misses the most common
context-loss moment (auto-compaction). Rejected.

## Decision 4 — Reading the transcript

**Decision**: For hook subcommands, read the JSONL file at `transcript_path` from the hook stdin
payload. For the manual command (no `transcript_path` is provided to slash commands), resolve the
newest `*.jsonl` under Claude Code's project transcript directory for the current `cwd`. Parse
line-delimited JSON; map each message to one `ConversationEntry` (see data-model.md). The adapter
does **not** bound or truncate — the core's `recentEntries` / `maxTextPerEntry` own that.

**Rationale**: `transcript_path` is provided on stdin for SessionStart/SessionEnd/PreCompact, so
hooks are exact. The manual path is the only place we must locate the transcript ourselves; using
the newest project transcript for the cwd is deterministic and matches "capture where I am now."

**Alternatives considered**: Having the model paste conversation into the command — unreliable,
violates raw-capture faithfulness. Skipping manual capture entirely — breaks command-surface
parity (Principle II). Rejected.

## Decision 5 — Not-opted-in / disabled behavior comes from the core

**Decision**: The bridge always calls the core and surfaces the core's result. Not-configured and
disabled produce `capture` skip results (`skippedReason: "not-configured" | "disabled"`); the
bridge reports them and exits 0 (no error). Lifecycle captures in a non-opted-in project are
therefore silent no-ops by construction. The manual command additionally prints the
"disabled — run opt-in first" guidance to match the reference's manual UX.

**Rationale**: Keeps all gating in the core (Principle I) and guarantees FR-007 (silent no-op) and
FR-008 (surface skips/failures) without adapter branching logic.

## Decision 6 — Tooling parity with `core/`

**Decision**: TypeScript + ESM, `tsc` build to `dist/`, tests via `node --import tsx --test`,
prettier for lint/format — identical to `core/package.json`. Depend on the core via
`"@checkpoint/core": "file:../../core"`.

**Rationale**: One toolchain across the repo lowers cognitive load and lets the adapter import the
core's built types directly. `file:` dependency keeps the repo authoritative pending the install
feature (006).

**Alternatives considered**: Plain `.mjs` with no build — loses type-checking against the core's
`ConversationEntry`/`CoreDeps` contracts, which is exactly where adapter bugs would hide. Rejected.

## Open / deferred (out of scope here)

- **Install/distribution** (symlink vs copy into Claude's plugin dir): feature 006. This feature
  documents the install pointer only.
- **Recovery of pending checkpoints into memory**: feature 003.
- **Hard-kill capture**: impossible via hooks — documented capability gap (agent-mapping.md).
