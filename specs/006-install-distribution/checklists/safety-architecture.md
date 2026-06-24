# Safety & Architecture Requirements Checklist: Install / Distribution

**Purpose**: Validate that the spec's requirements around (1) safety & reversibility and
(2) constitution/architecture compliance are complete, clear, consistent, and measurable — before
implementation begins. These are "unit tests for the requirements", not for the code.
**Created**: 2026-06-24
**Feature**: [spec.md](../spec.md)

## Safety — Idempotency & Non-Destruction

- [ ] CHK001 Is "idempotent" defined with an observable acceptance signal (re-run → zero filesystem changes + a stated report outcome)? [Clarity, Spec §FR-007, §SC-002]
- [ ] CHK002 Are the exact signals for distinguishing tool-created from user content specified (symlink-into-repo, manifest, sentinel marker) and is each one's authority stated per mode? [Completeness, Spec §FR-009, Clarifications]
- [ ] CHK003 Is the conflict-stop behavior on pre-existing user content defined unambiguously, including the explicit override (`--force`) needed to replace it? [Clarity, Spec §FR-009, §US3]
- [ ] CHK004 Is the legacy pi `checkpoint.ts` explicitly classified (user content requiring `--force`) so its handling is not left to implementer discretion? [Completeness, Spec Edge Cases]
- [ ] CHK005 Are the no-data-loss guarantees for `~/.codex/config.toml` specified (only the managed `notify` line touched; remainder preserved byte-intact)? [Completeness, Spec §FR-008, §SC-003]
- [ ] CHK006 Does the spec require the managed Codex `notify` to be placed correctly within the TOML structure (root table, before the first table header) rather than appended? [Coverage, Edge Case, research.md Decision 5]
- [ ] CHK007 Are partial-failure semantics in a multi-adapter run specified (best-effort continue, per-adapter atomicity, no half-installed adapter)? [Completeness, Spec §FR-012]

## Safety — Reversibility (Uninstall) & Preview

- [ ] CHK008 Is "exact uninstall" measurable (target restored to pre-install state; only tool-created items removed; unrelated content preserved)? [Measurability, Spec §FR-008, §SC-003]
- [ ] CHK009 Is uninstall idempotency specified for the not-installed case ("nothing to remove", no changes)? [Coverage, Spec §US2]
- [ ] CHK010 Is dry-run defined for BOTH install and uninstall, with a guarantee of zero filesystem mutation while accurately listing planned actions? [Completeness, Spec §FR-010, §SC-006]
- [ ] CHK011 Are reporting requirements specified well enough to verify idempotency/dry-run (per-adapter target, mode, action outcome, summary)? [Clarity, Spec §FR-011]
- [ ] CHK012 Is the behavior for converging between symlink and copy installs (cleaning up the other form) defined so re-installs in a different mode are not ambiguous? [Coverage, Spec Edge Cases, §US4]
- [ ] CHK013 Are missing-agent-home and stale/absent-`dist` preconditions specified with defined outcomes (create dirs / build-or-fail), not left implicit? [Edge Case, Spec §FR-005, Edge Cases]

## Architecture & Constitution Compliance

- [ ] CHK014 Does the spec require zero duplicated checkpoint logic in the installer (places/links files + Codex notify only; never reads checkpoint content)? [Consistency, Spec §FR-013, §FR-014, Constitution I]
- [ ] CHK015 Is the "no global PATH binary" constraint stated as a hard requirement, not an assumption? [Clarity, Spec §FR-013, Constitution non-goals]
- [ ] CHK016 Is symlink-preferred / copy-fallback specified as the default-and-fallback relationship (not two equal options)? [Consistency, Spec §FR-002, §FR-003, Constitution]
- [ ] CHK017 Is "repo as single source of truth" expressed as a verifiable outcome (symlink install reflects a later rebuild with no re-install)? [Measurability, Spec §FR-002, §SC-007]
- [ ] CHK018 Is the add-an-agent thinness requirement specified concretely (a new agent = one install descriptor; docs/mapping updated)? [Completeness, Spec §FR-015, Constitution V]
- [ ] CHK019 Are the per-agent target locations documented unambiguously, with the one genuinely-unresolved mechanism (Claude enablement key, pi loader shape) explicitly flagged rather than silently assumed? [Clarity, Clarifications, research.md Decisions 3–4]
- [ ] CHK020 Is the relationship to the deferred in-agent smoke tests (002 T031, 004 T023, 005 T024) specified as an outcome this feature unblocks and documents? [Traceability, Spec §FR-016, §SC-001]

## Acceptance Criteria Quality & Consistency

- [ ] CHK021 Are all Success Criteria (SC-001…SC-007) technology-agnostic and objectively verifiable by inspecting filesystem/report state? [Measurability, Spec §Success Criteria]
- [ ] CHK022 Do the functional requirements and the CLI contract agree on flags/verbs/exit codes (no requirement implies a capability the contract omits, or vice versa)? [Consistency, Spec §Requirements, contracts/installer-cli.md]
- [ ] CHK023 Are test-isolation requirements stated (overridable target roots; automated tests never touch real `~/.pi`, `~/.codex`, `~/.claude`)? [Completeness, Clarifications, Spec Assumptions]
- [ ] CHK024 Is the scope boundary explicit about non-features (no registry/marketplace publishing beyond local, no memory curation, no PATH binary)? [Clarity, Spec §Assumptions, §FR-013]

## Notes

- Check items off as the spec is confirmed/amended: `[x]`. Each item tests whether the requirement is
  written well, not whether the eventual code works.
- Items CHK006 and CHK019 intentionally point at the two highest-residual-risk areas (TOML root-table
  placement and the agent-loader specifics deferred to the smoke tests).
