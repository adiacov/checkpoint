# Core Requirements Quality Checklist: Shared Checkpoint Core

**Purpose**: Unit-test the *requirements* (not the implementation) for the shared core's
parity, config/defaults, capture semantics, and edge/failure coverage — before tasks.
**Created**: 2026-06-22
**Feature**: [spec.md](../spec.md)

> Each item asks whether a requirement is well-written (complete, clear, consistent,
> measurable, covered) — NOT whether code behaves correctly. References use `[Spec §X]`
> and markers `[Gap]`, `[Ambiguity]`, `[Conflict]`, `[Assumption]`.

## Requirement Completeness

- [ ] CHK001 Are the required checkpoint markdown sections and their ordering specified beyond the listed field names? [Completeness, Spec §FR-003]
- [ ] CHK002 Is the content and purpose of the "integration note" defined, or left undefined? [Gap, Spec §FR-003]
- [ ] CHK003 Are checkpoint filename requirements (timestamp format, uniqueness/collision suffix) specified? [Gap, Spec §FR-003, Edge Cases]
- [ ] CHK004 Is the complete set of configuration fields enumerated with an explicit default for each? [Completeness, Spec §FR-009, Key Entities]
- [ ] CHK005 Are requirements defined for how git facts are rendered into the markdown (labeling, fencing, ordering)? [Gap, Spec §FR-002]
- [ ] CHK006 Is the precedence specified when both `.checkpoint.json` and the legacy `.pi/checkpoint.json` exist? [Gap, Spec §FR-008]
- [ ] CHK007 Is the end-state of the legacy-config transition (when reading legacy stops) documented? [Gap, Spec §FR-008]

## Requirement Clarity & Ambiguity

- [ ] CHK008 Is the dedup window quantified with a specific, testable duration rather than "roughly 20 seconds"? [Ambiguity, Spec §FR-006, Assumptions]
- [ ] CHK009 Is "real user message" defined with objective criteria so skip-empty can be evaluated unambiguously? [Ambiguity, Spec §FR-005]
- [ ] CHK010 Is per-entry truncation defined precisely (unit = characters, and the cut behavior such as ellipsis vs. hard cut)? [Clarity, Spec §FR-004]
- [ ] CHK011 Is "summarize tool calls rather than including them verbatim" defined with concrete output expectations? [Clarity, Spec §FR-004]
- [ ] CHK012 Is "omit thinking blocks" defined so a caller knows exactly what content is excluded? [Clarity, Spec §FR-004]
- [ ] CHK013 Is the "unavailable" marker for non-git-repo projects specified with a concrete form? [Clarity, Spec §FR-002, Edge Cases]
- [ ] CHK014 Is "recent N entries" given both a documented default and an upper bound? [Clarity, Spec §FR-004]

## Requirement Consistency

- [ ] CHK015 Do the default values in Assumptions (N=24, 4000 chars, max 50, ~20s) agree with the wording of FR-004, FR-009, and FR-013? [Consistency, Assumptions]
- [ ] CHK016 Are the pending/archive directory paths consistent between Assumptions (`sessions/...`), Key Entities, and FR-018? [Consistency]
- [ ] CHK017 Does "core never moves pending→archive" stay consistent across FR-013, Key Entities, and the Session 2026-06-20 clarification? [Consistency, Spec §FR-013]
- [ ] CHK018 Is the status report field list consistent between FR-018, the clarification answer, and the config Key Entities? [Consistency, Spec §FR-018]

## Acceptance Criteria & Measurability

- [ ] CHK019 Can "no observable behavior of the original logic regresses" be objectively measured — is a parity oracle/method defined? [Measurability, Spec §FR-015, SC-006]
- [ ] CHK020 Is each functional requirement (FR-001..FR-018) traceable to at least one acceptance scenario or success criterion? [Traceability]
- [ ] CHK021 Is the "fixed header" in the SC-003 size bound defined or bounded, so the bound is actually computable? [Ambiguity, Spec §SC-003]
- [ ] CHK022 Is "100% of the time (within the limits of lifecycle hooks firing)" measurable, or does the caveat make SC-001 untestable? [Measurability, Spec §SC-001]
- [ ] CHK023 Are the four exposed capabilities (capture, opt-in/disable, status, startup) each tied to a measurable success criterion? [Coverage, Spec §FR-014]

## Scenario Coverage

- [ ] CHK024 Are reload/restart detection requirements specified — how the caller signals a reload event? [Coverage, Spec §FR-007, Assumptions]
- [ ] CHK025 Are requirements for the disable→re-enable round trip (capture restored with no extra setup) defined? [Coverage, Spec §FR-017]
- [ ] CHK026 Are startup requirements defined for when pending/archive directories do not yet exist? [Coverage, Edge Cases]
- [ ] CHK027 Are requirements defined for the opt-in routine's ignore rules keeping `.gitkeep` and config tracked while excluding raw markdown? [Coverage, Spec §FR-010, SC-004]
- [ ] CHK028 Is archive prune "oldest first" given a defined ordering key (e.g., mtime vs. filename) for deterministic selection? [Clarity, Spec §FR-013]

## Edge Case Coverage

- [ ] CHK029 Are requirements defined to prevent filename collision / silent overwrite on near-simultaneous captures? [Edge Case, Spec §Edge Cases]
- [ ] CHK030 Is behavior specified when skip-empty is disabled and the conversation is empty (empty-body checkpoint written)? [Edge Case, Spec §Edge Cases]
- [ ] CHK031 Are requirements defined for surfacing an unwritable-directory failure with diagnostic context? [Edge Case, Spec §FR-016]
- [ ] CHK032 Is the dedup detection explicitly required to be stateless and cross-process (newest-pending mtime)? [Edge Case, Spec §FR-006]

## Non-Functional Requirements

- [ ] CHK033 Are capture timing/performance expectations stated in the normative spec, or only in plan.md? [Gap, NFR]
- [ ] CHK034 Are cross-platform path-handling requirements (POSIX/Windows) captured in the spec rather than only the plan? [Gap, NFR]
- [ ] CHK035 Are atomicity/concurrency requirements defined for archive prune running alongside a concurrent capture? [Gap, Coverage]

## Dependencies & Assumptions

- [ ] CHK036 Is the boundary "callers supply already-extracted conversation entries" documented as a hard, validated input contract? [Assumption, Assumptions]
- [ ] CHK037 Is the assumption that the caller supplies the triggering lifecycle event recorded as a required input to capture? [Assumption, Spec §FR-007]

## Notes

- Check items off as the spec is confirmed or amended: `[x]`.
- An unchecked item is a prompt to either add the missing/ambiguous requirement to spec.md
  or to explicitly record it as out of scope.
- Complements `requirements.md` (the high-level spec-quality gate) with feature-specific depth.
