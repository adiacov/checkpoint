/**
 * Public API orchestration — the stable seam every agent adapter calls (FR-014, Constitution
 * Principle V). Each capability resolves the project, then delegates to the concern modules
 * (config, git, store, …). Capabilities are added per user-story phase; `detectProject` is the
 * shared resolver they all build on.
 */

import path from "node:path";
import { CONFIG_FILENAME, loadConfig } from "./config.js";
import { defaultRunner, resolveRoot } from "./git.js";
import type { CoreDeps, ProjectContext } from "./types.js";

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
