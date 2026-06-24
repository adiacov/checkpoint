/**
 * Contract & neutrality guard (contracts/commands.md C1-C4, spec FR-009/FR-011). Asserts the
 * registered surface (four commands, two lifecycle handlers, reason passthrough), drives the
 * handlers against a temp repo through a stub ExtensionAPI, and asserts the adapter contains no
 * checkpoint logic. Mirrors the claude-code adapter's neutrality test.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import checkpointExtension from "../src/index.ts";
import type { CommandContext, ExtensionAPI, PiEntry } from "../src/pi-types.ts";

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

const userMsg: PiEntry[] = [
	{ type: "message", message: { role: "user", content: "do the thing" } },
];
const assistantOnly: PiEntry[] = [
	{ type: "message", message: { role: "assistant", content: "hello" } },
];

interface Harness {
	cwd: string;
	ctx: CommandContext;
	commands: Map<string, { handler: (a: string[], c: CommandContext) => unknown }>;
	events: Map<string, (e: { reason?: string }, c: CommandContext) => unknown>;
	messages: Array<{ message: string; level: string }>;
	setEntries: (entries: PiEntry[]) => void;
	runCommand: (name: string) => Promise<unknown>;
	fireEvent: (name: "session_start" | "session_shutdown", reason?: string) => Promise<unknown>;
	pendingCount: () => number;
}

/** Build a temp repo + stub pi/ctx and register the extension against it. */
function setup(entries: PiEntry[] = []): Harness {
	const cwd = mkdtempSync(join(tmpdir(), "ckpt-pi-"));
	const messages: Array<{ message: string; level: string }> = [];
	let current = entries;
	const ctx: CommandContext = {
		cwd,
		hasUI: true,
		ui: { notify: (message, level = "info") => messages.push({ message, level }) },
		sessionManager: { getBranch: () => current, getSessionFile: () => undefined },
	};
	const commands = new Map<string, { handler: (a: string[], c: CommandContext) => unknown }>();
	const events = new Map<string, (e: { reason?: string }, c: CommandContext) => unknown>();
	const pi = {
		registerCommand: (
			name: string,
			spec: { handler: (a: string[], c: CommandContext) => unknown },
		) => commands.set(name, spec),
		on: (event: string, handler: (e: { reason?: string }, c: CommandContext) => unknown) =>
			events.set(event, handler),
		// Stub pi.exec: run git in the temp repo (non-repo -> core falls back to cwd, facts degrade).
		exec: async (command: string, args: string[]) => {
			const r = spawnSync(command, args, { cwd, encoding: "utf8" });
			return { code: r.status ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
		},
	} as unknown as ExtensionAPI;
	checkpointExtension(pi);
	return {
		cwd,
		ctx,
		commands,
		events,
		messages,
		setEntries: (e) => {
			current = e;
		},
		runCommand: (name) => Promise.resolve(commands.get(name)?.handler([], ctx)),
		fireEvent: (name, reason) => Promise.resolve(events.get(name)?.({ reason }, ctx)),
		pendingCount: () => {
			const dir = join(cwd, "sessions", "pending");
			return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).length : 0;
		},
	};
}

test("C1: exactly the four canonical commands are registered", () => {
	const { commands } = setup();
	assert.deepEqual([...commands.keys()].sort(), [
		"checkpoint",
		"checkpoint-disable",
		"checkpoint-optin",
		"checkpoint-status",
	]);
});

test("C2: exactly the two lifecycle handlers are registered", () => {
	const { events } = setup();
	assert.deepEqual([...events.keys()].sort(), ["session_shutdown", "session_start"]);
});

test("C2 source: shutdown forwards event.reason (default 'shutdown'); manual uses 'manual'", () => {
	const index = read("src/index.ts");
	assert.match(index, /capture\(ctx\.cwd, event\.reason \?\? "shutdown",/);
	assert.match(index, /capture\(ctx\.cwd, "manual",/);
});

/** Strip comments so the neutrality scan inspects code, not the prose that names the logic. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("C3/C4 FR-009/FR-011: the adapter contains no checkpoint logic and no out-of-scope surfaces", () => {
	const sources = readdirSync(new URL("../src", import.meta.url))
		.filter((f) => f.endsWith(".ts"))
		.map((f) => stripComments(read(`src/${f}`)));
	const all = sources.join("\n");

	assert.doesNotMatch(all, /child_process/, "adapter must not run git itself (uses pi.exec)");
	assert.doesNotMatch(all, /writeFileSync|writeFile\(/, "adapter must not write checkpoint files");
	assert.doesNotMatch(
		all,
		/renameSync|copyFileSync|unlinkSync/,
		"adapter must not move/delete checkpoint files itself",
	);
	assert.doesNotMatch(all, /\.checkpoint\.json/, "adapter must not touch the config file directly");
	assert.doesNotMatch(all, /sessions\/(pending|archive)/, "adapter must not manage session dirs");
	assert.doesNotMatch(
		all,
		/pruneArchive|maxArchivedCheckpoints|dedup|skipEmpty|summari[sz]e|promoteToMemory/i,
		"checkpoint/curation logic belongs in the core",
	);

	// The adapter's checkpoint behavior is sourced from the core only.
	assert.match(all, /from "@checkpoint\/core"/);

	// FR-011 negative surfaces: no PATH binary, single runtime dependency.
	const pkg = JSON.parse(read("package.json"));
	assert.equal(pkg.bin, undefined, "adapter must not install a global PATH binary");
	assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["@checkpoint/core"]);
});

test("US2: optin -> status -> manual -> disable -> status cycle delegates to the core", async () => {
	const h = setup(userMsg);

	await h.runCommand("checkpoint-optin");
	assert.ok(existsSync(join(h.cwd, ".checkpoint.json")), "config written by core");
	assert.ok(existsSync(join(h.cwd, "sessions", "pending")), "pending dir created");
	assert.ok(existsSync(join(h.cwd, "sessions", "archive")), "archive dir created");
	assert.match(h.messages.at(-1)!.message, /Checkpointing enabled/);

	await h.runCommand("checkpoint-status");
	assert.match(h.messages.at(-1)!.message, /Configured: yes[\s\S]*Enabled: yes/);

	await h.runCommand("checkpoint");
	assert.equal(h.pendingCount(), 1, "manual checkpoint written");
	assert.match(h.messages.at(-1)!.message, /Checkpoint written:/);
	const file = readdirSync(join(h.cwd, "sessions", "pending")).find((f) => f.endsWith(".md"))!;
	assert.match(readFileSync(join(h.cwd, "sessions", "pending", file), "utf8"), /Reason: manual/);

	await h.runCommand("checkpoint-disable");
	assert.match(h.messages.at(-1)!.message, /disabled/i);
	await h.runCommand("checkpoint-status");
	assert.match(h.messages.at(-1)!.message, /Enabled: no/);
});

test("US2: manual checkpoint on a non-configured project guides the user to opt in", async () => {
	const h = setup(userMsg);
	await h.runCommand("checkpoint");
	assert.equal(h.pendingCount(), 0);
	assert.match(h.messages.at(-1)!.message, /Run \/checkpoint-optin first/);
	assert.equal(h.messages.at(-1)!.level, "error");
});

test("US1: session_shutdown writes a 'shutdown' checkpoint; a second within the window is deduped", async () => {
	const h = setup(userMsg);
	await h.runCommand("checkpoint-optin");

	await h.fireEvent("session_shutdown");
	assert.equal(h.pendingCount(), 1);
	const file = readdirSync(join(h.cwd, "sessions", "pending")).find((f) => f.endsWith(".md"))!;
	assert.match(readFileSync(join(h.cwd, "sessions", "pending", file), "utf8"), /Reason: shutdown/);

	await h.fireEvent("session_shutdown");
	assert.equal(h.pendingCount(), 1, "dedup window suppresses the immediate second capture");
});

test("US1: session_shutdown on an empty session writes nothing (core skip-empty)", async () => {
	const h = setup(assistantOnly);
	await h.runCommand("checkpoint-optin");
	await h.fireEvent("session_shutdown");
	assert.equal(h.pendingCount(), 0, "no real user message -> skip-empty");
});

test("US1: reload shutdown is gated by the core (includeReload defaults off -> no file)", async () => {
	const h = setup(userMsg);
	await h.runCommand("checkpoint-optin");
	await h.fireEvent("session_shutdown", "reload");
	assert.equal(h.pendingCount(), 0, "reload-gated capture suppressed by the core");
});

test("US3: session_start notifies the pending count and is silent when not configured", async () => {
	// Not configured -> no notice.
	const fresh = setup();
	await fresh.fireEvent("session_start");
	assert.equal(fresh.messages.length, 0, "no notice when not configured");

	// Configured with a pending file -> notice.
	const h = setup();
	await h.runCommand("checkpoint-optin");
	h.messages.length = 0;
	writeFileSync(join(h.cwd, "sessions", "pending", "2026-06-24-manual.md"), "raw body");
	await h.fireEvent("session_start");
	assert.match(h.messages.at(-1)!.message, /1 pending checkpoint\(s\) need review/);
});
