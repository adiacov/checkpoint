/**
 * The thin bridge between Codex and @checkpoint/core. It parses the notify payload / command args,
 * translates the conversation, calls the core, and formats the result for humans. It contains NO
 * checkpoint logic: every decision (configured/disabled/empty/duplicate, dedup, prune, git facts,
 * markdown) is the core's. See specs/005-codex-adapter/contracts/commands.md.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import {
	archive,
	capture,
	disable,
	optIn,
	status,
	type ArchiveResult,
	type CaptureResult,
	type CoreDeps,
} from "@checkpoint/core";
import { entriesFromNotifyPayload, entriesFromRollout, type NotifyPayload } from "./transcript.js";

/** Parse the single JSON argument Codex passes to the notify program; tolerant of garbage. */
export function parseNotifyPayload(arg: string | undefined): NotifyPayload {
	if (!arg) return {};
	try {
		const parsed = JSON.parse(arg) as unknown;
		return parsed && typeof parsed === "object" ? (parsed as NotifyPayload) : {};
	} catch {
		return {};
	}
}

/**
 * Best-effort: the newest Codex session rollout file. Codex stores rollouts at
 * `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` and does NOT key them by cwd, so the newest
 * rollout overall is the best available proxy for "the current session". Returns undefined if none
 * is found (the manual checkpoint then degrades to git-facts-only via the core).
 */
export function newestRolloutFile(): string | undefined {
	const root = join(homedir(), ".codex", "sessions");
	let newest: { path: string; mtimeMs: number } | undefined;
	const walk = (dir: string): void => {
		let names: string[];
		try {
			names = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of names) {
			const path = join(dir, name);
			let stat;
			try {
				stat = statSync(path);
			} catch {
				continue;
			}
			if (stat.isDirectory()) walk(path);
			else if (name.startsWith("rollout-") && name.endsWith(".jsonl")) {
				if (!newest || stat.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: stat.mtimeMs };
			}
		}
	};
	walk(root);
	return newest?.path;
}

/** Read + translate a rollout file; missing/unreadable -> [] (core then degrades/skip-empties). */
export function entriesFromRolloutFile(
	path: string | undefined,
): ReturnType<typeof entriesFromRollout> {
	if (!path) return [];
	try {
		return entriesFromRollout(readFileSync(path, "utf8"));
	} catch {
		return [];
	}
}

/** Human-readable rendering of a core CaptureResult, relative to the project root. */
export function formatCapture(result: CaptureResult, cwd: string): string {
	if (result.written && result.filePath) {
		return `Checkpoint written: ${relative(cwd, result.filePath)}`;
	}
	if (result.error) return `Checkpoint failed: ${result.error}`;
	switch (result.skippedReason) {
		case "not-configured":
		case "disabled":
			return "Checkpointing is disabled here. Run /checkpoint-optin first.";
		case "empty-session":
			return "Skipped: empty session (no checkpoint written).";
		case "reload":
			return "Skipped: reload checkpoints are disabled for this project.";
		case "duplicate":
			return "Skipped: duplicate of a recent checkpoint.";
		default:
			return "No checkpoint written.";
	}
}

// --- Action runners (called by the CLI dispatcher) -------------------------------------------

/**
 * Auto-capture from Codex's `notify` program: parse the `agent-turn-complete` payload, translate
 * its messages, capture with reason "turn-complete". Resolves cwd from the payload (Codex sets it),
 * falling back to the process cwd. Never throws.
 */
export async function runNotify(arg: string | undefined): Promise<string> {
	const payload = parseNotifyPayload(arg);
	const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
	const entries = entriesFromNotifyPayload(payload);
	const threadId = (payload as { "thread-id"?: unknown })["thread-id"];
	const deps: CoreDeps = { entries };
	if (typeof threadId === "string") deps.sessionFile = threadId;
	const result = await capture(cwd, "turn-complete", deps);
	return formatCapture(result, cwd);
}

/** Manual `/checkpoint`: best-effort newest rollout for recent conversation, capture as "manual". */
export async function runManual(cwd: string): Promise<string> {
	const rollout = newestRolloutFile();
	const entries = entriesFromRolloutFile(rollout);
	const deps: CoreDeps = { entries };
	if (rollout) deps.sessionFile = rollout;
	const result = await capture(cwd, "manual", deps);
	return formatCapture(result, cwd);
}

export async function runOptIn(cwd: string): Promise<string> {
	const result = await optIn(cwd);
	const rules = result.addedIgnoreRules.length
		? ` Added ignore rules: ${result.addedIgnoreRules.join(", ")}.`
		: " Ignore rules already present.";
	return `Checkpointing enabled. Config: ${relative(cwd, result.configPath)}; pending: ${result.pendingDir}; archive: ${result.archiveDir}.${rules}`;
}

export async function runDisable(cwd: string): Promise<string> {
	await disable(cwd);
	return "Checkpointing disabled (config kept; re-enable with /checkpoint-optin).";
}

export async function runStatus(cwd: string): Promise<string> {
	const s = await status(cwd);
	if (!s.configured) return "Checkpointing is not configured here. Run /checkpoint-optin.";
	return [
		`Configured: yes`,
		`Enabled: ${s.enabled ? "yes" : "no"}`,
		`Pending: ${s.pendingCount} (${s.pendingDir})`,
		`Archived: ${s.archivedCount} (${s.archiveDir})`,
	].join("\n");
}

/** Human-readable rendering of a core ArchiveResult (filenames are archive basenames). */
export function formatArchive(result: ArchiveResult): string {
	const { moved, skipped, errors, prunedCount } = result;
	if (moved.length === 0 && skipped.length === 0 && errors.length === 0) {
		return "No pending checkpoints to archive.";
	}
	const parts: string[] = [];
	if (moved.length > 0) parts.push(`Archived ${moved.length} checkpoint(s).`);
	if (skipped.length > 0) {
		parts.push(`Skipped: ${skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`);
	}
	if (prunedCount > 0) parts.push(`Pruned ${prunedCount} old archived checkpoint(s).`);
	if (errors.length > 0) {
		parts.push(`Errors: ${errors.map((e) => `${e.name} (${e.error})`).join(", ")}.`);
	}
	return parts.join(" ");
}

/** Recovery close-out: move processed checkpoints pending->archive via the core. */
export async function runArchive(cwd: string, names: string[]): Promise<string> {
	const s = await status(cwd);
	if (!s.configured) return "Checkpointing is not configured here. Run /checkpoint-optin.";
	const result = await archive(cwd, names.length > 0 ? names : undefined);
	return formatArchive(result);
}
