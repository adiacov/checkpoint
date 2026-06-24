# Safety & Architecture Requirements Checklist: Config Single-Source Migration

**Purpose**: Validate the spec's requirements around (1) data-safety & reversibility of a sweep that
edits many other repos and (2) constitution/architecture compliance — before implementation. These
test the requirements' quality, not the code.
**Created**: 2026-06-24
**Feature**: [spec.md](../spec.md)

## Safety — No Data Loss & Ordering

- [x] CHK001 Is the no-data-loss guarantee specified (legacy removed only after canonical is written; legacy kept if the write fails)? [Completeness, Spec §FR-009, §SC-006]
- [x] CHK002 Is settings preservation specified concretely (enabled/disabled state, tuning, original `createdAt` unchanged)? [Clarity, Spec §FR-003, §SC-002]
- [x] CHK003 Is the both-files precedence unambiguous (canonical wins, byte-unchanged; only legacy removed)? [Clarity, Spec §FR-004]
- [x] CHK004 Is the `004`/`006` ordering precondition expressed as an enforced guard, not just a documented assumption? [Completeness, Spec §FR-008, Clarifications]
- [x] CHK005 Are malformed/permission-denied projects defined as reported-and-skipped (best-effort, no abort)? [Edge Case, Spec §FR-011]
- [x] CHK006 Is "only `.pi/checkpoint.json` is removed, the rest of `.pi/` left intact" specified? [Coverage, Spec Edge Cases]

## Safety — Default Caution & Reversibility

- [x] CHK007 Is dry-run specified as the default with `--apply` required to mutate, and dry-run output equal to apply's plan? [Clarity, Spec §FR-005, §FR-012, §SC-003]
- [x] CHK008 Is "never auto-commit any repo" stated as a hard requirement? [Completeness, Spec §FR-006, §SC-005]
- [x] CHK009 Is dirty-git handling specified (skip + report unless `--force`) so the migration stays an isolated reviewable change? [Clarity, Spec §FR-007]
- [x] CHK010 Is idempotency defined with an observable signal (re-run ⇒ all already-canonical/not-configured, zero changes)? [Measurability, Spec §FR-010, §SC-004]
- [x] CHK011 Is the per-project reporting specified well enough to verify dry-run/idempotency (path, git state, action, summary)? [Clarity, Spec §FR-012]

## Architecture & Constitution Compliance

- [x] CHK012 Does the spec require the merge/remove logic to live once in the core, with the script duplicating no config logic? [Consistency, Spec §FR-013, Constitution I]
- [x] CHK013 Is "no global PATH binary, no in-agent command, no content curation" stated as a hard constraint? [Clarity, Spec §FR-014, Constitution non-goals]
- [x] CHK014 Is parity preserved — does the spec assert each project's effective config is unchanged by the migration (no capture-behavior regression)? [Consistency, Spec §FR-003, §SC-002, Constitution IV]
- [x] CHK015 Is the scan scope bounded and overridable (one level deep; `--root` override) so behavior is predictable and tests are hermetic? [Clarity, Clarifications, Spec Assumptions]

## Acceptance Criteria Quality & Consistency

- [x] CHK016 Are all Success Criteria objectively verifiable by inspecting the filesystem/report (no implementation detail)? [Measurability, Spec §Success Criteria]
- [x] CHK017 Do the functional requirements and the CLI/core contract agree on flags, actions, and exit codes? [Consistency, Spec §Requirements, contracts/migrate-cli.md]
- [x] CHK018 Is test isolation required (overridable scan root + pi-extensions path; real sibling projects and `~/.pi` never touched)? [Completeness, Clarifications, Spec Assumptions]

## Notes

- CHK001/CHK004 are the highest-risk items: irreversible legacy deletion and the ordering guard that
  prevents breaking a project whose installed pi still reads the legacy file.
