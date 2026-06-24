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

/** Why a named file was not moved during archive (all benign — never an error). */
export interface ArchiveSkip {
	name: string;
	/**
	 * - `not-found`: the named file is not in the pending directory.
	 * - `already-archived`: a same-named file already exists in the archive (collision-safe no-op).
	 * - `not-checkpoint`: an explicitly named file that is not a `*.md` checkpoint (e.g. `.gitkeep`).
	 */
	reason: "not-found" | "already-archived" | "not-checkpoint";
}

/** A file whose move failed with a real IO error (message captured, never thrown). */
export interface ArchiveError {
	name: string;
	error: string;
}

/**
 * Outcome of the mechanical `archive` capability. Every requested file (or, in all-mode, every
 * discovered pending `*.md`) is accounted for in exactly one of `moved`/`skipped`/`errors`, so a
 * checkpoint is never silently lost. `prunedCount` reflects the post-move archive prune.
 */
export interface ArchiveResult {
	moved: string[];
	skipped: ArchiveSkip[];
	errors: ArchiveError[];
	prunedCount: number;
}

/**
 * Classification of a single directory by `migrateConfig` (config single-source migration, 007):
 * - `not-configured`: neither `.checkpoint.json` nor `.pi/checkpoint.json` present.
 * - `already-canonical`: only the canonical `.checkpoint.json` present (nothing to do).
 * - `migrated`: only the legacy file present → canonical written from it, legacy removed.
 * - `redundant-legacy-removed`: both present → canonical kept byte-unchanged, legacy removed.
 * - `failed`: a real IO/parse error (e.g. malformed legacy JSON); legacy left intact.
 */
export type ConfigMigrationAction =
	| "not-configured"
	| "already-canonical"
	| "migrated"
	| "redundant-legacy-removed"
	| "failed";

/**
 * Outcome of migrating one directory's config to the canonical single source. The `wroteCanonical`
 * /`removedLegacy` flags describe the action taken (or, in dry-run, the action that would be taken).
 * Canonical is always written before legacy is removed; on a write failure the action is `failed`
 * and the legacy file is left intact, so a project never loses its only config copy.
 */
export interface ConfigMigrationResult {
	root: string;
	action: ConfigMigrationAction;
	canonicalPath: string;
	legacyPath: string;
	wroteCanonical: boolean;
	removedLegacy: boolean;
	error: string | null;
}
