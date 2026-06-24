// Codex notify TOML wiring — the one edit we make to a user-owned file. Asserts root-table
// placement (before the first [table] header), sentinel marking, idempotent update, and byte-exact
// removal that leaves unrelated config intact.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { applyCodexNotify, removeCodexNotify, run } from "../../scripts/install.mjs";

const SENTINEL = "# checkpoint-managed (006) — do not edit this line";

let tmp;
beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "ckpt-notify-"));
});
afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

const NOTIFY = 'notify = ["node", "/abs/bridge/dist/index.js", "notify"]';

test("insert places the managed notify in the root table, before the first [table] header", () => {
	const original = '[projects."/home/x"]\ntrust_level = "trusted"\n\n[tui]\nfoo = 1\n';
	const out = applyCodexNotify(original, NOTIFY);
	const lines = out.split("\n");
	const firstHeader = lines.findIndex((l) => l.trim().startsWith("["));
	const notifyIdx = lines.findIndex((l) => l.trim().startsWith("notify ="));
	const sentinelIdx = lines.findIndex((l) => l.trim() === SENTINEL);
	assert.ok(notifyIdx >= 0 && notifyIdx < firstHeader, "notify is before the first table header");
	assert.equal(sentinelIdx + 1, notifyIdx, "sentinel immediately precedes notify");
	assert.ok(out.includes('[projects."/home/x"]'), "existing tables preserved");
});

test("insert into an empty/absent config still yields a valid root-table notify", () => {
	const out = applyCodexNotify("", NOTIFY);
	assert.ok(out.startsWith(SENTINEL));
	assert.ok(out.includes(NOTIFY));
});

test("re-applying is idempotent: updates in place, never duplicates", () => {
	const original = "[tui]\nx = 1\n";
	const once = applyCodexNotify(original, NOTIFY);
	const twice = applyCodexNotify(once, NOTIFY);
	assert.equal(once, twice, "stable after second apply");
	assert.equal(twice.split("notify =").length - 1, 1, "exactly one notify line");

	// a changed path updates the managed line in place (still exactly one)
	const updated = applyCodexNotify(once, 'notify = ["node", "/new/path.js", "notify"]');
	assert.equal(updated.split("notify =").length - 1, 1);
	assert.ok(updated.includes("/new/path.js"));
});

test("removal deletes the managed line + sentinel and leaves unrelated content byte-intact", () => {
	const original = '[projects."/home/x"]\ntrust_level = "trusted"\n\n[tui]\nfoo = 1\n';
	const withNotify = applyCodexNotify(original, NOTIFY);
	const { changed, text } = removeCodexNotify(withNotify);
	assert.ok(changed);
	assert.ok(!text.includes("notify ="));
	assert.ok(!text.includes(SENTINEL));
	assert.equal(text, original, "config restored byte-for-byte");

	// removing again is a no-op
	const second = removeCodexNotify(text);
	assert.equal(second.changed, false);
});

test("integration: run() install adds a resolved absolute notify path; uninstall removes only it", async () => {
	const home = join(tmp, "home");
	const cfg = join(home, ".codex", "config.toml");
	mkdirSync(join(home, ".codex"), { recursive: true });
	writeFileSync(cfg, '[projects."/x"]\ntrust_level = "trusted"\n');

	const base = {
		agents: ["codex"],
		mode: "symlink",
		dryRun: false,
		force: false,
		build: false,
		targetRoots: {},
		home,
		installDir: join(tmp, "state"),
	};

	const inst = await run({ ...base, verb: "install" });
	assert.equal(inst.exitCode, 0);
	const text = readFileSync(cfg, "utf8");
	assert.ok(text.includes(SENTINEL));
	assert.match(text, /notify = \["node", "\/.*adapters\/codex\/dist\/index\.js", "notify"\]/, "absolute bridge path, no <BRIDGE> placeholder");
	assert.ok(!text.includes("<BRIDGE>"));

	const un = await run({ ...base, verb: "uninstall" });
	assert.equal(un.exitCode, 0);
	const after = readFileSync(cfg, "utf8");
	assert.ok(!after.includes("notify ="));
	assert.ok(after.includes('[projects."/x"]'), "user table preserved");
	assert.ok(!existsSync(join(home, ".codex", "prompts", "checkpoint.md")), "prompts removed too");
});
