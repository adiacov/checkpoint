# Core Requirements Quality Checklist: Shared Checkpoint Core

**Purpose**: Unit-test the *requirements* (not the implementation) for the shared core's
parity, config/defaults, capture semantics, and edge/failure coverage — before tasks.
**Created**: 2026-06-22
**Resolved**: 2026-06-22 (all items closed; see per-item resolution notes)
**Feature**: [spec.md](../spec.md)

> Each item asks whether a requirement is well-written (complete, clear, consistent,
> measurable, covered) — NOT whether code behaves correctly. References use `[Spec §X]`
> and markers `[Gap]`, `[Ambiguity]`, `[Conflict]`, `[Assumption]`.

## Requirement Completeness

- [x] CHK001 Are the required checkpoint markdown sections and their ordering specified beyond the listed field names? [Completeness, Spec §FR-003] — data-model.md §Checkpoint gives full ordered section list.
- [x] CHK002 Is the content and purpose of the "integration note" defined, or left undefined? [Gap, Spec §FR-003] — RESOLVED: integration-note text + purpose now documented in data-model.md §Checkpoint (ported verbatim).
- [x] CHK003 Are checkpoint filename requirements (timestamp format, uniqueness/collision suffix) specified? [Gap, Spec §FR-003, Edge Cases] — research §D5 + data-model.md filename rule (numeric suffix on collision).
- [x] CHK004 Is the complete set of configuration fields enumerated with an explicit default for each? [Completeness, Spec §FR-009, Key Entities] — data-model.md CheckpointConfig table (12 fields, defaults + clamps).
- [x] CHK005 Are requirements defined for how git facts are rendered into the markdown (labeling, fencing, ordering)? [Gap, Spec §FR-002] — RESOLVED: data-model.md §GitFacts now specifies `Label: value` lines (Branch/Status/Diff/Commits).
- [x] CHK006 Is the precedence specified when both `.checkpoint.json` and the legacy `.pi/checkpoint.json` exist? [Gap, Spec §FR-008] — research §D3: canonical read first, legacy only if canonical absent.
- [x] CHK007 Is the end-state of the legacy-config transition (when reading legacy stops) documented? [Gap, Spec §FR-008] — RESOLVED: spec Assumptions now records legacy-read removal as a future cleanup, intentionally out of scope.

## Requirement Clarity & Ambiguity

- [x] CHK008 Is the dedup window quantified with a specific, testable duration rather than "roughly 20 seconds"? [Ambiguity, Spec §FR-006, Assumptions] — RESOLVED: spec now "20 seconds"; `dedupWindowSeconds` default 20.
- [x] CHK009 Is "real user message" defined with objective criteria so skip-empty can be evaluated unambiguously? [Ambiguity, Spec §FR-005] — data-model.md: role `user` with non-empty text.
- [x] CHK010 Is per-entry truncation defined precisely (unit = characters, and the cut behavior such as ellipsis vs. hard cut)? [Clarity, Spec §FR-004] — data-model/research: `slice(0,max)` + `[truncated N chars]`.
- [x] CHK011 Is "summarize tool calls rather than including them verbatim" defined with concrete output expectations? [Clarity, Spec §FR-004] — `[tool call: name] {json-args}` (reference L383, data-model).
- [x] CHK012 Is "omit thinking blocks" defined so a caller knows exactly what content is excluded? [Clarity, Spec §FR-004] — renders as `[thinking omitted]`.
- [x] CHK013 Is the "unavailable" marker for non-git-repo projects specified with a concrete form? [Clarity, Spec §FR-002, Edge Cases] — data-model GitFacts fallbacks: unknown / clean / none.
- [x] CHK014 Is "recent N entries" given both a documented default and an upper bound? [Clarity, Spec §FR-004] — default 24 (positive integer); the count itself bounds entries included.

## Requirement Consistency

- [x] CHK015 Do the default values in Assumptions (N=24, 4000 chars, max 50, 20s) agree with the wording of FR-004, FR-009, and FR-013? [Consistency, Assumptions] — consistent after analyze fixes.
- [x] CHK016 Are the pending/archive directory paths consistent between Assumptions (`sessions/...`), Key Entities, and FR-018? [Consistency] — all reference `sessions/pending` / `sessions/archive`.
- [x] CHK017 Does "core never moves pending→archive" stay consistent across FR-013, Key Entities, and the Session 2026-06-20 clarification? [Consistency, Spec §FR-013] — stated identically in all three.
- [x] CHK018 Is the status report field list consistent between FR-018, the clarification answer, and the config Key Entities? [Consistency, Spec §FR-018] — RESOLVED: FR-018 now includes `configured`, matching contract StatusResult.

## Acceptance Criteria & Measurability

- [x] CHK019 Can "no observable behavior of the original logic regresses" be objectively measured — is a parity oracle/method defined? [Measurability, Spec §FR-015, SC-006] — RESOLVED: vendored `reference/checkpoint.ts` is the baseline; quickstart Scenarios 1–8 + tasks T029/T031 verify parity.
- [x] CHK020 Is each functional requirement (FR-001..FR-018) traceable to at least one acceptance scenario or success criterion? [Traceability] — analyze coverage table maps every FR to tasks/scenarios.
- [x] CHK021 Is the "fixed header" in the SC-003 size bound defined or bounded, so the bound is actually computable? [Ambiguity, Spec §SC-003] — RESOLVED: SC-003 now defines it as a constant-size header template.
- [x] CHK022 Is "100% of the time (within the limits of lifecycle hooks firing)" measurable, or does the caveat make SC-001 untestable? [Measurability, Spec §SC-001] — measurable per fired session-end event; hard-kill excluded by documented assumption.
- [x] CHK023 Are the four exposed capabilities (capture, opt-in/disable, status, startup) each tied to a measurable success criterion? [Coverage, Spec §FR-014] — capture→SC-001, opt-in→SC-002, startup/prune→SC-005, interface→SC-007; status verified via quickstart Scenario 7.

## Scenario Coverage

- [x] CHK024 Are reload/restart detection requirements specified — how the caller signals a reload event? [Coverage, Spec §FR-007, Assumptions] — caller passes `reason` (`capture(cwd, reason, deps)`); Assumptions state caller supplies the lifecycle event.
- [x] CHK025 Are requirements for the disable→re-enable round trip (capture restored with no extra setup) defined? [Coverage, Spec §FR-017] — FR-017 + data-model state transitions (only enabled/updatedAt change).
- [x] CHK026 Are startup requirements defined for when pending/archive directories do not yet exist? [Coverage, Edge Cases] — Edge Cases: core creates directories as needed.
- [x] CHK027 Are requirements defined for the opt-in routine's ignore rules keeping `.gitkeep` and config tracked while excluding raw markdown? [Coverage, Spec §FR-010, SC-004] — FR-010 + SC-004.
- [x] CHK028 Is archive prune "oldest first" given a defined ordering key (e.g., mtime vs. filename) for deterministic selection? [Clarity, Spec §FR-013] — data-model Prune rule: lexicographic on ISO-timestamp filenames == chronological.

## Edge Case Coverage

- [x] CHK029 Are requirements defined to prevent filename collision / silent overwrite on near-simultaneous captures? [Edge Case, Spec §Edge Cases] — research §D5 numeric suffix on collision.
- [x] CHK030 Is behavior specified when skip-empty is disabled and the conversation is empty (empty-body checkpoint written)? [Edge Case, Spec §Edge Cases] — Edge Cases: with skip-empty disabled, an empty-body checkpoint is still written.
- [x] CHK031 Are requirements defined for surfacing an unwritable-directory failure with diagnostic context? [Edge Case, Spec §FR-016] — FR-016 + contract `CaptureResult.error`.
- [x] CHK032 Is the dedup detection explicitly required to be stateless and cross-process (newest-pending mtime)? [Edge Case, Spec §FR-006] — FR-006 + research §D2.

## Non-Functional Requirements

- [x] CHK033 Are capture timing/performance expectations stated in the normative spec, or only in plan.md? [Gap, NFR] — RESOLVED (decision): not a spec requirement; plan marks <250ms as aspirational, non-gated.
- [x] CHK034 Are cross-platform path-handling requirements (POSIX/Windows) captured in the spec rather than only the plan? [Gap, NFR] — RESOLVED (decision): Linux-only; Windows out of scope per spec Assumptions + plan Target Platform.
- [x] CHK035 Are atomicity/concurrency requirements defined for archive prune running alongside a concurrent capture? [Gap, Coverage] — RESOLVED: data-model §Stores notes prune (archive) and capture (pending) touch disjoint dirs; no locking needed for single-user scope.

## Dependencies & Assumptions

- [x] CHK036 Is the boundary "callers supply already-extracted conversation entries" documented as a hard, validated input contract? [Assumption, Assumptions] — Assumptions + contract `CoreDeps.entries`.
- [x] CHK037 Is the assumption that the caller supplies the triggering lifecycle event recorded as a required input to capture? [Assumption, Spec §FR-007] — Assumptions + `capture(cwd, reason, deps)` signature.

## Notes

- All 37 items resolved 2026-06-22. Items split into: already-satisfied by design docs
  (most), and design edits applied this round (CHK002, CHK005, CHK007, CHK018, CHK019,
  CHK033, CHK034, CHK035) plus the earlier analyze fixes (CHK008, CHK021).
- Complements `requirements.md` (the high-level spec-quality gate) with feature-specific depth.
