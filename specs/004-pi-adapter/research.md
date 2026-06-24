# Phase 0 Research: pi Adapter

Decisions that shape the adapter, each grounded in `reference/checkpoint.ts` (the parity baseline)
and the already-complete `@checkpoint/core` API (`core/src/api.ts`, `core/src/types.ts`).

## D1 — In-process extension, not an external bridge

**Decision**: Build the adapter as a single pi extension module (`adapters/pi/src/index.ts`) whose
default export receives pi's `ExtensionAPI` and registers handlers that call the core's async
functions directly.

**Rationale**: pi loads `.ts` extensions in-process (the reference is `~/.pi/agent/extensions/
checkpoint.ts`, a default-exported `function checkpointExtension(pi: ExtensionAPI)`). It already
has direct access to the core's functions via a normal import. The Claude Code adapter needs an
out-of-process Node "bridge" only because Claude Code invokes hooks/slash-commands by shelling out
to a command; pi has no such indirection. Reproducing a bridge here would add ceremony with zero
benefit and would not be "thin".

**Alternatives rejected**: (a) compiled CLI + bridge like Claude Code — unnecessary indirection;
(b) re-using the claude-code `dist/index.js` from pi — wrong transcript source (JSONL vs. live
session manager) and wrong invocation model.

## D2 — Git facts via injected `runGit` delegating to `pi.exec`

**Decision**: Pass `CoreDeps.runGit` as a thin wrapper over `pi.exec(command, args)` (forwarding a
`cwd` option if pi's exec supports one; otherwise best-effort, matching the reference which ran git
from pi's process cwd).

**Rationale**: The reference collected git facts through `pi.exec`, not `node:child_process`. Doing
the same (a) preserves exact parity, (b) avoids assuming `child_process` is available/allowed in
pi's extension runtime, and (c) keeps the command runner as plain plumbing — `CoreDeps.runGit` is an
explicit injection seam, not checkpoint logic. The core still decides *which* git commands to run
and how to render them.

**Alternatives rejected**: relying on the core's `defaultRunner` (`spawn`) — works in Node but
risks differing from how pi expects extensions to run subprocesses, and silently diverges from the
reference's execution path.

## D3 — Transcript from the live session manager

**Decision**: For both lifecycle capture and the manual command, translate the live
`ctx.sessionManager` entries (`getBranch()` when present, else `getEntries()`) into
`ConversationEntry[]`. There is no transcript *file* to parse.

**Rationale**: This is exactly what the reference does (`getRecentMessageEntries`,
`hasUserMessage`). Unlike Claude Code (where slash commands get no transcript and the bridge must
locate the newest JSONL), pi hands every handler a `ctx.sessionManager`, so the manual command and
lifecycle handlers share one translation path. `ctx.sessionManager.getSessionFile?.()` supplies the
core's optional "Session file" header value.

**Note**: The adapter does NOT slice to `recentEntries`, truncate, or run skip-empty — it passes
all translated entries; the core selects/truncates/decides (parity with how the reference's core
logic now lives centrally).

## D4 — The core owns every decision; the adapter maps reasons only

**Decision**: `session_shutdown` passes `event.reason ?? "shutdown"` straight into
`capture(cwd, reason, deps)`. The adapter does **not** check `includeReload`, skip-empty, dedup,
configured/enabled, or prune — the core's `capture` / `sessionStart` guards do.

**Rationale**: Principle I + IV. The reference performed these checks inline; the core now performs
them (`api.ts` `capture` guard order: not-configured → disabled → reload → empty-session →
duplicate; `sessionStart` does prune + pending count). Re-checking in the adapter would duplicate
logic and risk drift. The one mapping the adapter owns is reason naming (`reload` stays `reload` so
the core can gate it; everything else → `shutdown`), matching the reference and the Claude Code
adapter's reason table.

## D5 — Command names: canonical, not reference-literal

**Decision**: Register `checkpoint`, `checkpoint-optin`, `checkpoint-disable`, `checkpoint-status`.

**Rationale**: Principle II requires the identical cross-agent surface. The reference registered the
enable command as `checkpoint-enable`; this adapter uses the canonical `checkpoint-optin` (as the
Claude Code adapter does and as the `002` agent-mapping table already anticipated for pi). This is a
name change only — behavior (write config, create dirs/ignore rules) is identical, so parity
(behavioral) is preserved. Documented in contracts/agent-mapping.md.

## D6 — UI guards and error surfacing match the reference

**Decision**: Notify via `ctx.ui.notify(msg, "info"|"error")` only when a UI surface exists
(`ctx.hasUI`); wrap lifecycle handlers in try/catch and surface failures as an error notification
rather than throwing.

**Rationale**: The reference guards every notify with `ctx.hasUI` and catches errors in
`session_start`/`session_shutdown` so a checkpoint failure never breaks the session (FR-014). The
adapter reproduces these guards; the *content* of messages comes from formatting the core's typed
results (mirroring the claude-code `formatCapture`/`formatArchive` helpers, minus archive which pi's
reference never exposed as a command).

## D7 — No core changes expected

**Decision**: Treat the core as complete. If a genuine capability gap surfaces during
implementation, add it to the core (with its own tests), never to the adapter.

**Rationale**: The core already exposes `detectProject`, `optIn`, `disable`, `status`,
`sessionStart`, `capture`, `archive` and already reads legacy `.pi/checkpoint.json`
(`config.ts`/`loadConfig`). The adapter's needs are a strict subset of what the Claude Code adapter
already exercises.

## Open items / unknowns

- **Exact pi `ExtensionAPI` types** (e.g. whether `pi.exec` accepts a `cwd` option, the precise
  `session_shutdown` event shape, `sessionManager` method names) are taken from
  `reference/checkpoint.ts`, which is the authoritative usage. The adapter mirrors the reference's
  access patterns; the type-only dev dependency `@earendil-works/pi-coding-agent` provides the
  signatures at build time. Any signature mismatch surfaces at typecheck and is resolved against the
  installed SDK, not by adding logic.
