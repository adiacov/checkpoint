# Quickstart: pi Adapter

Validation/run guide. Proves the adapter works end-to-end against the real core. Implementation
details live in `tasks.md`; this is how you confirm it.

## Prerequisites

- Node ≥18.
- The core is built: `cd core && npm install && npm run build`.
- The adapter deps are installed: `cd adapters/pi && npm install`.

## Unit / contract checks (no pi needed)

```bash
cd adapters/pi
npm test        # transcript translation + command/lifecycle/neutrality contract
npm run lint    # prettier
npm run typecheck
```

Expected:
- **transcript tests** cover role/order preservation, each block-type mapping (`text`, `thinking`,
  `toolCall`, `image`, unknown), the bashExecution record form, and the skip-empty cases (a
  session with no real user text yields no real user message).
- **contract/neutrality tests** assert exactly four commands + two lifecycle handlers are
  registered with the documented reason mapping, and that no `src/` file re-implements checkpoint
  logic (imports the core for it).

## Scripted handler smoke test (fake `ExtensionAPI`, no pi TUI)

Because pi runs the extension in-process, the smoke test drives the default export with a stub
`pi`/`ctx` against a throwaway git repo, exercising the real core:

1. construct a stub `pi` (capturing `registerCommand`/`on` registrations, `exec` shelling to git)
   and a stub `ctx` (`cwd` = temp repo, `hasUI:true`, `ui.notify` capturing messages,
   `sessionManager` returning a few message entries);
2. invoke the registered `checkpoint-optin` handler → assert `.checkpoint.json`, `sessions/pending`,
   `sessions/archive`, `.gitkeep`s, and `.gitignore` rules are created;
3. invoke the `session_shutdown` handler (non-empty session) → assert one `.md` lands in
   `sessions/pending/` with `Reason: shutdown`; invoke again immediately → suppressed (dedup);
4. invoke `session_shutdown` with an empty session → no file written (skip-empty);
5. invoke the `session_start` handler with a pending file present → notifies the pending count;
6. invoke `checkpoint-status` → reports configured/enabled + counts.

This is the pi analogue of the Claude Code "bridge smoke test" and covers the same core path.

## In-agent smoke test (Principle V requirement — do once pi install lands)

Deferred to feature 006 (install). Once the extension is placed in `~/.pi/agent/extensions/`:

1. In an opted-in project, from the pi TUI run each command: `/checkpoint-optin`,
   `/checkpoint-status`, `/checkpoint`, `/checkpoint-disable` — confirm output matches
   `contracts/commands.md`.
2. End a session in an opted-in project with real conversation — confirm a checkpoint appears in
   `sessions/pending/` without any command.
3. Start a new session with pending checkpoints — confirm the pending-count notice appears.

## Maps to acceptance

- SC-001/parity → automatic checkpoint on `session_shutdown` (smoke step 3).
- SC-002 → all four command handlers produce the documented outputs (smoke steps 2, 6).
- SC-003 → capture/skip-empty/dedup/prune/pending-count match the reference (transcript + smoke
  tests).
- SC-004 → neutrality test (no checkpoint logic in adapter).
- SC-005 → mapping table updated (contracts/agent-mapping.md); add-an-agent steps followed.
- SC-006 → `npm test`, `npm run lint`, `npm run typecheck` all pass.
