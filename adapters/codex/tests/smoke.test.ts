/**
 * End-to-end scripted bridge smoke test (quickstart.md). Drives the real bridge runners against a
 * throwaway repo, exercising the full core path: opt-in, notify auto-capture, dedup, type-mismatch
 * skip, status.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runNotify, runOptIn, runStatus } from "../src/bridge.ts";

test("smoke: optin -> notify(1) -> dedup -> notify(type-mismatch, none) -> status", async () => {
	const cwd = mkdtempSync(join(tmpdir(), "ckpt-codex-smoke-"));
	const pending = (): number => {
		const dir = join(cwd, "sessions", "pending");
		return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).length : 0;
	};
	const payload = (user: string): string =>
		JSON.stringify({
			type: "agent-turn-complete",
			cwd,
			"input-messages": [user],
			"last-assistant-message": "ok",
		});

	await runOptIn(cwd);
	assert.ok(existsSync(join(cwd, ".checkpoint.json")));

	await runNotify(payload("first turn"));
	assert.equal(pending(), 1, "one checkpoint after the first turn-complete");
	const file = readdirSync(join(cwd, "sessions", "pending")).find((f) => f.endsWith(".md"))!;
	assert.match(
		readFileSync(join(cwd, "sessions", "pending", file), "utf8"),
		/Reason: turn-complete/,
	);

	await runNotify(payload("second turn"));
	assert.equal(pending(), 1, "dedup suppresses the immediate second turn-complete");

	await runNotify(JSON.stringify({ type: "approval-requested", cwd }));
	assert.equal(pending(), 1, "a non-agent-turn-complete event captures nothing");

	assert.match(await runStatus(cwd), /Configured: yes/);
});
