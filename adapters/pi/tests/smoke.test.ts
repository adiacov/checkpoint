/**
 * End-to-end scripted handler smoke test (quickstart.md). Drives the real extension via a stub
 * ExtensionAPI against throwaway repos, exercising the full core path: opt-in, auto-capture,
 * dedup, skip-empty, the start-of-session notice, and legacy `.pi/checkpoint.json` support (FR-013).
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import checkpointExtension from "../src/index.ts";
import type { CommandContext, ExtensionAPI, PiEntry } from "../src/pi-types.ts";

function harness(entries: PiEntry[]) {
	const cwd = mkdtempSync(join(tmpdir(), "ckpt-pi-smoke-"));
	const messages: string[] = [];
	const ctx: CommandContext = {
		cwd,
		hasUI: true,
		ui: { notify: (m) => messages.push(m) },
		sessionManager: { getBranch: () => entries, getSessionFile: () => undefined },
	};
	const commands = new Map<string, { handler: (a: string[], c: CommandContext) => unknown }>();
	const events = new Map<string, (e: { reason?: string }, c: CommandContext) => unknown>();
	const pi = {
		registerCommand: (n: string, s: { handler: (a: string[], c: CommandContext) => unknown }) =>
			commands.set(n, s),
		on: (e: string, h: (ev: { reason?: string }, c: CommandContext) => unknown) => events.set(e, h),
		exec: async (command: string, args: string[]) => {
			const r = spawnSync(command, args, { cwd, encoding: "utf8" });
			return { code: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
		},
	} as unknown as ExtensionAPI;
	checkpointExtension(pi);
	const pending = () => {
		const dir = join(cwd, "sessions", "pending");
		return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).length : 0;
	};
	return {
		cwd,
		messages,
		pending,
		cmd: (n: string) => Promise.resolve(commands.get(n)?.handler([], ctx)),
		fire: (n: string, reason?: string) => Promise.resolve(events.get(n)?.({ reason }, ctx)),
	};
}

test("smoke: optin -> shutdown(1) -> dedup -> empty(skip) -> start notice -> status", async () => {
	const h = harness([{ type: "message", message: { role: "user", content: "build the thing" } }]);

	await h.cmd("checkpoint-optin");
	assert.ok(existsSync(join(h.cwd, ".checkpoint.json")));

	await h.fire("session_shutdown");
	assert.equal(h.pending(), 1, "one checkpoint after shutdown");

	await h.fire("session_shutdown");
	assert.equal(h.pending(), 1, "dedup suppresses the immediate second");

	await h.fire("session_start");
	assert.match(h.messages.at(-1)!, /pending checkpoint\(s\) need review/);

	await h.cmd("checkpoint-status");
	assert.match(h.messages.at(-1)!, /Configured: yes/);
});

test("smoke: empty session writes nothing", async () => {
	const h = harness([{ type: "message", message: { role: "assistant", content: "hi" } }]);
	await h.cmd("checkpoint-optin");
	await h.fire("session_shutdown");
	assert.equal(h.pending(), 0);
});

test("smoke FR-013: a project configured via legacy .pi/checkpoint.json still captures", async () => {
	const h = harness([{ type: "message", message: { role: "user", content: "legacy project" } }]);
	// No .checkpoint.json — only the legacy config the core reads during transition.
	mkdirSync(join(h.cwd, ".pi"), { recursive: true });
	writeFileSync(
		join(h.cwd, ".pi", "checkpoint.json"),
		JSON.stringify({ version: 1, enabled: true }),
	);

	await h.cmd("checkpoint-status");
	assert.match(h.messages.at(-1)!, /Configured: yes[\s\S]*Enabled: yes/);

	await h.fire("session_shutdown");
	assert.equal(h.pending(), 1, "legacy-configured project captures via the core");
});
