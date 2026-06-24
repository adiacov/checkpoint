# Data Model: Codex Adapter

Phase 1 output. The adapter introduces **no persisted entities** (config/checkpoints belong to the
core). Its only data work is translating Codex conversation inputs into the core's
`ConversationEntry[]`. Target shapes are the core's `ConversationEntry` / `ContentBlock`
(`core/src/types.ts`) and rendering (`core/src/entries.ts`).

## Target: core `ConversationEntry`

```ts
interface ConversationEntry { role: string; timestamp?: string; content: string | ContentBlock[] | Record<string, unknown>; }
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking" }
  | { type: "toolCall"; name: string; arguments?: unknown }
  | { type: "image" }
  | { type: string; [k: string]: unknown };
```

The core selects the last `recentEntries`, truncates each to `maxTextPerEntry`, omits thinking, and
runs skip-empty via `isRealUserMessage` (`role:"user"` with non-empty text). The adapter does none
of that.

## Source A — `agent-turn-complete` notify payload (PRIMARY, stable)

Codex passes one JSON argument to the `notify` program. Relevant fields:

| Field | Meaning |
| --- | --- |
| `type` | event kind; the adapter acts only on `"agent-turn-complete"` |
| `cwd` | working directory of the session (the project) |
| `input-messages` | array of the turn's user message strings |
| `last-assistant-message` | the latest assistant response text (may be absent) |
| `thread-id`, `turn-id` | identifiers (not needed for capture; may be ignored) |

**Translation rules**:

- A1. Act only when `type === "agent-turn-complete"`; otherwise produce no entries (no capture).
- A2. For each string in `input-messages` (in order) → `{ role: "user", content: <string> }`.
- A3. If `last-assistant-message` is a non-empty string → append `{ role: "assistant", content:
  <string> }`.
- A4. Order: all user messages first (input order), then the assistant message — the turn's order.
- A5. A non-array / missing `input-messages` yields no user entries (the core then skip-empties).

Because a real turn always carries at least one user message, A2 guarantees a real user message so
the core's skip-empty passes for genuine turns (V1 below).

## Source B — Codex session rollout JSONL (BEST-EFFORT, manual command only)

Newest `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` for the cwd. One JSON record per line; the
exact schema **varies by Codex version**, so the parser is deliberately tolerant.

**Translation rules**:

- B1. Read the file, split into lines, `JSON.parse` each; a line that fails to parse is skipped
  (never throws).
- B2. From each record, extract a role and content by probing known locations, in order:
  `record.role` / `record.payload.role` / `record.message.role`; and `record.content` /
  `record.payload.content` / `record.message.content`.
- B3. Keep only records whose resolved role is a conversation role (`user`, `assistant`, `system`,
  `tool`); drop everything else (tool-call metadata, token usage, etc.).
- B4. Content mapping:
  - string → kept as string content.
  - array → mapped per block: any text-bearing block (Codex uses `text`, `output_text`,
    `input_text`, …, i.e. a string `text` field) → `{type:"text", text}`; otherwise a block whose
    `type` matches the core vocabulary (`thinking`/`toolCall`/`image`) → that block (payload-free for
    thinking/image); anything else → an open block with its `type`.
  - otherwise → the record passed through as a `Record` (core stringifies it).
- B5. Order preserved; no truncation/recent-N/dedup (the core does those).
- B6. If the file is missing/empty/unreadable, return `[]` — graceful degradation. The manual
  checkpoint then carries no conversation entries; the core writes it when the session otherwise has
  a real user message, or skip-empties a wholly empty session (same rule as every other adapter —
  the adapter does not special-case it).

## Validation / invariants

- V1. A genuine `agent-turn-complete` payload yields ≥1 `user` entry, so the core's skip-empty does
  not suppress a real turn (FR-003).
- V2. A payload with no user messages (or a non-`agent-turn-complete` type) yields no real user
  message → the core suppresses capture (skip-empty / no-op).
- V3. Order in is order out for both sources.
- V4. The adapter never truncates, selects recent-N, de-dups, ranks, or summarizes.
- V5. Malformed payload or rollout never throws; it degrades to "no entries" / "no capture".

## Inputs the bridge passes to the core (`CoreDeps`)

- `entries`: the translated `ConversationEntry[]` (capture only).
- `sessionFile`: the rollout path when known (manual), else the `thread-id` (notify) — the "Session
  file" header value; optional.
- `runGit` / `now`: defaults (the core supplies a `node:child_process` git runner and real clock).
