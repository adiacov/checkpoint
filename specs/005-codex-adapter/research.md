# Phase 0 Research: Codex Adapter

Decisions grounded in current OpenAI Codex documentation (config + custom-prompts references,
verified 2026-06-24) and the existing `@checkpoint/core` API and adapter patterns.

## Codex surface (verified facts)

- **Custom prompts**: markdown files in `$CODEX_HOME/prompts/` (default `~/.codex/prompts/`),
  top-level only; `name.md` becomes the `/name` slash command. They support YAML front matter
  (`description`, `argument-hint`) and placeholders (`$1..$9`, `$ARGUMENTS`). They are **prompt
  expansions** injected as the user message — not code execution. OpenAI now marks custom prompts
  **deprecated** in favor of skills.
- **`notify`**: `config.toml` key `notify = ["program", "args…"]`. Codex runs the program with a
  single JSON argument. The **only** event today is `agent-turn-complete`; payload fields:
  `type`, `thread-id`, `turn-id`, `cwd`, `input-messages` (array of the turn's user messages),
  `last-assistant-message`. There is **no** session-start, session-end, or pre-compaction event.
- **Session transcript (rollout)**: JSONL under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`,
  one record per line (user prompts, model responses, tool calls/results, metadata). The exact
  per-line schema varies by Codex version.

## D1 — Reuse the bridge pattern (compiled Node CLI)

**Decision**: Build a thin compiled Node CLI (`src/index.ts` dispatch + `src/bridge.ts`) like the
Claude Code adapter. The `notify` program and the command prompts both invoke
`node <path>/dist/index.js <subcommand>`.

**Rationale**: Codex integrates by running external programs (the `notify` program; and a prompt
can tell the agent to run a shell command). That is exactly the Claude Code bridge model. pi's
in-process model does not apply (Codex extensions are not loaded in-process). Reusing the proven
pattern keeps the adapter thin and the repo consistent.

**Alternatives rejected**: an in-process extension (pi-style) — Codex has no such surface;
importing the claude-code bridge — would couple two adapters and violate the single-dependency
neutrality contract (see D6).

## D2 — Auto-capture on `agent-turn-complete`, reason `turn-complete`, dedup-bounded

**Decision**: The `notify` subcommand parses the `agent-turn-complete` JSON from `argv` and calls
`capture(cwd, "turn-complete", { entries, … })`. No adapter gating — the core decides
configured/enabled/skip-empty/dedup. Always exit 0.

**Rationale**: Turn completion is Codex's only automation signal, so it is the best available proxy
for "session activity." `turn-complete` is an honest reason (not `shutdown`, which Codex cannot
detect). The core's dedup window prevents a checkpoint on every turn; over a long session several
pending checkpoints may still accrue — accepted best-effort behavior, mitigated by a larger
`dedupWindowSeconds` and the recovery/archive workflow. Documented in the mapping table.

**Alternatives rejected**: reason `shutdown` — dishonest (no session-end); reason `reload` — would
be gated off by `includeReload`, suppressing nearly all captures; adapter-side "once per session"
suppression — that is checkpoint logic and would belong in the core, not the adapter.

## D3 — Transcript: notify payload primary, rollout best-effort for manual

**Decision**: For `notify`, build entries from the payload: each `input-messages` item → a `user`
entry; `last-assistant-message` → one `assistant` entry. For `manual`, best-effort read the newest
`~/.codex/sessions/**/rollout-*.jsonl` for the cwd and translate its conversation lines; if it
cannot be found or parsed, degrade to no entries (git-facts-only checkpoint).

**Rationale**: The payload schema is documented and stable and always contains the turn's user
message, so skip-empty behaves correctly for auto-capture. The rollout is richer but
version-fragile, so it is enrichment for the manual path only and must degrade gracefully (FR-009,
edge cases). This bounds the risk of the unverified rollout format to a best-effort path.

**Note**: The adapter never truncates / selects recent-N / de-dups — the core does. Translation
preserves order and roles (Principle III).

## D4 — Commands are prompt expansions that instruct the agent to run the bridge

**Decision**: Each of the four `prompts/*.md` files contains a short instruction telling the agent
to run the corresponding bridge subcommand via its shell tool and report the output (e.g.
`/checkpoint` → run `node <bridge> manual "$PWD"`). Front matter carries a `description`.

**Rationale**: Codex prompts cannot execute code directly — they become the user message. The only
way to reach the bridge from a command is to ask the agent to run it. This is inherently best-effort
(depends on the model following the instruction and having shell access), documented as such. The
command *names* are the canonical four (Principle II).

## D5 — Documented gaps, not emulation

**Decision**: Record in the per-agent mapping table: no start-of-session pending notice (no event;
`/checkpoint-status` covers it on demand); no true session-end (auto-capture approximated by
turn-complete); no reload/pre-compact event; prompt-only commands depend on the model. Do not invent
divergent behavior to fake any of these.

**Rationale**: Principle II permits a capability gap only when an agent's surface makes it
"genuinely impossible," and requires it be documented, not papered over. Each gap here is a true
surface limitation of Codex.

## D6 — Independent package, single runtime dependency

**Decision**: `adapters/codex` depends only on `@checkpoint/core`. The shared subcommands
(`optin`/`disable`/`status`/`manual`/`archive`) are re-expressed thinly here (a handful of
delegating functions), not imported from `@checkpoint/claude-code`.

**Rationale**: Each adapter is an independent thin wrapper (Principle V) and the neutrality test
asserts a single runtime dependency. The small duplication of *delegation glue* (not checkpoint
logic) is the intended shape; the actual logic stays once, in the core.

## D7 — No core changes expected

**Decision**: Treat the core as complete; if a genuine gap surfaces, add it to the core with tests,
never to the adapter.

**Rationale**: The core already exposes everything the bridge needs and the Codex adapter's needs
are a subset of what the Claude Code adapter already exercises.

## Open items / unknowns

- **Custom-prompts longevity**: OpenAI deprecates custom prompts in favor of skills, and there is
  observed version churn in the prompts directory behavior. The adapter uses prompts for v1 and
  documents skills as a future migration; the bridge itself is unaffected by that migration (skills
  could invoke the same bridge).
- **Rollout JSONL schema**: exact per-line shape is version-dependent. The manual-path parser is
  deliberately tolerant (extract `{role, content}` from recognizable conversation lines, drop the
  rest, never throw) and is covered by a representative fixture; real-Codex verification is part of
  the deferred in-agent smoke test (feature 006).
- **Bridge install path**: prompts/config reference a placeholder path; the real path is resolved by
  the install feature (006).
