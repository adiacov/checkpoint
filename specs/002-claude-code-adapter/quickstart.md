# Quickstart: Claude Code Adapter

Validation/run guide. Proves the adapter works end-to-end against the real core. Implementation
details live in `tasks.md`; this is how you confirm it.

## Prerequisites

- Node ≥18.
- The core is built: `cd core && npm install && npm run build`.
- The adapter is built: `cd adapters/claude-code && npm install && npm run build`.

## Unit / contract checks (no Claude Code needed)

```bash
cd adapters/claude-code
npm test        # transcript translation + command/hook contract
npm run lint    # prettier
npm run typecheck
```

Expected: transcript tests cover role/order preservation, each block-type mapping, the
`tool_result`-only → `role:"tool"` rule (skip-empty correctness), and sidechain filtering. Contract
test asserts four commands + three hooks with the documented reason mapping.

## Bridge smoke test (simulated hooks, no TUI)

In a throwaway git repo opted in via the core:

```bash
# 1. opt in (any agent's core works; using the adapter bridge here)
node adapters/claude-code/dist/index.js optin "$PWD"

# 2. feed a hook-shaped payload to the capture subcommand
printf '{"cwd":"%s","transcript_path":"%s","hook_event_name":"SessionEnd","reason":"other"}\n' \
  "$PWD" "/path/to/a/sample.jsonl" | node adapters/claude-code/dist/index.js session-end

# 3. confirm a checkpoint landed
ls sessions/pending/        # expect one .md with "Reason: shutdown"

# 4. start-of-session notice
echo '{"cwd":"'"$PWD"'","hook_event_name":"SessionStart","source":"startup"}' \
  | node adapters/claude-code/dist/index.js session-start   # prints pending count
```

Expected: step 2 writes one checkpoint (reason `shutdown`); a second identical run within the dedup
window is suppressed; an empty/system-only transcript is skipped; `status` reflects counts.

## In-agent smoke test (Principle V requirement — do before declaring done)

1. Install the plugin into Claude Code (dev/in-place install; see README; full install is feature
   006).
2. In an opted-in project, from the Claude Code TUI run each command: `/checkpoint-optin`,
   `/checkpoint-status`, `/checkpoint`, `/checkpoint-disable` — confirm output matches
   `contracts/commands.md`.
3. End a session (and run `/compact`) in an opted-in project with real conversation — confirm a
   checkpoint appears in `sessions/pending/` without any command.
4. Start a new session with pending checkpoints — confirm the pending-count notice appears.

## Maps to acceptance

- SC-001/parity → command outputs match `contracts/commands.md`.
- SC-002 → step 3 produces exactly one file.
- SC-003 → step 4 count matches `ls sessions/pending/ | wc -l`.
- SC-004 → transcript tests with tool_use/thinking/image lose no message.
- SC-005 → contract test C3 (no checkpoint logic in adapter).
- SC-007 → the in-agent smoke test above.
