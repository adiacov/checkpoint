/**
 * Filesystem store primitives shared across capabilities: directory resolution, ensuring
 * directories exist, and counting checkpoint files. Write/dedup (capture), opt-in setup, and
 * prune are added by their respective capabilities in later modules/phases.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CheckpointConfig } from "./types.js";

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
 * Idempotently append ignore rules that keep raw checkpoint markdown out of git while leaving
 * the `.gitkeep` placeholders and the config file tracked (FR-010, SC-004). Returns the rules
 * that were newly added (empty if all were already present). Ported from the reference
 * `ensureGitIgnoreRules`.
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
	const requiredRules = [
		`${config.pendingDir.replace(/\\/g, "/")}/*.md`,
		`${config.archiveDir.replace(/\\/g, "/")}/*.md`,
	];
	const missingRules = requiredRules.filter((rule) => !existingRules.has(rule));
	if (missingRules.length === 0) return [];

	const prefix = current.length === 0 || current.endsWith("\n") ? "" : "\n";
	const section = ["# Raw checkpoint files", ...missingRules].join("\n");
	writeFileSync(gitignorePath, `${current}${prefix}${section}\n`, "utf8");
	return missingRules;
}
