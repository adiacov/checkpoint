/**
 * Public API orchestration — the stable seam every agent adapter calls (FR-014, Constitution
 * Principle V). Each capability resolves the project, then delegates to the concern modules
 * (config, git, store, …). Capabilities are added per user-story phase; `detectProject` is the
 * shared resolver they all build on.
 */

import path from "node:path";
import { formatCheckpoint } from "./checkpoint.js";
import { CONFIG_FILENAME, loadConfig } from "./config.js";
import { hasUserMessage } from "./entries.js";
import { defaultRunner, gitFacts, resolveRoot } from "./git.js";
import { newestPendingMtimeMs, pendingDirPath, writeCheckpointFile } from "./store.js";
import type { CaptureResult, CoreDeps, ProjectContext } from "./types.js";

/**
 * Resolve the project root and load its normalized config for a working directory.
 * `root` = git toplevel or `cwd`; `config` = `.checkpoint.json` (or legacy `.pi/checkpoint.json`)
 * normalized, or `undefined` when the project is not configured.
 */
export async function detectProject(cwd: string, deps: CoreDeps = {}): Promise<ProjectContext> {
	const runGit = deps.runGit ?? defaultRunner;
	const root = await resolveRoot(runGit, cwd);
	const configPath = path.join(root, CONFIG_FILENAME);
	return {
		cwd,
		root,
		configPath,
		config: loadConfig(root),
	};
}

/**
 * Capture a checkpoint. Guards run in order, each returning `written:false` with a
 * `skippedReason` rather than throwing: not-configured → disabled → reload (when
 * include-reload is off) → empty-session (skip-empty) → duplicate (within the dedup window).
 * Otherwise the markdown checkpoint is written to the pending directory. IO failures are
 * surfaced via `error`, never silently dropped (FR-001..FR-007, FR-011, FR-016).
 */
export async function capture(cwd: string, reason: string, deps: CoreDeps): Promise<CaptureResult> {
	const project = await detectProject(cwd, deps);
	const config = project.config;
	if (!config) return { written: false, skippedReason: "not-configured" };
	if (!config.enabled) return { written: false, skippedReason: "disabled" };
	if (reason === "reload" && !config.includeReload) {
		return { written: false, skippedReason: "reload" };
	}

	const entries = deps.entries ?? [];
	if (config.skipEmptySessions && !hasUserMessage(entries)) {
		return { written: false, skippedReason: "empty-session" };
	}

	const now = (deps.now ?? (() => new Date()))();
	const pendingDir = pendingDirPath(project.root, config);
	const newest = newestPendingMtimeMs(pendingDir);
	if (newest !== undefined && (now.getTime() - newest) / 1000 < config.dedupWindowSeconds) {
		return { written: false, skippedReason: "duplicate" };
	}

	try {
		const runGit = deps.runGit ?? defaultRunner;
		const facts = await gitFacts(runGit, project.root);
		const body = formatCheckpoint({
			now,
			reason,
			root: project.root,
			cwd,
			sessionFile: deps.sessionFile,
			gitFacts: facts,
			entries,
			config,
		});
		const stamp = now.toISOString().replace(/[:.]/g, "-");
		const safeReason = reason.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
		const filePath = writeCheckpointFile(pendingDir, `${stamp}-${safeReason}`, body);
		return { written: true, filePath };
	} catch (error) {
		return {
			written: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
