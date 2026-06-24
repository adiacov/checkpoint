/**
 * The thin bridge between Claude Code and @checkpoint/core. It parses hook/command input, reads &
 * translates the transcript, calls the core, and formats the result for humans. It contains NO
 * checkpoint logic: every decision (configured/disabled/empty/duplicate/reload-gating, dedup,
 * prune, git facts, markdown) is the core's. See contracts/commands.md.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import {
	capture,
	disable,
	optIn,
	sessionStart,
	status,
	type CaptureResult,
	type ConversationEntry,
} from "@checkpoint/core";
import { parseTranscript } from "./transcript.js";

/** Fields we read from a Claude Code hook's stdin JSON payload. */
export interface HookInput {
	cwd?: string;
	transcript_path?: string;
}

/** Read all of stdin (hook payload). Returns "" if nothing is piped. */
export async function readStdin(): Promise<string> {
	if (process.stdin.isTTY) return "";
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks).toString("utf8");
}

/** Parse a hook stdin payload; tolerant of empty/garbage input. */
export function parseHookInput(stdin: string): HookInput {
	const text = stdin.trim();
	if (!text) return {};
	try {
		return JSON.parse(text) as HookInput;
	} catch {
		return {};
	}
}

/** Translate a transcript file into entries; missing/unreadable file -> [] (core then skips). */
export function entriesFromTranscript(path: string | undefined): ConversationEntry[] {
	if (!path) return [];
	try {
		return parseTranscript(readFileSync(path, "utf8"));
	} catch {
		return [];
	}
}

/**
 * Best-effort lookup of the newest transcript for `cwd`, used by the manual command (slash commands
 * are not handed a `transcript_path`). Claude Code stores transcripts under
 * `~/.claude/projects/<cwd-with-slashes-and-dots-as-dashes>/<session>.jsonl`.
 */
export function newestTranscriptForCwd(cwd: string): string | undefined {
	const encoded = cwd.replace(/[/.]/g, "-");
	const dir = join(homedir(), ".claude", "projects", encoded);
	let newest: { path: string; mtimeMs: number } | undefined;
	try {
		for (const name of readdirSync(dir)) {
			if (!name.endsWith(".jsonl")) continue;
			const path = join(dir, name);
			const mtimeMs = statSync(path).mtimeMs;
			if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs };
		}
	} catch {
		return undefined;
	}
	return newest?.path;
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

/** Auto-capture from a lifecycle hook: read stdin payload, translate, capture with `reason`. */
export async function runLifecycleCapture(reason: string, stdin: string): Promise<string> {
	const input = parseHookInput(stdin);
	const cwd = input.cwd ?? process.cwd();
	const entries = entriesFromTranscript(input.transcript_path);
	const result = await capture(cwd, reason, { entries, sessionFile: input.transcript_path });
	return formatCapture(result, cwd);
}

/** Manual `/checkpoint`: resolve the newest transcript for cwd, translate, capture as "manual". */
export async function runManual(cwd: string): Promise<string> {
	const transcriptPath = newestTranscriptForCwd(cwd);
	const entries = entriesFromTranscript(transcriptPath);
	const result = await capture(cwd, "manual", { entries, sessionFile: transcriptPath });
	return formatCapture(result, cwd);
}

/** SessionStart: prune + report pending count, only when enabled & there is something to review. */
export async function runSessionStart(stdin: string): Promise<string> {
	const cwd = parseHookInput(stdin).cwd ?? process.cwd();
	const before = await status(cwd);
	if (!before.configured || !before.enabled) return "";
	const { pendingCount } = await sessionStart(cwd);
	if (pendingCount <= 0) return "";
	return `${pendingCount} pending checkpoint(s) need review in ${before.pendingDir}.`;
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
