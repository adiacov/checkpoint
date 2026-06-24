/**
 * Config single-source migration (feature 007). Consolidates a project to the canonical
 * `.checkpoint.json`, removing the legacy `.pi/checkpoint.json` second source of truth.
 *
 * The logic lives here once (Constitution I) and is reused by the cross-project sweep
 * (`scripts/migrate-configs.mjs`). It builds entirely on `config.ts` — `loadConfig` to read +
 * preserve legacy settings, `normalizeConfig`/`writeConfig` to emit canonical — so it duplicates no
 * config handling. It never reads checkpoint content (Constitution III).
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import {
	CONFIG_FILENAME,
	LEGACY_CONFIG_RELATIVE_PATH,
	normalizeConfig,
	writeConfig,
} from "./config.js";
import type { CheckpointConfig, ConfigMigrationResult } from "./types.js";

/**
 * Migrate one directory's config to the canonical single source.
 *
 * Classifies by which files exist and (when `apply` is true) performs the migration:
 * - only legacy → write canonical from the legacy settings, then remove legacy (`migrated`);
 * - both → keep canonical byte-unchanged, remove only legacy (`redundant-legacy-removed`);
 * - only canonical → nothing (`already-canonical`); neither → nothing (`not-configured`).
 *
 * Guarantees: canonical is written before legacy is removed; if writing canonical fails the legacy
 * file is left intact (`failed`). Never throws for a normal per-directory error — returns `failed`
 * with `error` set so a sweep stays best-effort. With `apply: false` (the default) nothing is
 * written or removed; the `wroteCanonical`/`removedLegacy` flags describe the intended action.
 */
export function migrateConfig(
	root: string,
	options: { apply?: boolean } = {},
): ConfigMigrationResult {
	const apply = options.apply === true;
	const canonicalPath = path.join(root, CONFIG_FILENAME);
	const legacyPath = path.join(root, LEGACY_CONFIG_RELATIVE_PATH);
	const base: ConfigMigrationResult = {
		root,
		action: "not-configured",
		canonicalPath,
		legacyPath,
		wroteCanonical: false,
		removedLegacy: false,
		error: null,
	};

	const hasCanonical = existsSync(canonicalPath);
	const hasLegacy = existsSync(legacyPath);

	if (!hasLegacy) {
		return { ...base, action: hasCanonical ? "already-canonical" : "not-configured" };
	}

	// Both present → canonical wins; remove only the redundant legacy file.
	if (hasCanonical) {
		try {
			if (apply) rmSync(legacyPath, { force: true });
			return { ...base, action: "redundant-legacy-removed", removedLegacy: true };
		} catch (e) {
			return { ...base, action: "failed", error: errorMessage(e) };
		}
	}

	// Legacy only → write canonical from legacy settings, then remove legacy.
	try {
		const legacyConfig = parseLegacy(legacyPath);
		if (apply) {
			writeConfig(canonicalPath, legacyConfig);
			// Only remove legacy once canonical is safely written (no data loss).
			rmSync(legacyPath, { force: true });
		}
		return { ...base, action: "migrated", wroteCanonical: true, removedLegacy: true };
	} catch (e) {
		return { ...base, action: "failed", error: errorMessage(e) };
	}
}

/** Read + normalize the legacy config, preserving its settings (enabled/disabled, tuning, createdAt). */
function parseLegacy(legacyPath: string): CheckpointConfig {
	const parsed = JSON.parse(readFileSync(legacyPath, "utf8")) as Partial<CheckpointConfig>;
	return normalizeConfig(parsed);
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
