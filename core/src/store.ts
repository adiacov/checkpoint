/**
 * Filesystem store primitives shared across capabilities: directory resolution, ensuring
 * directories exist, and counting checkpoint files. Write/dedup (capture), opt-in setup, and
 * prune are added by their respective capabilities in later modules/phases.
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
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
