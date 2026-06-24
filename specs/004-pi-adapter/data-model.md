# Data Model: pi Adapter

Phase 1 output. The adapter introduces **no persisted entities** (config/checkpoints belong to the
core). Its only data work is translating one pi session-manager entry into one core
`ConversationEntry`. Source shapes are taken from `reference/checkpoint.ts` (the authoritative pi
usage: `getRecentMessageEntries`, `messageToText`, `hasUserMessage`); the target is the core's
`ConversationEntry` / `ContentBlock` (`core/src/types.ts`) and its rendering (`core/src/entries.ts`).

## Source: pi session-manager entry

`ctx.sessionManager.getBranch()` (or `getEntries()` when `getBranch` is absent) returns entries.
Relevant fields (per the reference):

- `entry.type`: entry kind — conversation entries are `"message"`; other kinds exist and are dropped.
- `entry.timestamp`: fallback timestamp when the message has none.
- `entry.message`: `{ role, content, timestamp? }`, plus, for bash entries, top-level
  `command` / `output` (role `"bashExecution"`).

**Message content forms** (per the reference's `messageToText`):

| Form | Shape |
| --- | --- |
| plain text | `message.content` is a `string` |
| structured | `message.content` is an array of blocks |
| bash execution | `message.role === "bashExecution"`, with `message.command` / `message.output` |

**Block shapes** (in `message.content` arrays) — note pi already uses the core's block vocabulary:

| pi block | Fields |
| --- | --- |
| `text` | `{ type:"text", text }` |
| `thinking` | `{ type:"thinking", … }` |
| `toolCall` | `{ type:"toolCall", name, arguments }` |
| `image` | `{ type:"image", … }` |
| other | `{ type:"<other>", … }` |

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

Core rendering (`entries.ts`, so the mapping is intentional): string content → itself;
`role:"bashExecution"` with `{command, output}` → ``$ <command>\n<output>``; `text`→its text;
`thinking`→`[thinking omitted]`; `toolCall`→`[tool call: <name>] <args json>`; `image`→
`[image omitted]`; other → `[<type>]`. Per-entry truncation (`maxTextPerEntry`) and last-N
selection (`recentEntries`) are done by the core — the adapter does neither.

## Translation rules

**Entry selection**:

- R1. Include only entries with `entry.type === "message"` and a truthy `entry.message`. Drop all
  other entry kinds.
- R2. Preserve order.

**Per-entry mapping**:

- R3. `role` ← `message.role` (default `"unknown"` if absent).
- R4. `timestamp` ← `message.timestamp` (ISO-normalized) when present, else `entry.timestamp`
  (omit if neither).
- R5. `content`:
  - **bashExecution** (`message.role === "bashExecution"`): `{ command: message.command, output:
    message.output }` (the record form `entries.ts` expects, so it renders ``$ cmd\noutput``).
  - **string**: keep as the entry's string content.
  - **array**: map each block by type (R6) into a `ContentBlock[]`.
  - **otherwise**: pass the `message` object through as a `Record` (the core stringifies it),
    preserving the reference's "stringify the whole message" fallback for unknown content.
- R6. Block type mapping (near-identity — pi already uses the core's block names):
  - `text` → `{ type:"text", text }`
  - `thinking` → `{ type:"thinking" }` (payload dropped; the core omits it anyway)
  - `toolCall` → `{ type:"toolCall", name, arguments }`
  - `image` → `{ type:"image" }`
  - anything else → passed through with its original `type` (open block → renders `[<type>]`)

**Skip-empty correctness (R7)**: pi reports genuine user input under `role:"user"` with text, and
has no "tool result delivered as a user message" convention (unlike the Claude transcript). So the
adapter needs **no** `user → tool` role remap: a session whose only `user` entries carry real text
is non-empty; a session with no such entry is empty. The core's `isRealUserMessage` /
`hasUserMessage` then decide skip-empty exactly as the reference did. (This is a documented,
intentional difference from the Claude Code adapter's R7, not a parity gap.)

## Validation / invariants

- V1. No entry is dropped except by R1; every retained entry yields exactly one `ConversationEntry`.
- V2. Order in is order out.
- V3. A session containing no real user-text entry yields no real user message, so the core's
  skip-empty guard suppresses the capture (FR-006, parity with reference `hasUserMessage`).
- V4. The adapter never truncates, slices to recent-N, de-dups, ranks, or summarizes — only the
  mappings above; everything else is the core's.

## Inputs the adapter passes to the core (`CoreDeps`)

- `entries`: the translated `ConversationEntry[]` (capture only).
- `sessionFile`: `ctx.sessionManager.getSessionFile?.()` (the checkpoint's "Session file" header).
- `runGit`: a thin wrapper over `pi.exec` (see research D2) — plumbing, not logic.
- `now`: default (real clock).
