/**
 * Shared types for the agent-neutral checkpoint core.
 *
 * These are the only types adapters need to know about. Two agent-specific inputs are passed
 * in via {@link CoreDeps}: a git command runner and the already-extracted conversation
 * entries. The core itself imports no agent SDK (Constitution Principle I / FR-001).
 */

/** Runs a command and returns its exit code and captured output. */
export type CommandRunner = (
	command: string,
	args: string[],
	options?: { cwd?: string },
) => Promise<{ code: number; stdout: string; stderr: string }>;

/** A single content block when a message's content is structured rather than a plain string. */
export type ContentBlock =
	| { type: "text"; text: string }
	| { type: "thinking" }
	| { type: "toolCall"; name: string; arguments?: unknown }
	| { type: "image" }
	| { type: string; [k: string]: unknown };

/** A conversation message already extracted from the agent's transcript by the adapter. */
export interface ConversationEntry {
	role: string;
	timestamp?: string;
	content: string | ContentBlock[] | Record<string, unknown>;
}

/** Everything the core needs that is agent-specific, supplied by the adapter. */
export interface CoreDeps {
	/** Defaults to a node:child_process runner if omitted. */
	runGit?: CommandRunner;
	/** Used by capture only; absent for optIn/disable/status/sessionStart. */
	entries?: ConversationEntry[];
	/** The "Session file" header value; adapter-specific, optional. */
	sessionFile?: string;
	/** Override the clock for tests. Defaults to `() => new Date()`. */
	now?: () => Date;
}

/** Per-project opt-in and tuning record, persisted as `.checkpoint.json`. */
export interface CheckpointConfig {
	version: 1;
	enabled: boolean;
	pendingDir: string;
	archiveDir: string;
	includeReload: boolean;
	skipEmptySessions: boolean;
	maxArchivedCheckpoints: number;
	recentEntries: number;
	maxTextPerEntry: number;
	dedupWindowSeconds: number;
	createdAt: string;
	updatedAt: string;
}

/** Resolved per call; not persisted. */
export interface ProjectContext {
	cwd: string;
	root: string;
	configPath: string;
	config?: CheckpointConfig;
}

/** Point-in-time repository snapshot, with fallbacks already applied for non-repo/error cases. */
export interface GitFacts {
	branch: string;
	status: string;
	diffStat: string;
	recentCommits: string;
}

export interface CaptureResult {
	written: boolean;
	filePath?: string;
	skippedReason?: "not-configured" | "disabled" | "empty-session" | "reload" | "duplicate";
	error?: string;
}

export interface OptInResult {
	configPath: string;
	pendingDir: string;
	archiveDir: string;
	addedIgnoreRules: string[];
}

export interface DisableResult {
	disabled: boolean;
	configPath: string;
}

export interface StatusResult {
	configured: boolean;
	enabled: boolean;
	pendingDir: string;
	archiveDir: string;
	pendingCount: number;
	archivedCount: number;
}

export interface SessionStartResult {
	pendingCount: number;
	prunedCount: number;
}
