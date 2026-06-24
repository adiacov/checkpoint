import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CONFIG_FILENAME, LEGACY_CONFIG_RELATIVE_PATH, loadConfig } from "../src/config.ts";
import { migrateConfig } from "../src/migrate.ts";

function tmp(): string {
	return mkdtempSync(path.join(tmpdir(), "ckpt-migrate-"));
}

function writeLegacy(root: string, config: object): string {
	const p = path.join(root, LEGACY_CONFIG_RELATIVE_PATH);
	mkdirSync(path.dirname(p), { recursive: true });
	writeFileSync(p, JSON.stringify(config));
	return p;
}

function canonical(root: string): string {
	return path.join(root, CONFIG_FILENAME);
}

test("not-configured: neither file present → no action, no writes", () => {
	const root = tmp();
	const r = migrateConfig(root, { apply: true });
	assert.equal(r.action, "not-configured");
	assert.equal(r.wroteCanonical, false);
	assert.equal(r.removedLegacy, false);
	assert.ok(!existsSync(canonical(root)));
});

test("already-canonical: only canonical present → idempotent no-op", () => {
	const root = tmp();
	writeFileSync(canonical(root), JSON.stringify({ version: 1, enabled: true }));
	const before = readFileSync(canonical(root), "utf8");
	const r = migrateConfig(root, { apply: true });
	assert.equal(r.action, "already-canonical");
	assert.equal(readFileSync(canonical(root), "utf8"), before, "canonical untouched");
});

test("dry-run on a legacy-only dir classifies as migrated but changes nothing", () => {
	const root = tmp();
	const legacy = writeLegacy(root, { version: 1, enabled: true });
	const r = migrateConfig(root); // apply defaults to false
	assert.equal(r.action, "migrated");
	assert.equal(r.wroteCanonical, true);
	assert.equal(r.removedLegacy, true);
	assert.ok(existsSync(legacy), "legacy still present in dry-run");
	assert.ok(!existsSync(canonical(root)), "no canonical written in dry-run");
});

test("migrated: legacy → canonical, settings preserved (disabled + tuning + createdAt), legacy removed", () => {
	const root = tmp();
	const legacy = writeLegacy(root, {
		version: 1,
		enabled: false,
		recentEntries: 7,
		dedupWindowSeconds: 99,
		createdAt: "2020-01-02T03:04:05.000Z",
	});
	const r = migrateConfig(root, { apply: true });
	assert.equal(r.action, "migrated");
	assert.ok(existsSync(canonical(root)));
	assert.ok(!existsSync(legacy), "legacy removed after canonical written");

	const cfg = loadConfig(root);
	assert.ok(cfg);
	assert.equal(cfg.enabled, false, "disabled state preserved");
	assert.equal(cfg.recentEntries, 7, "tuning preserved");
	assert.equal(cfg.dedupWindowSeconds, 99, "tuning preserved");
	assert.equal(cfg.createdAt, "2020-01-02T03:04:05.000Z", "createdAt preserved");
});

test("redundant-legacy-removed: both present → canonical byte-unchanged, only legacy removed", () => {
	const root = tmp();
	const legacy = writeLegacy(root, { version: 1, enabled: false, recentEntries: 3 });
	const canonicalText = `${JSON.stringify({ version: 1, enabled: true, recentEntries: 12 }, null, "\t")}\n`;
	writeFileSync(canonical(root), canonicalText);

	const r = migrateConfig(root, { apply: true });
	assert.equal(r.action, "redundant-legacy-removed");
	assert.equal(r.wroteCanonical, false);
	assert.equal(r.removedLegacy, true);
	assert.ok(!existsSync(legacy), "legacy removed");
	assert.equal(
		readFileSync(canonical(root), "utf8"),
		canonicalText,
		"canonical byte-for-byte unchanged",
	);
});

test("failed: malformed legacy JSON → failed, legacy intact, no canonical (no data loss)", () => {
	const root = tmp();
	const legacy = path.join(root, LEGACY_CONFIG_RELATIVE_PATH);
	mkdirSync(path.dirname(legacy), { recursive: true });
	writeFileSync(legacy, "{ not valid json ");

	const r = migrateConfig(root, { apply: true });
	assert.equal(r.action, "failed");
	assert.ok(r.error);
	assert.ok(existsSync(legacy), "legacy left intact on failure");
	assert.ok(!existsSync(canonical(root)), "no partial canonical written");
});

test("idempotent: re-running after a migration changes nothing", () => {
	const root = tmp();
	writeLegacy(root, { version: 1, enabled: true });
	migrateConfig(root, { apply: true });
	const before = readFileSync(canonical(root), "utf8");

	const second = migrateConfig(root, { apply: true });
	assert.equal(second.action, "already-canonical");
	assert.equal(readFileSync(canonical(root), "utf8"), before);
});
