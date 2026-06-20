# Workflows

This file is the primary workflow authority. Agent-specific adapter files should only bootstrap the agent into this file, not duplicate its rules.

## Start of session

1. Read the agent adapter/instruction file for the current tool if present.
2. Read `STATE.md` if present. Treat it as the single canonical current-context entrypoint, not as a general instruction file.
3. Always check whether `sessions/pending/` contains checkpoint files. If it does, perform bounded checkpoint recovery before normal work:

   * read checkpoint summaries/headers first, not full raw transcripts unless necessary;
   * extract only durable goals, decisions, current state, next actions, blockers, changed files, and important realizations;
   * update `STATE.md` or durable memory only when the checkpoint contains still-relevant information;
   * move processed checkpoint files to `sessions/archive/`.
4. Classify the user's request before loading extra project context:

   * discussion/brainstorming: keep context minimal and ask before broad file reads;
   * coding/implementation/debugging: inspect the affected files and read `ENGINEERING.md` if present;
   * project identity/scope question: read `PROJECT.md` if present;
   * continuity/resume work: read relevant durable memory and verify current state;
   * explicit file/doc question: read only the requested files and direct dependencies.
5. Follow only relevant pointers from `STATE.md`, plus files clearly required by the user's request. Do not follow stale or completed-work pointers without confirming relevance.
6. Read durable memory, such as `MEMORY.md`, only when continuity, prior decisions, or current work require it.
7. Reconcile broader memory/repository reality only when continuing existing work, recovering a session, or relying on stored state:

   * inspect `git status` and recent commits when repository state matters;
   * inspect project files mentioned by `STATE.md` only when relevant to the current request;
   * inspect relevant local/external task state when current work mentions tasks;
   * compare these facts with project context/memory.
8. Treat memory as a hint, not a source of truth. Repository state, task systems, and current project files take precedence.
9. Do not blindly read unrelated historical task artifacts, decisions, or implementation notes by default.
10. If durable memory is stale or contradicted by repo/task reality, update memory or project docs before continuing normal work.
11. If the task is unclear after minimal context loading and checkpoint recovery, ask what we are working on.

## Collaboration style

* Work as a collaborative partner, not an autonomous task executor.
* Prefer dialogue over assumptions when requirements, tradeoffs, priorities, or constraints are unclear.
* For non-trivial work, discuss the approach before implementation.
* Present one major decision at a time rather than large batches of options.
* Do not rush into implementation when understanding is incomplete.
* Challenge assumptions when evidence suggests a better approach.
* Keep communication concise and focused.
* When multiple reasonable approaches exist, explain the tradeoffs and recommend one.

## Pending checkpoint handling

Checkpoint recovery is automatic at session start, but bounded:

1. inspect pending checkpoint summaries/headers before continuing normal work;
2. read full raw checkpoint content only when the summary is insufficient for recovery;
3. extract only durable goals, decisions, current state, next actions, blockers, changed files, and important realizations;
4. update project context/memory/docs only with still-relevant information;
5. move processed checkpoint files to `sessions/archive/`.

Do not blindly copy raw conversation into durable memory.

Checkpoint files are raw recovery evidence, not curated memory. Manual durable-memory updates remain preferred when practical.

## Implementation workflow

When coding or editing files:

1. understand the request and affected area;
2. inspect existing files before proposing changes;
3. for non-trivial work, present a short plan;
4. explain intended changes briefly when useful;
5. make minimal, precise edits;
6. preserve existing content unless explicitly asked to reorganize it;
7. run relevant checks when possible;
8. summarize changed files, verification performed, and next steps.
