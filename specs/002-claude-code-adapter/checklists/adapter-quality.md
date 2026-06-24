# Requirements Quality Checklist: Claude Code Adapter

**Purpose**: Validate that the requirements for the highest-risk areas (core/adapter separation,
command parity, lifecycle→reason mapping, transcript translation) are complete, clear, consistent,
and measurable — before implementation. This tests the *spec*, not the code.

**Created**: 2026-06-24
**Feature**: [spec.md](../spec.md)

## Core / Adapter Separation (no logic leak)

- [x] CHK001 Is "the adapter contains no checkpoint logic" stated as an objectively checkable boundary (enumerated forbidden concerns: capture, dedup, skip-empty, prune, config, git facts)? [Clarity, Spec §FR-002]
- [x] CHK002 Is there a measurable acceptance criterion proving zero checkpoint logic in the adapter, not just a prose assertion? [Measurability, Spec §SC-005]
- [x] CHK003 Are the gating decisions (not-configured, disabled, empty, duplicate, reload-suppressed) all assigned to the core rather than the adapter? [Consistency, Spec §FR-007 / Clarifications]
- [x] CHK004 Does the spec specify which inputs the adapter is allowed to supply to the core (entries, sessionFile, git runner) so the boundary is explicit rather than implied? [Completeness, §Assumptions]

## Four-Command Parity

- [x] CHK005 Are exactly four commands enumerated, with no room for extra or renamed commands? [Completeness, Spec §FR-001]
- [x] CHK006 Is "identical to other agents" defined along all three axes — name, semantics, and output — so parity is testable? [Clarity, Spec §FR-001]
- [x] CHK007 Is the manual command's behavior when configured-but-disabled specified distinctly from not-configured? [Completeness, Spec §Edge Cases / Clarifications]
- [x] CHK008 Are success vs. skip vs. error outputs specified for each command rather than only the happy path? [Coverage, contracts/commands.md]
- [x] CHK009 Is the source of truth for "reference behavior" identified so parity can be checked against something concrete? [Traceability, Spec §FR-009]

## Lifecycle → Reason Mapping

- [x] CHK010 Is each Claude Code lifecycle event mapped to exactly one core call and one reason, with no unmapped or doubly-mapped events? [Completeness, Spec §Clarifications]
- [x] CHK011 Is the reload-suppression rule attributed to the core config (`includeReload`) rather than adapter logic? [Consistency, Spec §FR-003]
- [x] CHK012 Is the pending-notice display condition fully specified (enabled AND UI present AND count > 0)? [Clarity, Spec §FR-004]
- [x] CHK013 Are the chosen reason strings (`manual`/`shutdown`/`reload`) reconciled against the reference's reason values? [Conflict, Spec §FR-003]
- [x] CHK014 Is behavior specified for lifecycle events that fire when not opted in (silent no-op, no error surfaced)? [Edge Case, Spec §FR-007]

## Transcript Translation Fidelity

- [x] CHK015 Are the rules for which transcript lines become entries (and which are dropped) explicitly enumerated? [Completeness, data-model.md R1–R2]
- [x] CHK016 Is a mapping defined for every observed content-block type (text, thinking, tool_use, tool_result, image, unknown)? [Coverage, data-model.md R6]
- [x] CHK017 Is the `tool_result`-only → `role:"tool"` rule specified with its rationale (skip-empty correctness), not left implicit? [Clarity, data-model.md R7]
- [x] CHK018 Is order/timestamp preservation stated as an invariant rather than assumed? [Completeness, data-model.md V1–V2]
- [x] CHK019 Is "no message dropped" expressed as a measurable outcome for structured-content transcripts? [Measurability, Spec §SC-004]
- [x] CHK020 Is the empty/missing-transcript behavior (pass empty entries, let core skip; do not fabricate) specified? [Edge Case, Spec §FR-006]
- [x] CHK021 Is sidechain (subagent) handling explicitly decided rather than ambiguous? [Ambiguity, data-model.md R2]

## Cross-Cutting: Assumptions, Gaps, Scope

- [x] CHK022 Is the hard-kill capability gap documented as out-of-reach rather than treated as a requirement? [Assumption, Spec §Assumptions / agent-mapping.md]
- [x] CHK023 Is opt-in agent-neutrality (a project opted in via any agent is recognized by Claude Code) stated as a relied-upon assumption? [Dependency, Spec §Assumptions]
- [x] CHK024 Are out-of-scope items (curation, global CLI, recovery workflow) explicitly excluded so they cannot leak into acceptance? [Boundary, Spec §FR-011]
- [x] CHK025 Is the install mechanism deferred-but-pointed-to, rather than silently missing, so the adapter isn't expected to solve feature 006? [Scope, Spec §FR-012]

## Notes

- Items are requirements-quality probes, not test cases. An unchecked item means the spec/design
  needs tightening before/while implementing, not that code failed.
