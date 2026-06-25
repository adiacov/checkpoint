# PROJECT.md — checkpoint

> Stable identity for the project. This file captures what the project *is*, not its progress.
> Detailed transformation plan and current decisions live in `BRIEF.md`; live implementation state will live in the dedicated repo's `STATE.md`.

## What it is

`checkpoint` is a **family of coding-agent extensions over one shared core logic**. Each supported agent (pi, Claude Code, Codex, …) gets a small extension that exposes the **same commands** — `/checkpoint`, `/checkpoint-optin` (enable), `/checkpoint-disable`, `/checkpoint-status` — invoked from *inside* that agent's TUI, and the **same automatic lifecycle capture** on session start/end. All of them run the **same checkpoint logic**, written once.

It captures raw end-of-session evidence (git facts + recent conversation) into a project's `sessions/pending/` as markdown, so any later session — with any agent — can reconcile that evidence into durable memory and resume cleanly.

It is **not** a standalone CLI you run from a shell. You never type `checkpoint` in a terminal; you type `/checkpoint…` inside an agent. It originated as a pi extension (`checkpoint.ts`); the project generalizes that one extension into a shared core plus per-agent extensions.

## Why it exists

Session memory loss is agent-agnostic — it happens in pi, Claude Code, Codex, and any future tool. The checkpoint logic should be written once and surfaced identically inside every agent, instead of being trapped in one agent's extension system. Adding a new coding agent then becomes a small, well-defined task (write one more extension wrapper), not a rewrite.

## Target user

The user, across all the coding agents they use. Single-user, personal infrastructure.

## Architecture (shared core + per-agent extensions)

- **Shared core** — the checkpoint logic: git facts, markdown checkpoint format, opt-in config handling, archive pruning, skip-empty/dedup, startup pending-count. No agent SDK imported. Lives once in the dedicated `checkpoint` repo and is the single source of truth.
- **Per-agent extensions** — thin wrappers that register the commands + lifecycle handlers in each agent's own surface and call the shared core:
  - **pi** — native extension (`registerCommand` + `session_start`/`session_shutdown`). This already exists and is the reference.
  - **Claude Code** — a **plugin** (Claude's analog to a pi extension): bundles the slash commands *and* the lifecycle hooks (`SessionEnd`/`SessionStart`/`PreCompact`).
  - **Codex** — its prompts (slash commands) + config `notify` (best-effort automatic).
- **Install** — places or symlinks each agent's extension into that agent's extension directory (`~/.pi/agent/extensions/`, Claude's plugin dir, `~/.codex/`), pointing back at the shared core. Symlink-from-repo is preferred to keep one true copy.

## Per-project opt-in config

- A project opts in with **`.checkpoint.json`** at its root (agent-neutral; replaces pi's `.pi/checkpoint.json`). Adapters may read the legacy `.pi/checkpoint.json` during transition.
- The config is **tracked in git** (opt-in + tuning travel with the repo), matching the current pi setup.
- The **raw checkpoint captures are git-ignored**: all of `sessions/pending/*` and `sessions/archive/*` (not just `*.md`), with `.gitkeep`s kept via `!`-negations so the empty dirs stay tracked. Captures are transient session evidence (may contain secrets/paths) — never publish them. `/checkpoint-optin` sets up the directories and these ignore rules, creating `.gitignore` if it doesn't exist.

## Boundaries / non-goals

- **Not a shell CLI.** No global `checkpoint` binary on `PATH`; the surface is each agent's in-TUI commands.
- **Not part of `agent-workspace`.** Checkpoint behavior is its own tool; the boundary was decided earlier and is preserved.
- **Not a memory curator.** The extensions capture *raw* evidence only; turning checkpoints into durable memory remains each project's instructions/agent job.
- **Not responsible for hard-kill capture** — lifecycle hooks cannot fire on `kill -9`/crash; inherent gap, mitigated by agents writing state as they go.

## Core principles

- **Write the logic once** — the core is agent-neutral; extensions only adapt commands, lifecycle triggers, and how the conversation transcript is read.
- **Same commands everywhere** — every agent exposes the identical command set running identical logic.
- **Adding a new agent is a documented, small task** — write one extension wrapper for that agent's command + lifecycle surface (see `BRIEF.md`). When the user says "I added agent X," the in-repo agent follows that procedure.
- **Raw capture, not curation** — checkpoints are recovery evidence, never authoritative memory.
- **Functional parity with the original pi extension** — no real feature regresses in the generalization.
