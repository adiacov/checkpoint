// Sweep tests — run entirely against temporary directory trees; real sibling projects and ~/.pi are
// never touched. Builds the core first is assumed (core/dist present).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { run } from "../../scripts/migrate-configs.mjs";

let tmp;
beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "ckpt-sweep-"));
});
afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

function project(name) {
	const dir = join(tmp, name);
	mkdirSync(dir, { recursive: true });
	return dir;
}
function legacyPath(dir) {
	return join(dir, ".pi", "checkpoint.json");
}
function canonicalPath(dir) {
	return join(dir, ".checkpoint.json");
}
function writeLegacy(dir, cfg) {
	mkdirSync(join(dir, ".pi"), { recursive: true });
	writeFileSync(legacyPath(dir), JSON.stringify(cfg));
}
function piExt(withLegacy, withSharedCore) {
	const p = join(tmp, "_piext");
	mkdirSync(p, { recursive: true });
	if (withLegacy) writeFileSync(join(p, "checkpoint.ts"), "// legacy");
	if (withSharedCore) mkdirSync(join(p, "checkpoint"), { recursive: true });
	return p;
}
function opts(extra) {
	return { root: tmp, apply: false, force: false, piExtensions: piExt(false, true), ...extra };
}

test("US1 dry-run: classifies mixed projects and changes nothing", () => {
	const legacyOnly = project("legacy-only");
	writeLegacy(legacyOnly, { version: 1, enabled: true });
	const both = project("both");
	writeLegacy(both, { version: 1, enabled: true });
	writeFileSync(canonicalPath(both), JSON.stringify({ version: 1, enabled: true }));
	const canonicalOnly = project("canonical-only");
	writeFileSync(canonicalPath(canonicalOnly), JSON.stringify({ version: 1, enabled: true }));
	project("unconfigured");

	const res = run(opts());
	const by = Object.fromEntries(res.outcomes.map((o) => [o.path, o.outcome]));
	assert.equal(by[legacyOnly], "migrated");
	assert.equal(by[both], "redundant-legacy-removed");
	assert.equal(by[canonicalOnly], "already-canonical");
	assert.equal(by[project("unconfigured")], "not-configured");

	// nothing changed on disk
	assert.ok(existsSync(legacyPath(legacyOnly)), "legacy still present after dry-run");
	assert.ok(!existsSync(canonicalPath(legacyOnly)), "no canonical written in dry-run");
	assert.ok(existsSync(legacyPath(both)), "both's legacy still present");
	assert.equal(res.exitCode, 0);
});

test("US2 apply: migrates legacy-only preserving settings; both → canonical kept; idempotent", () => {
	const legacyOnly = project("legacy-only");
	writeLegacy(legacyOnly, { version: 1, enabled: false, recentEntries: 5, createdAt: "2021-05-06T00:00:00.000Z" });
	const both = project("both");
	writeLegacy(both, { version: 1, enabled: true });
	const canonicalText = `${JSON.stringify({ version: 1, enabled: true, recentEntries: 9 }, null, "\t")}\n`;
	writeFileSync(canonicalPath(both), canonicalText);

	const res = run(opts({ apply: true }));
	assert.equal(res.exitCode, 0);

	// legacy-only migrated, settings preserved
	assert.ok(!existsSync(legacyPath(legacyOnly)), "legacy removed");
	const migrated = JSON.parse(readFileSync(canonicalPath(legacyOnly), "utf8"));
	assert.equal(migrated.enabled, false, "disabled preserved");
	assert.equal(migrated.recentEntries, 5, "tuning preserved");
	assert.equal(migrated.createdAt, "2021-05-06T00:00:00.000Z", "createdAt preserved");

	// both: canonical byte-unchanged, legacy gone
	assert.equal(readFileSync(canonicalPath(both), "utf8"), canonicalText, "canonical unchanged");
	assert.ok(!existsSync(legacyPath(both)), "redundant legacy removed");

	// idempotent re-run
	const again = run(opts({ apply: true }));
	assert.ok(again.outcomes.every((o) => ["already-canonical", "not-configured"].includes(o.outcome)));
});

test("US2 no data loss: malformed legacy → failed, legacy intact, no canonical, exit 1", () => {
	const bad = project("bad");
	mkdirSync(join(bad, ".pi"), { recursive: true });
	writeFileSync(legacyPath(bad), "{ broken json ");

	const res = run(opts({ apply: true }));
	const o = res.outcomes.find((x) => x.path === bad);
	assert.equal(o.outcome, "failed");
	assert.ok(existsSync(legacyPath(bad)), "legacy left intact");
	assert.ok(!existsSync(canonicalPath(bad)), "no partial canonical");
	assert.equal(res.exitCode, 1);
});

test("US3 dirty git repo is skipped under --apply, included with --force; tool never commits", () => {
	const dir = project("wip");
	writeLegacy(dir, { version: 1, enabled: true });
	execFileSync("git", ["-C", dir, "init", "-q"]);
	execFileSync("git", ["-C", dir, "config", "user.email", "t@t"]);
	execFileSync("git", ["-C", dir, "config", "user.name", "t"]);
	writeFileSync(join(dir, "wip.txt"), "uncommitted work");

	const skipped = run(opts({ apply: true }));
	const o = skipped.outcomes.find((x) => x.path === dir);
	assert.equal(o.gitState, "dirty");
	assert.equal(o.outcome, "skipped");
	assert.ok(existsSync(legacyPath(dir)), "dirty repo untouched");

	// no commit was ever made by the tool
	const log = execFileSync("git", ["-C", dir, "rev-list", "--all", "--count"], { encoding: "utf8" }).trim();
	assert.equal(log, "0", "tool created no commits");

	const forced = run(opts({ apply: true, force: true }));
	const o2 = forced.outcomes.find((x) => x.path === dir);
	assert.equal(o2.outcome, "migrated");
	assert.ok(!existsSync(legacyPath(dir)), "migrated under --force");
});

test("US3 ordering guard: refuses legacy deletion when old pi installed & shared-core absent; --force overrides", () => {
	const dir = project("legacy-only");
	writeLegacy(dir, { version: 1, enabled: true });
	const guardedPiExt = piExt(true, false); // legacy pi present, shared-core absent

	const blocked = run({ root: tmp, apply: true, force: false, piExtensions: guardedPiExt });
	const o = blocked.outcomes.find((x) => x.path === dir);
	assert.equal(o.outcome, "skipped");
	assert.match(o.detail, /ordering guard/);
	assert.ok(existsSync(legacyPath(dir)), "legacy not deleted while guard active");
	assert.equal(blocked.exitCode, 1, "guard-block signals exit 1");
	assert.ok(blocked.guardBlocked);

	const forced = run({ root: tmp, apply: true, force: true, piExtensions: guardedPiExt });
	assert.equal(forced.outcomes.find((x) => x.path === dir).outcome, "migrated");
});

test("usage: a non-existent --root throws (maps to exit 2 in main)", () => {
	assert.throws(() => run({ root: join(tmp, "nope"), apply: false, force: false, piExtensions: piExt(false, true) }));
});
