<!--
SYNC IMPACT REPORT
==================
Version change: (template, unversioned) → 1.0.0
Bump rationale: Initial ratification — first concrete constitution replacing the
  unfilled template. MAJOR baseline (1.0.0) per semantic-versioning convention
  for the first adopted version.

Modified principles: none (initial definition)
Added principles:
  - I. Write the Logic Once (Agent-Neutral Core)
  - II. Identical Command Surface Everywhere
  - III. Raw Capture, Not Curation
  - IV. Functional Parity With the Reference Extension
  - V. Adding an Agent Is a Thin, Documented Wrapper
Added sections:
  - Technical Constraints & Boundaries
  - Development Workflow & Quality Gates
  - Governance

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md — Constitution Check is generic
       ("Gates determined based on constitution file"); no edit needed, derives
       gates from this file.
  - ✅ .specify/templates/spec-template.md — no constitution-coupled sections.
  - ✅ .specify/templates/tasks-template.md — no constitution-coupled categories.
  - ✅ Runtime guidance (PROJECT.md, BRIEF.md, ENGINEERING.md) — already
       consistent; principles here are derived from them.

Follow-up TODOs: none.
-->
# Checkpoint Constitution

## Core Principles

### I. Write the Logic Once (Agent-Neutral Core)

All checkpoint behavior — git facts collection, the markdown checkpoint format, opt-in
config handling, archive pruning, skip-empty/dedup, and the startup pending-count — MUST
live exactly once in the shared core. The core MUST NOT import any agent SDK or depend on
any agent-specific runtime. Per-agent extensions are thin wrappers that adapt only three
things: how commands are registered, how lifecycle triggers fire, and how the conversation
transcript is read. No checkpoint logic may be duplicated or forked into an adapter.

Rationale: Session-memory loss is agent-agnostic. Writing the logic once and surfacing it
through thin wrappers is the entire reason this project exists, and it is what keeps adding
a new agent cheap.

### II. Identical Command Surface Everywhere

Every supported agent MUST expose the same command set — `/checkpoint`,
`/checkpoint-optin` (enable), `/checkpoint-disable`, `/checkpoint-status` — invoked from
inside that agent's TUI, all calling the shared core and producing identical behavior.
Commands MUST NOT diverge in name, semantics, or output across agents except where an
agent's surface makes a capability genuinely impossible (e.g. no auto-exit hook), in which
case the gap MUST be documented, not papered over with divergent behavior.

Rationale: The user works across many agents; a uniform surface is what makes the tool feel
like one tool rather than N reimplementations.

### III. Raw Capture, Not Curation

Checkpoints are raw end-of-session recovery evidence — git facts plus recent conversation —
written to `sessions/pending/` as markdown. The extensions MUST NOT attempt to summarize,
rank, or promote checkpoint content into durable memory. Turning evidence into durable
memory is the consuming project's instructions/agent job, never the extension's.

Rationale: Keeping capture dumb and faithful preserves recoverability and keeps the core
small; curation is a separate concern with separate authority.

### IV. Functional Parity With the Reference Extension

The pi extension (`checkpoint.ts`) is the reference implementation. The generalized core
plus adapters MUST preserve its observable behavior: no real feature regresses in the move
to the shared-core architecture. Any intentional behavior change MUST be called out
explicitly and justified, not introduced silently during extraction.

Rationale: The reference already works in daily use; "generalize without regressing" is the
contract that lets the rewrite be trusted.

### V. Adding an Agent Is a Thin, Documented Wrapper

Supporting a new coding agent MUST be achievable by writing one adapter under
`adapters/<agent>/` that registers the four commands and lifecycle handlers and calls the
shared core — with zero logic duplicated. The documented add-an-agent procedure (identify
extension surface → write adapter → wire install → update the mapping table → smoke-test)
MUST be followed and kept current. Capability gaps for an agent MUST be recorded in the
per-agent mapping table.

Rationale: "Adding an agent is a small, well-defined task, not a rewrite" is a first-class
product requirement, and it only holds if the wrapper stays thin and the procedure stays
documented.

## Technical Constraints & Boundaries

- **Language**: The shared core stays Node/TS; the existing ~460-line logic ports almost
  verbatim. Adapters use whatever each agent's extension surface requires.
- **Opt-in config**: A project opts in via `.checkpoint.json` at its root (agent-neutral),
  tracked in git so opt-in and tuning travel with the repo. Adapters MAY read the legacy
  `.pi/checkpoint.json` during transition.
- **Artifact placement**: Raw checkpoint captures are git-ignored — the entire pending/archive
  directory contents (`sessions/pending/*`, `sessions/archive/*`), not just markdown, because they
  are transient session evidence that may contain secrets/tokens/local paths and must never be
  published. `.gitkeep`s are kept (via `!`-negations) so the empty dirs stay tracked.
  `/checkpoint-optin` creates the directories and these ignore rules (creating `.gitignore` if absent).
- **Install**: Symlink-from-repo is the preferred install (single source of truth);
  copy+sync is the fallback. The repo is authoritative; agent extension dirs are install
  targets.
- **Non-goals (MUST NOT)**: no global `checkpoint` binary on `PATH`; not part of
  `agent-workspace`; not a memory curator; not responsible for hard-kill capture (lifecycle
  hooks cannot fire on `kill -9`/crash — an inherent, documented gap).

## Development Workflow & Quality Gates

- **Ship order**: core → Claude plugin → pi extension → Codex. The two actually-used
  adapters (Claude, pi) precede Codex.
- **Parity check**: Changes to the core MUST be validated against reference (pi) behavior
  before adapters are considered done.
- **Smoke test per agent**: each command from the TUI, automatic checkpoint on exit (where
  supported), and the startup pending notice MUST be exercised before an adapter is
  declared working.
- **Engineering practices**: `ENGINEERING.md` governs implementation defaults (minimal
  precise changes, tests for important behavior, run available quality gates, state what was
  not verified). `WORKFLOWS.md` governs session/process workflow. This constitution governs
  the non-negotiable product architecture.

## Governance

This constitution supersedes other practices where they conflict on the matters it covers
(core/adapter separation, command surface, capture semantics, parity, and add-an-agent
discipline). `ENGINEERING.md` and `WORKFLOWS.md` remain authoritative for implementation
and process detail respectively and are not overridden except on direct conflict with a
principle here.

Amendments MUST be made by editing this file with a Sync Impact Report, a version bump, and
propagation to dependent templates/docs. Versioning follows semantic versioning:

- **MAJOR**: backward-incompatible removal or redefinition of a principle or governance rule.
- **MINOR**: a new principle or section, or materially expanded guidance.
- **PATCH**: clarifications, wording, and non-semantic refinements.

Compliance expectation: planning and implementation work MUST verify alignment with these
principles (the plan template's Constitution Check derives its gates from this file). Any
deviation MUST be justified explicitly in the relevant plan or PR, or the work MUST be
brought back into compliance.

**Version**: 1.0.0 | **Ratified**: 2026-06-20 | **Last Amended**: 2026-06-20
