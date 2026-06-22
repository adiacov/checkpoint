/**
 * Markdown checkpoint formatting (FR-003). Reproduces the reference body byte-for-byte:
 * title + header lines, `## Integration note`, `## Git facts`, `## Recent conversation`.
 * Parity with the reference format matters because existing recovery instructions read it
 * (research §D6, FR-015).
 */

import { messageToText, selectRecentEntries, truncate } from "./entries.js";
import type { CheckpointConfig, ConversationEntry, GitFacts } from "./types.js";

export interface CheckpointInput {
	now: Date;
	reason: string;
	root: string;
	cwd: string;
	sessionFile?: string;
	gitFacts: GitFacts;
	entries: ConversationEntry[];
	config: CheckpointConfig;
}

/** Assemble the full checkpoint markdown body. */
export function formatCheckpoint(input: CheckpointInput): string {
	const { now, reason, root, cwd, sessionFile, gitFacts, entries, config } = input;
	return [
		"# Pending Session Checkpoint",
		"",
		`Time: ${now.toISOString()}`,
		`Reason: ${reason}`,
		`Project root: ${root}`,
		`CWD: ${cwd}`,
		`Session file: ${sessionFile ?? "unknown"}`,
		"",
		"## Integration note",
		"",
		"This is raw session evidence, not durable memory.",
		"On the next session, review it and persist only important goals, decisions, current state, next actions, blockers, and durable realizations into the project's memory files.",
		`After integration, move this file to \`${config.archiveDir}/\` or otherwise mark it processed.`,
		"",
		"## Git facts",
		"",
		gitFactsBlock(gitFacts),
		"",
		"## Recent conversation",
		"",
		...selectRecentEntries(entries, config.recentEntries).map((entry) =>
			formatEntry(entry, config.maxTextPerEntry),
		),
		"",
	].join("\n");
}

/** Render the `## Git facts` block (Branch line + fenced Status/Diff/Commits). */
export function gitFactsBlock(facts: GitFacts): string {
	return [
		`Branch: ${facts.branch}`,
		"",
		"### Status",
		"",
		"```text",
		facts.status,
		"```",
		"",
		"### Diff stat",
		"",
		"```text",
		facts.diffStat,
		"```",
		"",
		"### Recent commits",
		"",
		"```text",
		facts.recentCommits,
		"```",
	].join("\n");
}

/** Render one conversation entry as a `### role — timestamp` section. */
function formatEntry(entry: ConversationEntry, maxText: number): string {
	const role = entry.role || "unknown";
	const timestamp = entry.timestamp ? new Date(entry.timestamp).toISOString() : entry.timestamp;
	const text = truncate(messageToText(entry), maxText);
	return [`### ${role} — ${timestamp}`, "", text || "[no text content]", ""].join("\n");
}
