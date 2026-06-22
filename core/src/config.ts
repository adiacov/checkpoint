/**
 * Config load + normalization. Ported from the reference `normalizeConfig`/`readConfig`
 * (FR-008, FR-009), with two deliberate changes recorded in research.md:
 *  - canonical path is `.checkpoint.json` at the project root (legacy `.pi/checkpoint.json`
 *    is read only as a fallback during the transition, §D3);
 *  - `dedupWindowSeconds` is surfaced as a config field (was a module constant, §D2).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CheckpointConfig } from "./types.js";

export const CONFIG_FILENAME = ".checkpoint.json";
export const LEGACY_CONFIG_RELATIVE_PATH = path.join(".pi", "checkpoint.json");

export const DEFAULT_RECENT_ENTRIES = 24;
export const DEFAULT_MAX_TEXT_PER_ENTRY = 4000;
export const DEFAULT_MAX_ARCHIVED_CHECKPOINTS = 50;
export const DEFAULT_DEDUP_WINDOW_SECONDS = 20;

export const DEFAULT_CONFIG: Omit<CheckpointConfig, "createdAt" | "updatedAt"> = {
	version: 1,
	enabled: true,
	pendingDir: path.join("sessions", "pending"),
	archiveDir: path.join("sessions", "archive"),
	includeReload: false,
	skipEmptySessions: true,
	maxArchivedCheckpoints: DEFAULT_MAX_ARCHIVED_CHECKPOINTS,
	recentEntries: DEFAULT_RECENT_ENTRIES,
	maxTextPerEntry: DEFAULT_MAX_TEXT_PER_ENTRY,
	dedupWindowSeconds: DEFAULT_DEDUP_WINDOW_SECONDS,
};

/** Apply documented defaults and clamps to a possibly-partial config (FR-009). */
export function normalizeConfig(config: Partial<CheckpointConfig>): CheckpointConfig {
	const now = new Date().toISOString();
	return {
		...DEFAULT_CONFIG,
		...config,
		version: 1,
		enabled: config.enabled === true,
		pendingDir: safeRelativeDir(config.pendingDir, DEFAULT_CONFIG.pendingDir),
		archiveDir: safeRelativeDir(config.archiveDir, DEFAULT_CONFIG.archiveDir),
		includeReload: config.includeReload === true,
		skipEmptySessions: config.skipEmptySessions !== false,
		maxArchivedCheckpoints: positiveInteger(
			config.maxArchivedCheckpoints,
			DEFAULT_MAX_ARCHIVED_CHECKPOINTS,
		),
		recentEntries: positiveInteger(config.recentEntries, DEFAULT_RECENT_ENTRIES),
		maxTextPerEntry: positiveInteger(config.maxTextPerEntry, DEFAULT_MAX_TEXT_PER_ENTRY),
		dedupWindowSeconds: positiveInteger(config.dedupWindowSeconds, DEFAULT_DEDUP_WINDOW_SECONDS),
		createdAt: config.createdAt ?? now,
		updatedAt: config.updatedAt ?? now,
	};
}

/**
 * Load and normalize a project's config. Reads the canonical `.checkpoint.json` first, then
 * falls back to the legacy `.pi/checkpoint.json` during the transition. Returns `undefined`
 * when neither file exists.
 */
export function loadConfig(root: string): CheckpointConfig | undefined {
	const canonical = path.join(root, CONFIG_FILENAME);
	if (existsSync(canonical)) return parseConfig(canonical);

	const legacy = path.join(root, LEGACY_CONFIG_RELATIVE_PATH);
	if (existsSync(legacy)) return parseConfig(legacy);

	return undefined;
}

function parseConfig(configPath: string): CheckpointConfig {
	const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Partial<CheckpointConfig>;
	return normalizeConfig(parsed);
}

/** Write the config as tab-indented JSON (with trailing newline), creating parent dirs. */
export function writeConfig(configPath: string, config: CheckpointConfig): void {
	mkdirSync(path.dirname(configPath), { recursive: true });
	writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
}

/** Reject absolute paths and parent-directory escapes; fall back to the default. */
function safeRelativeDir(value: unknown, fallback: string): string {
	const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
	if (path.isAbsolute(raw) || raw.includes("..")) return fallback;
	return raw;
}

function positiveInteger(value: unknown, fallback: number): number {
	return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
