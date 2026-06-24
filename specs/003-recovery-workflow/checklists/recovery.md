# Checklist: Recovery / Archive Correctness & Safety (Requirements Quality)

**Purpose**: Validate that the requirements for the recovery/archive feature are complete, clear,
consistent, and measurable — before implementation. These are "unit tests for the spec", not tests
of the code.
**Created**: 2026-06-24
**Feature**: [spec.md](../spec.md)

## Data Safety: never lose / never overwrite

- [x] CHK001 Is the guarantee that a checkpoint is never silently lost stated as a requirement with a defined post-condition? [Completeness, Spec §FR-006]
- [x] CHK002 Is "never overwrite a same-named archived file" specified unambiguously, including what happens to the pending copy in that case? [Clarity, Spec §FR-003, Research §D3]
- [x] CHK003 Is the invariant "every input file ends in exactly one of moved/skipped/errors" stated and measurable? [Measurability, Data-model Invariants]
- [x] CHK004 Is the post-condition "a file is never absent from both pending and archive" defined? [Coverage, Data-model Invariant 2]
- [x] CHK005 Is the differing-content collision case (same name, different bytes) explicitly addressed rather than assumed impossible? [Edge Case, Research §D3]

## Idempotency & collision behavior

- [x] CHK006 Is idempotent re-run behavior specified with an observable outcome (no change, no loss)? [Clarity, Spec §SC-004, Contract C9]
- [x] CHK007 Is the `already-archived` skip reason defined and distinguished from `not-found`? [Clarity, Data-model ArchiveSkip]
- [x] CHK008 Are the conditions that trigger each skip reason mutually exclusive and exhaustive? [Consistency, Data-model]

## Batch resilience

- [x] CHK009 Is "one bad/missing name must not abort the batch" stated as a requirement? [Completeness, Spec §FR-004, Contract C2]
- [x] CHK010 Is the reporting of per-file outcomes (moved/skipped/errors) required, not just an aggregate count? [Completeness, Research §D4]
- [x] CHK011 Is the distinction between a benign skip and a real IO error specified? [Clarity, Data-model ArchiveError vs ArchiveSkip]

## Curation-vs-mechanical boundary (Principle III)

- [x] CHK012 Is it explicitly required that the mechanical op never reads, summarizes, ranks, or promotes checkpoint content? [Completeness, Spec §FR-008, Constitution III]
- [x] CHK013 Is the "never reads file content" property expressed as something objectively verifiable? [Measurability, Contract C10, Data-model Invariant 4]
- [x] CHK014 Is the responsibility for choosing which files are "done" assigned to the agent, not the code? [Clarity, Spec Assumptions, §FR-013]
- [x] CHK015 Is "never bulk-copy raw transcripts into durable memory" stated as a workflow requirement? [Completeness, Spec §FR-010]
- [x] CHK016 Is archiving-even-when-no-memory-update-warranted specified so pending reflects only outstanding work? [Coverage, Spec §FR-011]

## Prune integration

- [x] CHK017 Is reuse of the existing prune (no duplicated prune logic) required rather than a new implementation? [Consistency, Spec §FR-005, Constitution I]
- [x] CHK018 Is the post-archive bound `archiveCount ≤ maxArchivedCheckpoints` stated and measurable? [Measurability, Spec §SC-002, Data-model Invariant 5]
- [x] CHK019 Is prune required to be best-effort (never fails the archive op)? [Edge Case, Research §D5]

## Surface discipline (no fifth command, zero duplicated logic)

- [x] CHK020 Is "no fifth slash command" stated as a requirement with rationale (Principles II/IV)? [Clarity, Spec Assumptions, Contract agent-mapping]
- [x] CHK021 Is "zero duplicated move/prune logic in the adapter" stated and objectively checkable? [Measurability, Spec §FR-014, §SC-006]
- [x] CHK022 Is the `archive` invocation path (internal subcommand vs command) defined unambiguously? [Clarity, Contract core-archive.md]
- [x] CHK023 Are the per-agent mapping and add-an-agent docs required to reflect the new capability and its intentional gap? [Completeness, Spec §FR-015]

## Scope, input model & edge coverage

- [x] CHK024 Is the input model (explicit list vs omitted=all-pending) specified without ambiguity? [Clarity, Spec §FR-001, Clarifications]
- [x] CHK025 Is "all mode acts only on `*.md`, never `.gitkeep`/unrelated files" stated? [Coverage, Spec §FR-001, Contract C5/C6]
- [x] CHK026 Are the not-configured / missing-pending-dir / empty-pending cases all defined as benign no-ops? [Edge Case, Spec Edge Cases, §FR-007]
- [x] CHK027 Is concurrent-session safety (capture writing while archive runs) addressed in requirements? [Coverage, Spec Edge Cases]
- [x] CHK028 Is parity with the pi reference's recovery behavior asserted, with any deviation required to be documented? [Consistency, Spec §FR-016, Constitution IV]

## Notes

- All items interrogate the written requirements, not the eventual code. Resolve any unchecked item
  by tightening the spec/contracts before/while implementing.
