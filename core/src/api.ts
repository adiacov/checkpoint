/**
 * Public API orchestration — the stable seam every agent adapter calls (FR-014, Constitution
 * Principle V). Each capability resolves the project, then delegates to the concern modules
 * (config, git, store, …). Capabilities are added per user-story phase; `detectProject` is the
 * shared resolver they all build on.
 */

import path from "node:path";
import { formatCheckpoint } from "./checkpoint.js";
import {
	CONFIG_FILENAME,
	DEFAULT_CONFIG,
	loadConfig,
	normalizeConfig,
	writeConfig,
} from "./config.js";
import { hasUserMessage } from "./entries.js";
import { defaultRunner, gitFacts, resolveRoot } from "./git.js";
import {
	archiveDirPath,
	ensureCheckpointDirs,
	ensureGitIgnoreRules,
	newestPendingMtimeMs,
	pendingDirPath,
	writeCheckpointFile,
} from "./store.js";
import type {
	CaptureResult,
	CoreDeps,
	DisableResult,
	OptInResult,
	ProjectContext,
} from "./types.js";

function nowIso(deps: CoreDeps): string {
	return (deps.now ?? (() => new Date()))().toISOString();
}

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
 * Opt a project in: write `.checkpoint.json` (enabled, defaults applied, `createdAt`
 * preserved across re-enables), create the pending/archive dirs with `.gitkeep`, and append
 * idempotent `.gitignore` rules. Re-running adds no duplicate rules (FR-008, FR-009, FR-010).
 */
export async function optIn(cwd: string, deps: CoreDeps = {}): Promise<OptInResult> {
	const project = await detectProject(cwd, deps);
	const now = nowIso(deps);
	const existing = project.config;
	const config = normalizeConfig({
		...DEFAULT_CONFIG,
		...existing,
		enabled: true,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	});

	writeConfig(project.configPath, config);
	ensureCheckpointDirs(project.root, config);
	const addedIgnoreRules = ensureGitIgnoreRules(project.root, config);

	return {
		configPath: project.configPath,
		pendingDir: pendingDirPath(project.root, config),
		archiveDir: archiveDirPath(project.root, config),
		addedIgnoreRules,
	};
}

/**
 * Disable checkpointing: set `enabled=false` (and `updatedAt`) only. Directories, ignore
 * rules, and existing checkpoints are left intact, so re-enabling restores capture without
 * further setup. No-op when the project is not configured (FR-017).
 */
export async function disable(cwd: string, deps: CoreDeps = {}): Promise<DisableResult> {
	const project = await detectProject(cwd, deps);
	if (!project.config) {
		return { disabled: false, configPath: project.configPath };
	}
	const config = normalizeConfig({
		...project.config,
		enabled: false,
		updatedAt: nowIso(deps),
	});
	writeConfig(project.configPath, config);
	return { disabled: true, configPath: project.configPath };
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
