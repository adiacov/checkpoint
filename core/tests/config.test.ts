import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
	DEFAULT_DEDUP_WINDOW_SECONDS,
	DEFAULT_MAX_ARCHIVED_CHECKPOINTS,
	DEFAULT_MAX_TEXT_PER_ENTRY,
	DEFAULT_RECENT_ENTRIES,
	loadConfig,
	normalizeConfig,
	writeConfig,
} from "../src/config.ts";

function tmp(): string {
	return mkdtempSync(path.join(tmpdir(), "ckpt-config-"));
}

test("normalizeConfig applies every documented default for unset fields", () => {
	const config = normalizeConfig({ enabled: true });
	assert.equal(config.version, 1);
	assert.equal(config.pendingDir, path.join("sessions", "pending"));
	assert.equal(config.archiveDir, path.join("sessions", "archive"));
	assert.equal(config.includeReload, false);
	assert.equal(config.skipEmptySessions, true);
	assert.equal(config.recentEntries, DEFAULT_RECENT_ENTRIES);
	assert.equal(config.maxTextPerEntry, DEFAULT_MAX_TEXT_PER_ENTRY);
	assert.equal(config.maxArchivedCheckpoints, DEFAULT_MAX_ARCHIVED_CHECKPOINTS);
	assert.equal(config.dedupWindowSeconds, DEFAULT_DEDUP_WINDOW_SECONDS);
	assert.ok(config.createdAt && config.updatedAt);
});

test("normalizeConfig clamps invalid values and rejects unsafe dirs", () => {
	const config = normalizeConfig({
		enabled: true,
		recentEntries: -5,
		maxTextPerEntry: 0,
		maxArchivedCheckpoints: 1.5,
		dedupWindowSeconds: "20" as unknown as number,
		pendingDir: "/abs/pending",
		archiveDir: "../escape",
	});
	assert.equal(config.recentEntries, DEFAULT_RECENT_ENTRIES);
	assert.equal(config.maxTextPerEntry, DEFAULT_MAX_TEXT_PER_ENTRY);
	assert.equal(config.maxArchivedCheckpoints, DEFAULT_MAX_ARCHIVED_CHECKPOINTS);
	assert.equal(config.dedupWindowSeconds, DEFAULT_DEDUP_WINDOW_SECONDS);
	assert.equal(config.pendingDir, path.join("sessions", "pending"));
	assert.equal(config.archiveDir, path.join("sessions", "archive"));
});

test("enabled is strict: only true counts; skipEmptySessions defaults true unless false", () => {
	assert.equal(normalizeConfig({}).enabled, false);
	assert.equal(normalizeConfig({ enabled: "yes" as unknown as boolean }).enabled, false);
	assert.equal(normalizeConfig({}).skipEmptySessions, true);
	assert.equal(normalizeConfig({ skipEmptySessions: false }).skipEmptySessions, false);
});

test("loadConfig reads canonical .checkpoint.json", () => {
	const root = tmp();
	writeFileSync(
		path.join(root, ".checkpoint.json"),
		JSON.stringify({ version: 1, enabled: true, recentEntries: 5 }),
	);
	const config = loadConfig(root);
	assert.equal(config?.enabled, true);
	assert.equal(config?.recentEntries, 5);
});

test("loadConfig falls back to legacy .pi/checkpoint.json", () => {
	const root = tmp();
	mkdirSync(path.join(root, ".pi"), { recursive: true });
	writeFileSync(
		path.join(root, ".pi", "checkpoint.json"),
		JSON.stringify({ version: 1, enabled: true, maxTextPerEntry: 999 }),
	);
	const config = loadConfig(root);
	assert.equal(config?.maxTextPerEntry, 999);
});

test("loadConfig prefers canonical over legacy when both exist", () => {
	const root = tmp();
	mkdirSync(path.join(root, ".pi"), { recursive: true });
	writeFileSync(
		path.join(root, ".pi", "checkpoint.json"),
		JSON.stringify({ version: 1, enabled: true, recentEntries: 1 }),
	);
	writeFileSync(
		path.join(root, ".checkpoint.json"),
		JSON.stringify({ version: 1, enabled: true, recentEntries: 2 }),
	);
	assert.equal(loadConfig(root)?.recentEntries, 2);
});

test("loadConfig returns undefined when no config exists", () => {
	assert.equal(loadConfig(tmp()), undefined);
});

test("writeConfig round-trips as tab-indented JSON with trailing newline", () => {
	const root = tmp();
	const configPath = path.join(root, ".checkpoint.json");
	const config = normalizeConfig({ enabled: true, recentEntries: 7 });
	writeConfig(configPath, config);
	const raw = readFileSync(configPath, "utf8");
	assert.ok(raw.endsWith("\n"));
	assert.match(raw, /\n\t"recentEntries": 7/);
	assert.equal(loadConfig(root)?.recentEntries, 7);
});
