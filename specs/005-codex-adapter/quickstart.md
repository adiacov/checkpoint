# Quickstart: Codex Adapter

Validation/run guide. Proves the adapter works end-to-end against the real core. Implementation
details live in `tasks.md`; this is how you confirm it.

## Prerequisites

- Node ≥18.
- The core is built: `cd core && npm install && npm run build`.
- The adapter is built: `cd adapters/codex && npm install && npm run build`.

## Unit / contract checks (no Codex needed)

```bash
cd adapters/codex
npm test        # transcript translation (payload + rollout) + command/notify/neutrality contract
npm run lint    # prettier
npm run typecheck
```

Expected: transcript tests cover the `agent-turn-complete` payload mapping (user messages +
last-assistant-message, order, skip-empty), the tolerant rollout parser (recognized roles kept,
unknown lines dropped, malformed never throws, missing file → `[]`). Contract test asserts the six
subcommands, the four prompts, the reason mapping (`notify`→`turn-complete`, `manual`→`manual`), and
the neutrality guard.

## Bridge smoke test (simulated notify + commands, no Codex)

In a throwaway git repo opted in via the bridge:

```bash
B=adapters/codex/dist/index.js

# 1. opt in
node $B optin "$PWD"

# 2. simulate an agent-turn-complete notification (Codex appends the JSON as the last arg)
node $B notify '{"type":"agent-turn-complete","cwd":"'"$PWD"'","input-messages":["do the thing"],"last-assistant-message":"done"}'

# 3. confirm a checkpoint landed
ls sessions/pending/        # expect one .md with "Reason: turn-complete"

# 4. a second identical notify within the dedup window is suppressed
node $B notify '{"type":"agent-turn-complete","cwd":"'"$PWD"'","input-messages":["again"],"last-assistant-message":"ok"}'
ls sessions/pending/        # still one file (dedup, core-decided)

# 5. status + manual
node $B status "$PWD"
node $B manual "$PWD"       # git-facts-only if no rollout for cwd; writes when a real turn exists
```

Expected: step 2 writes one checkpoint (reason `turn-complete`); an empty/`type`-mismatched payload
is skipped; a not-opted-in repo produces no file and no error; `status` reflects counts.

## In-agent smoke test (Principle V requirement — do once Codex install lands)

Deferred to feature 006 (install). Once `prompts/*.md` are in `~/.codex/prompts/` and the `notify`
snippet is in `~/.codex/config.toml`:

1. In an opted-in project, from Codex run each command: `/checkpoint-optin`, `/checkpoint-status`,
   `/checkpoint`, `/checkpoint-disable` — confirm the agent runs the bridge and output matches
   `contracts/commands.md`.
2. Complete a turn in an opted-in project with real conversation — confirm a checkpoint appears in
   `sessions/pending/` (reason `turn-complete`) without any command.
3. Confirm `/checkpoint-status` reports the pending count (the stand-in for the missing
   start-of-session notice).

## Maps to acceptance

- SC-001 → step 2 produces one `turn-complete` checkpoint.
- SC-002 → command subcommands produce the documented outputs (steps 1, 5).
- SC-003 → capture/skip-empty/dedup match the other adapters (transcript + smoke tests).
- SC-004 → neutrality test (no checkpoint logic in adapter).
- SC-005 → mapping table updated (contracts/agent-mapping.md); add-an-agent steps followed.
- SC-006 → `npm test`, `npm run lint`, `npm run typecheck` all pass.
- SC-007 → every gap recorded in contracts/agent-mapping.md; none emulated.
