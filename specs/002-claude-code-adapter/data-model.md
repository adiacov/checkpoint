# Data Model: Claude Code Adapter

Phase 1 output. The adapter introduces **no persisted entities** (config/checkpoints belong to the
core). Its only data work is translating one transcript line into one core `ConversationEntry`.
Shapes below are from a real transcript (`~/.claude/projects/<encoded-cwd>/<session>.jsonl`,
inspected 2026-06-24) and the core's `ConversationEntry` / `ContentBlock` (`core/src/types.ts`)
and rendering (`core/src/entries.ts`).

## Source: Claude Code transcript line (JSONL)

One JSON object per line. Relevant fields:

- `type`: line kind — `user`, `assistant`, plus non-conversation kinds (`system`, `attachment`,
  `file-history-snapshot`, `mode`, `permission-mode`, `ai-title`, `last-prompt`, `agent-name`, …).
- `timestamp`: ISO 8601 string (e.g. `"2026-06-24T06:18:11.409Z"`).
- `isSidechain`: boolean — true for subagent side conversations.
- `message`: `{ role, content }` where `content` is either a string or an array of blocks.

**Block shapes** (in `message.content` arrays):

| Claude block | Fields |
| --- | --- |
| `text` | `{ type:"text", text }` |
| `thinking` | `{ type:"thinking", thinking, signature }` |
| `tool_use` | `{ type:"tool_use", id, name, input }` |
| `tool_result` | `{ type:"tool_result", tool_use_id, content, is_error }` |

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

Core rendering (for reference, so the mapping is intentional): `text`→its text; `thinking`→
`[thinking omitted]`; `toolCall`→`[tool call: <name>] <args json>`; `image`→`[image omitted]`;
any other type→`[<type>]`. Per-entry text is truncated by the core (`maxTextPerEntry`) and only the
last `recentEntries` are kept — the adapter does none of this.

## Translation rules

**Line selection** (which lines become entries):

- R1. Include only lines whose `type` is `user` or `assistant` and that have a `message`. Drop all
  non-conversation line kinds.
- R2. Drop lines with `isSidechain === true` (subagent side conversations are not the primary
  session conversation).
- R3. Preserve transcript order.

**Per-line mapping**:

- R4. `timestamp` ← line `timestamp` (omit if absent).
- R5. `content`:
  - If `message.content` is a string → keep as the entry's string content.
  - If it is a block array → map each block by type (R6) into a `ContentBlock[]`.
- R6. Block type mapping:
  - `text` → `{ type:"text", text }`
  - `thinking` → `{ type:"thinking" }` (text intentionally dropped; core omits it)
  - `tool_use` → `{ type:"toolCall", name, arguments: input }`
  - `tool_result` → `{ type:"toolResult", isError, content }` (open block → renders `[toolResult]`)
  - `image` → `{ type:"image" }`
  - anything else → passed through with its original `type` (open block → renders `[<type>]`)

**Role mapping** (R7 — the skip-empty correctness rule):

- Default `role` ← `message.role`.
- **Exception**: if a `user`-role line's content is *only* `tool_result` block(s) (no string, no
  `text` block), map its `role` to `"tool"` instead of `"user"`. Rationale: Claude returns tool
  results under `role:"user"` by API convention; left as `user` they would satisfy the core's
  `isRealUserMessage` and defeat skip-empty. Genuine user text keeps `role:"user"`.

## Validation / invariants

- V1. No transcript line is dropped except by R1/R2; every retained line yields exactly one entry.
- V2. Order in is order out.
- V3. A transcript containing only tool results / system lines (no genuine user text) yields no
  real user message, so the core's skip-empty guard suppresses the capture (FR-006).
- V4. The adapter never truncates, de-dups, ranks, or summarizes — only the mappings above.

## Inputs the bridge passes to the core (`CoreDeps`)

- `entries`: the translated `ConversationEntry[]` (capture only).
- `sessionFile`: the resolved transcript path (for the checkpoint's "Session file" header).
- `runGit` / `now`: defaults (core supplies a `node:child_process` git runner and real clock).
