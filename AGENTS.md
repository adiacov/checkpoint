# AGENTS.md

Canonical instruction entrypoint for every AI agent working in this repository.
This repository uses file-based instructions and memory.

Before performing meaningful work:

1. Read `WORKFLOWS.md` and follow it as the primary workflow authority.
2. Classify the request and load only the context required by `WORKFLOWS.md`.
3. For coding or implementation work, read and follow `ENGINEERING.md` if present.

When work is completed:

* update project context/memory as directed by `WORKFLOWS.md`;
* avoid duplicating information across context/memory files;
* summarize what changed, how it was verified, and any remaining risks.

Project-specific instructions may be added below; keep them here so every agent
sees the same guidance.
