/**
 * Filesystem store primitives shared across capabilities: directory resolution, ensuring
 * directories exist, and counting checkpoint files. Write/dedup (capture), opt-in setup, and
 * prune are added by their respective capabilities in later modules/phases.
 */

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type { ArchiveError, ArchiveSkip, CheckpointConfig } from "./types.js";

/** Absolute path to the pending checkpoint directory. */
export function pendingDirPath(root: string, config: CheckpointConfig): string {
	return path.join(root, config.pendingDir);
}

/** Absolute path to the archive checkpoint directory. */
export function archiveDirPath(root: string, config: CheckpointConfig): string {
	return path.join(root, config.archiveDir);
}

/** Create a directory (and parents) if it does not already exist. */
export function ensureDir(dir: string): void {
	mkdirSync(dir, { recursive: true });
}

/** Sorted list of `*.md` checkpoint filenames in a directory (empty if the dir is absent). */
export function listCheckpointFiles(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((name) => name.endsWith(".md"))
		.sort();
}

/** Count of `*.md` checkpoint files in a directory (0 if absent). */
export function countCheckpointFiles(dir: string): number {
	return listCheckpointFiles(dir).length;
}

/**
 * Write a checkpoint body to `pendingDir/${baseName}.md`, appending a numeric suffix on
 * collision so near-simultaneous captures never overwrite a prior checkpoint (research §D5,
 * clock-skew edge case). Creates the directory if needed. Returns the path written.
 */
export function writeCheckpointFile(pendingDir: string, baseName: string, body: string): string {
	ensureDir(pendingDir);
	let candidate = path.join(pendingDir, `${baseName}.md`);
	let suffix = 2;
	while (existsSync(candidate)) {
		candidate = path.join(pendingDir, `${baseName}-${suffix}.md`);
		suffix += 1;
	}
	writeFileSync(candidate, body, "utf8");
	return candidate;
}

/**
 * Modification time (ms) of the newest pending checkpoint, or `undefined` if none. Used for
 * stateless, cross-process dedup (FR-006): the newest file's mtime stands in for "the last
 * capture", independent of any in-memory process state.
 */
export function newestPendingMtimeMs(pendingDir: string): number | undefined {
	const files = listCheckpointFiles(pendingDir);
	if (files.length === 0) return undefined;
	let newest = 0;
	for (const name of files) {
		const mtime = statSync(path.join(pendingDir, name)).mtimeMs;
		if (mtime > newest) newest = mtime;
	}
	return newest;
}

/** Create the pending and archive directories with tracked `.gitkeep` placeholders (FR-010). */
export function ensureCheckpointDirs(root: string, config: CheckpointConfig): void {
	for (const dir of [pendingDirPath(root, config), archiveDirPath(root, config)]) {
		ensureDir(dir);
		ensureGitKeep(dir);
	}
}

function ensureGitKeep(dir: string): void {
	const file = path.join(dir, ".gitkeep");
	if (!existsSync(file)) writeFileSync(file, "", "utf8");
}

/**
 * Idempotently append ignore rules that keep *all* raw checkpoint files out of git while leaving
 * the `.gitkeep` placeholders (and the config file) tracked (FR-010, SC-004). Creates `.gitignore`
 * if it does not exist. Returns the rules that were newly added (empty if all were already present).
 *
 * The rules ignore the entire pending/archive directory contents — not just `*.md` — because raw
 * captures are transient session evidence (git state + verbatim recent conversation) that can carry
 * secrets, tokens, and local absolute paths, so they must never be published regardless of
 * extension. Each ignore is paired with a `!.../.gitkeep` negation so the empty dirs stay in the
 * repo. The negation must follow its ignore line, so the rules are emitted in that order.
 */
export function ensureGitIgnoreRules(root: string, config: CheckpointConfig): string[] {
	const gitignorePath = path.join(root, ".gitignore");
	const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
	const existingRules = new Set(
		current
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter(Boolean),
	);
	const pendingDir = config.pendingDir.replace(/\\/g, "/");
	const archiveDir = config.archiveDir.replace(/\\/g, "/");
	const requiredRules = [
		`${pendingDir}/*`,
		`!${pendingDir}/.gitkeep`,
		`${archiveDir}/*`,
		`!${archiveDir}/.gitkeep`,
	];
	const missingRules = requiredRules.filter((rule) => !existingRules.has(rule));
	if (missingRules.length === 0) return [];

	const prefix = current.length === 0 || current.endsWith("\n") ? "" : "\n";
	const section = [
		"# Raw checkpoint captures — never publish (may contain secrets/paths)",
		...missingRules,
	].join("\n");
	writeFileSync(gitignorePath, `${current}${prefix}${section}\n`, "utf8");
	return missingRules;
}

/**
 * Move checkpoint files from the pending directory to the archive directory — the mechanical half
 * of recovery (Constitution Principle III: this only moves files, it never reads or curates their
 * content). When `names` is omitted/empty, every pending `*.md` is archived. Each requested file is
 * accounted for in exactly one of moved/skipped/errors, so nothing is silently lost:
 *
 * - a non-`*.md` name → skipped `not-checkpoint` (e.g. `.gitkeep`, never moved);
 * - a name absent from pending → skipped `already-archived` if it is already in the archive, else
 *   `not-found` (this is also the idempotent re-run path);
 * - a name present in pending whose target already exists in the archive → skipped
 *   `already-archived`, leaving the pending copy untouched (never overwrites, never loses);
 * - otherwise the file is moved (rename, falling back to copy+unlink across devices) and reported
 *   in `moved`.
 *
 * Pruning is NOT done here — the caller (`archive`) runs the shared `pruneArchive` afterward.
 */
export function archiveCheckpointFiles(
	root: string,
	config: CheckpointConfig,
	names?: string[],
): { moved: string[]; skipped: ArchiveSkip[]; errors: ArchiveError[] } {
	const pendingDir = pendingDirPath(root, config);
	const archiveDir = archiveDirPath(root, config);
	const requested = names && names.length > 0 ? names : listCheckpointFiles(pendingDir);

	const moved: string[] = [];
	const skipped: ArchiveSkip[] = [];
	const errors: ArchiveError[] = [];

	for (const name of requested) {
		// Use only the basename so a caller can never escape the configured directories.
		const safeName = path.basename(name);
		if (!safeName.endsWith(".md")) {
			skipped.push({ name: safeName, reason: "not-checkpoint" });
			continue;
		}
		const src = path.join(pendingDir, safeName);
		const dest = path.join(archiveDir, safeName);
		if (!existsSync(src)) {
			skipped.push({
				name: safeName,
				reason: existsSync(dest) ? "already-archived" : "not-found",
			});
			continue;
		}
		if (existsSync(dest)) {
			// Same name already archived: never overwrite, never delete the pending copy.
			skipped.push({ name: safeName, reason: "already-archived" });
			continue;
		}
		try {
			ensureDir(archiveDir);
			moveFile(src, dest);
			moved.push(safeName);
		} catch (error) {
			errors.push({
				name: safeName,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { moved, skipped, errors };
}

/** Move a file, falling back to copy+unlink when rename crosses a device boundary (EXDEV). */
function moveFile(src: string, dest: string): void {
	try {
		renameSync(src, dest);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
		copyFileSync(src, dest);
		unlinkSync(src);
	}
}

/**
 * Prune the archive to `maxArchivedCheckpoints`, removing the oldest files first
 * (lexicographic == chronological on the ISO-timestamp filenames). Best-effort: a failed
 * unlink is ignored so pruning never fails a capture/session-start (FR-013, SC-005). Returns
 * the number of files removed. Never touches the pending directory.
 */
export function pruneArchive(root: string, config: CheckpointConfig): number {
	const archiveDir = archiveDirPath(root, config);
	const files = listCheckpointFiles(archiveDir);
	const excess = files.length - config.maxArchivedCheckpoints;
	if (excess <= 0) return 0;

	let pruned = 0;
	for (const name of files.slice(0, excess)) {
		try {
			unlinkSync(path.join(archiveDir, name));
			pruned += 1;
		} catch {
			// Best-effort cleanup only; pruning must not fail the caller.
		}
	}
	return pruned;
}
