# Architecture-Compliance Checklist: pi Adapter

**Purpose**: Validate that the spec/plan for the pi adapter express the constitutional architecture
(logic-once, identical surface, raw capture, parity, thin wrapper), reference parity, and the
thin-adapter boundary clearly, completely, and consistently — before implementation. This is a
requirements-quality gate (PR reviewer / release), not a code test.
**Created**: 2026-06-24
**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

## Constitution Alignment — Logic Once (Principle I)

- [x] CHK001 - Is the exhaustive set of decisions that MUST live in the core (config, git facts, markdown format, skip-empty, dedup, prune, pending-count) enumerated so "no duplicated logic" is objectively checkable? [Completeness, Spec §FR-009]
- [x] CHK002 - Is the closed list of adapter-permitted logic (command registration, lifecycle wiring incl. reason mapping, transcript translation) specified precisely enough to reject anything else? [Clarity, Spec §FR-009]
- [x] CHK003 - Is "the `runGit`/`pi.exec` plumbing is not checkpoint logic" stated and justified so it is not mistaken for a Principle I violation? [Ambiguity, Plan/Research §D2]
- [x] CHK004 - Is the enforcement mechanism for logic-once (an automated neutrality test) required, not merely recommended? [Measurability, Spec §FR-011]

## Constitution Alignment — Identical Command Surface (Principle II)

- [x] CHK005 - Are all four command names fixed exactly (`checkpoint`, `checkpoint-optin`, `checkpoint-disable`, `checkpoint-status`) with no room for variant spelling? [Clarity, Spec §FR-001]
- [x] CHK006 - Is the expected output/behavior of each command specified concretely enough to compare against the other adapters? [Completeness, Contracts/commands.md]
- [x] CHK007 - Is the `checkpoint-enable` → `checkpoint-optin` rename documented as a name-only change (not a behavior divergence) and reconciled with Principle IV parity? [Consistency, Spec §Clarifications]
- [x] CHK008 - Is "no extra/fifth command" explicitly required (e.g., no pi-only archive command), preserving surface parity? [Coverage, Gap]

## Constitution Alignment — Raw Capture, Not Curation (Principle III)

- [x] CHK009 - Do the requirements state the adapter passes raw translated entries and performs no summarize/rank/promote/truncate/recent-N selection? [Completeness, Spec §FR-010, Data-model §V4]
- [x] CHK010 - Is it unambiguous that thinking/image omission and entry selection follow the core's rendering, not adapter-side curation? [Clarity, Data-model §R6]

## Constitution Alignment — Functional Parity (Principle IV)

- [x] CHK011 - Is `reference/checkpoint.ts` named as the authoritative parity baseline, with parity scoped to observable behavior? [Traceability, Spec §Assumptions]
- [x] CHK012 - Are the reference behaviors under parity (capture, config, skip-empty, dedup, prune, pending-count) each enumerated and mapped to a verification? [Completeness, Spec §SC-003, Quickstart]
- [x] CHK013 - Is every intentional deviation from the reference (canonical command rename; gating moved into the core; no `user→tool` remap) explicitly called out and justified rather than silent? [Consistency, Data-model §R7, Agent-mapping]
- [x] CHK014 - Is the reason mapping (`manual`/`shutdown`/`reload`) specified to match the reference, including that `reload` gating is delegated to the core? [Clarity, Contracts/commands.md §Reason mapping]

## Constitution Alignment — Thin Documented Wrapper (Principle V)

- [x] CHK015 - Does the spec require following the documented add-an-agent procedure end to end (identify surface → write adapter → wire install → update mapping table → smoke test)? [Completeness, Spec §SC-005]
- [x] CHK016 - Is updating the per-agent mapping table (including capability gaps) a required deliverable, not optional? [Coverage, Contracts/agent-mapping.md]
- [x] CHK017 - Is the documented README requirement (commands, lifecycle, gaps, install pointer) specified? [Completeness, Spec §FR-015]

## Thin-Adapter Boundary & Integration

- [x] CHK018 - Is the in-process extension model (no bridge CLI, no markdown commands, no `hooks.json`) stated as the intended shape, distinguishing it from the Claude Code adapter? [Clarity, Plan §Structure, Research §D1]
- [x] CHK019 - Is the transcript source (live `sessionManager` entries, not JSONL files) specified for both lifecycle handlers and the manual command? [Completeness, Research §D3, Data-model]
- [x] CHK020 - Is the dependency boundary explicit: runtime dependency on `@checkpoint/core` only, with the pi SDK as a type-only build/dev dependency? [Clarity, Plan §Technical Context]
- [x] CHK021 - Is "no core change expected; gaps go to the core, never the adapter" stated as a constraint that governs implementation choices? [Assumption, Spec §Assumptions, Research §D7]
- [x] CHK022 - Is the no-PATH-binary / not-a-global-CLI constraint carried into this adapter's requirements? [Coverage, Constitution §Technical Constraints]

## Edge Cases & Scenario Coverage (requirement existence)

- [x] CHK023 - Are requirements defined for the legacy `.pi/checkpoint.json`-only project during transition? [Coverage, Spec §Edge Cases, FR-013]
- [x] CHK024 - Are requirements defined for the no-git-repository fallback (root = cwd) behavior? [Edge Case, Spec §Edge Cases]
- [x] CHK025 - Are requirements defined for the no-UI / non-interactive session (notify guarded by `hasUI`)? [Coverage, Spec §Edge Cases, FR-014]
- [x] CHK026 - Are requirements defined for capture/prune/startup failure surfacing without crashing the session? [Exception Flow, Spec §FR-014]
- [x] CHK027 - Is the hard-kill capture gap documented as an inherited limitation, not a regression? [Assumption, Spec §Assumptions, Agent-mapping]
- [x] CHK028 - Are the not-configured / disabled / empty / duplicate / reload-gated skip outcomes each specified (so "no file written" is intentional, not a defect)? [Completeness, Contracts/commands.md]

## Acceptance Criteria Quality

- [x] CHK029 - Are the success criteria (SC-001..SC-006) measurable and tied to a verification path in the quickstart/tasks? [Measurability, Spec §Success Criteria]
- [x] CHK030 - Is "zero duplicated checkpoint logic" expressed as an objectively testable criterion (neutrality test), not a subjective judgment? [Measurability, Spec §SC-004]
- [x] CHK031 - Is the scope boundary (out: install/006, Codex/005, config migration/007) stated so readiness is not blocked on out-of-scope work? [Clarity, Spec §Assumptions]

## Notes

- This checklist validates the written spec/plan, not the implementation. Items are closed when the
  corresponding requirement is present, clear, and consistent in the spec/plan/contracts — not when
  code passes.
- `/speckit-analyze` cross-checks these artifacts mechanically; this checklist is the human-readable
  architecture-compliance lens that complements it.
