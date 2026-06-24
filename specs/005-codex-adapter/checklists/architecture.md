# Architecture-Compliance & Best-Effort-Integrity Checklist: Codex Adapter

**Purpose**: Validate that the spec/plan for the Codex adapter express the constitutional
architecture, honestly document Codex's best-effort gaps, and rest on externally-verified Codex
facts — clearly, completely, consistently — before implementation. Requirements-quality gate (PR
reviewer / release), not a code test.
**Created**: 2026-06-24
**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

## Constitution Alignment — Logic Once (Principle I)

- [x] CHK001 - Is the exhaustive set of decisions that MUST live in the core (config, git facts, markdown, skip-empty, dedup, prune, pending-count) enumerated so "no duplicated logic" is checkable? [Completeness, Spec §FR-008]
- [x] CHK002 - Is the closed list of adapter-permitted logic (command wiring, event parsing, transcript translation, result formatting) specified precisely enough to reject anything else? [Clarity, Spec §FR-008]
- [x] CHK003 - Is the enforcement mechanism (an automated neutrality test) required, not merely recommended? [Measurability, Spec §FR-010]
- [x] CHK004 - Is "the shared subcommand delegation glue is not checkpoint logic" stated, so re-expressing optin/disable/status is not mistaken for duplication? [Ambiguity, Research §D6]

## Constitution Alignment — Identical Command Surface (Principle II)

- [x] CHK005 - Are all four command names fixed exactly with no variant spelling? [Clarity, Spec §FR-001]
- [x] CHK006 - Is each command's expected output/behavior specified concretely enough to compare against the other adapters? [Completeness, Contracts/commands.md]
- [x] CHK007 - Is "no extra/fifth command" required (archive stays a bridge subcommand, not a prompt)? [Coverage, Contracts/commands.md]
- [x] CHK008 - Where Codex's surface makes a capability impossible, is the gap invoked under Principle II's "genuinely impossible" clause rather than silently dropped? [Consistency, Spec §SC-007]

## Constitution Alignment — Raw Capture, Not Curation (Principle III)

- [x] CHK009 - Do the requirements state the adapter passes raw translated entries and performs no summarize/rank/truncate/recent-N selection? [Completeness, Spec §FR-009, Data-model §V4]
- [x] CHK010 - Is the translation from both sources (notify payload, rollout) specified to preserve order and roles without curation? [Clarity, Data-model §A4/§B5]

## Constitution Alignment — Functional Parity (Principle IV)

- [x] CHK011 - Is parity scoped to the capabilities Codex actually supports, with forced gaps documented rather than diverged? [Clarity, Spec §FR-011]
- [x] CHK012 - Are the shared behaviors under parity (capture, config, skip-empty, dedup, command outputs) each enumerated and mapped to a verification? [Completeness, Spec §SC-003, Quickstart]
- [x] CHK013 - Is the `turn-complete` reason justified as an intentional, documented difference from `shutdown` (not a silent divergence)? [Consistency, Spec §Clarifications, Contracts/commands.md]

## Constitution Alignment — Thin Documented Wrapper (Principle V)

- [x] CHK014 - Does the spec require following the add-an-agent procedure end to end (surface → adapter → install → mapping table → smoke test)? [Completeness, Spec §SC-005]
- [x] CHK015 - Is updating the per-agent mapping table (with every gap) a required deliverable? [Coverage, Contracts/agent-mapping.md]
- [x] CHK016 - Is the README requirement (commands, notify wiring, best-effort gaps, build) specified? [Completeness, Spec §FR-014]

## Best-Effort Integrity (honest gap documentation — SC-007)

- [x] CHK017 - Is "no start-of-session pending notice" documented as a gap, with `/checkpoint-status` named as the on-demand stand-in (not an emulated notice)? [Coverage, Spec §SC-007, Agent-mapping]
- [x] CHK018 - Is "no true session-end event" documented, with `turn-complete` named as the explicit best-effort proxy? [Clarity, Spec §Assumptions, Agent-mapping]
- [x] CHK019 - Is "no reload/pre-compact event" documented as a gap? [Coverage, Agent-mapping]
- [x] CHK020 - Is the per-turn capture trade-off (multiple pending may accrue; dedup-bounded; larger dedupWindowSeconds recommended) stated so accumulation is intentional, not a defect? [Clarity, Spec §Edge Cases, Research §D2]
- [x] CHK021 - Is the prompt-only command dependence (agent must follow the instruction and have shell access) documented as inherent best-effort? [Assumption, Spec §Edge Cases, §Clarifications]
- [x] CHK022 - Is the custom-prompts deprecation (skills as successor) recorded as a stability caveat with a future migration path? [Assumption, Spec §Assumptions, Agent-mapping]
- [x] CHK023 - Is it explicit that NONE of these gaps is emulated with divergent behavior? [Consistency, Spec §SC-007]

## Bridge-Pattern Boundary & Integration

- [x] CHK024 - Is the bridge model (compiled CLI invoked by notify + command prompts) stated as the intended shape, distinguishing it from pi's in-process model? [Clarity, Plan §Structure, Research §D1]
- [x] CHK025 - Is the dependency boundary explicit: a single runtime dependency on `@checkpoint/core`, with no import of another adapter's bridge? [Clarity, Research §D6]
- [x] CHK026 - Is the `notify` subcommand's always-exit-0 / never-throw contract specified so Codex's notification step can't be disrupted? [Completeness, Contracts/commands.md]
- [x] CHK027 - Is "no core change expected; gaps go to the core, never the adapter" stated as a governing constraint? [Assumption, Spec §Assumptions, Research §D7]
- [x] CHK028 - Is the no-PATH-binary constraint carried into this adapter's requirements? [Coverage, Constitution §Technical Constraints]

## Externally-Verified Codex Facts (grounding)

- [x] CHK029 - Is the `agent-turn-complete` payload schema (cwd, input-messages, last-assistant-message) documented as the source the translation relies on? [Completeness, Data-model §Source A]
- [x] CHK030 - Is the rollout JSONL format flagged as version-variable, with the parser required to degrade gracefully (best-effort, never throw, missing→git-facts-only)? [Edge Case, Data-model §Source B, §B6]
- [x] CHK031 - Are the custom-prompts location/naming facts (`~/.codex/prompts/`, `name.md`→`/name`) and the notify wiring documented well enough to write the deliverables? [Completeness, Research §Codex surface]

## Edge Cases & Acceptance Quality

- [x] CHK032 - Are not-opted-in safe-no-op requirements defined for both auto and manual paths? [Coverage, Spec §FR-012, §Edge Cases]
- [x] CHK033 - Are malformed/partial automation payload requirements defined (no crash, no capture)? [Exception Flow, Spec §FR-012, Data-model §V5]
- [x] CHK034 - Are the success criteria (SC-001..SC-007) measurable and tied to a verification path? [Measurability, Spec §Success Criteria]
- [x] CHK035 - Is the scope boundary (out: install/006, config migration/007; bridge path a placeholder) stated so readiness isn't blocked on out-of-scope work? [Clarity, Spec §Assumptions, §FR-013]

## Notes

- This checklist validates the written spec/plan, not the implementation. Items close when the
  requirement is present, clear, and consistent in the spec/plan/contracts.
- The best-effort-integrity section is the Codex-specific lens: the risk here is not missing
  features but *dishonestly hiding* Codex's surface limits — these items guard against that.
