/**
 * Contract & neutrality guard (contracts/commands.md C1-C4, spec FR-008/FR-010). Asserts the
 * prompt surface and bridge dispatch, drives the bridge runners against temp repos, and asserts the
 * adapter contains no checkpoint logic. Mirrors the claude-code adapter's neutrality test.
 */

import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runDisable, runManual, runNotify, runOptIn, runStatus } from "../src/bridge.ts";

const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const tempRepo = (): string => mkdtempSync(join(tmpdir(), "ckpt-codex-"));
const pendingCount = (cwd: string): number => {
	const dir = join(cwd, "sessions", "pending");
	return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).length : 0;
};
const turnPayload = (cwd: string, user = "do the thing"): string =>
	JSON.stringify({
		type: "agent-turn-complete",
		cwd,
		"input-messages": [user],
		"last-assistant-message": "done",
	});

test("C1: exactly the four canonical command prompts exist", () => {
	const prompts = readdirSync(new URL("../prompts", import.meta.url))
		.filter((f) => f.endsWith(".md"))
		.sort();
	assert.deepEqual(prompts, [
		"checkpoint-disable.md",
		"checkpoint-optin.md",
		"checkpoint-status.md",
		"checkpoint.md",
	]);
});

test("C2: the bridge dispatches exactly the six subcommands with the documented reason mapping", () => {
	const index = read("src/index.ts");
	for (const sub of ["notify", "manual", "optin", "disable", "status", "archive"]) {
		assert.match(index, new RegExp(`case "${sub}"`), `dispatch missing ${sub}`);
	}
	// reason mapping: notify -> turn-complete, manual -> manual.
	assert.match(read("src/bridge.ts"), /capture\(cwd, "turn-complete",/);
	assert.match(read("src/bridge.ts"), /capture\(cwd, "manual",/);
	// notify is the only lifecycle-class subcommand (always exit 0).
	assert.match(index, /LIFECYCLE[^=]*=\s*new Set\(\["notify"\]\)/);
});

/** Strip comments so the neutrality scan inspects code, not prose. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("C3/C4 FR-008/FR-010: the adapter contains no checkpoint logic and no out-of-scope surfaces", () => {
	const sources = readdirSync(new URL("../src", import.meta.url))
		.filter((f) => f.endsWith(".ts"))
		.map((f) => stripComments(read(`src/${f}`)));
	const all = sources.join("\n");

	assert.doesNotMatch(all, /child_process/, "adapter must not run git itself (core does)");
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

	assert.match(all, /from "@checkpoint\/core"/);

	const pkg = JSON.parse(read("package.json"));
	assert.equal(pkg.bin, undefined, "adapter must not install a global PATH binary");
	assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["@checkpoint/core"]);
});

test("US1: notify on agent-turn-complete writes a 'turn-complete' checkpoint; dedup suppresses the next", async () => {
	const cwd = tempRepo();
	await runOptIn(cwd);

	const out = await runNotify(turnPayload(cwd));
	assert.match(out, /Checkpoint written:/);
	assert.equal(pendingCount(cwd), 1);
	const file = readdirSync(join(cwd, "sessions", "pending")).find((f) => f.endsWith(".md"))!;
	assert.match(
		readFileSync(join(cwd, "sessions", "pending", file), "utf8"),
		/Reason: turn-complete/,
	);

	await runNotify(turnPayload(cwd, "again"));
	assert.equal(pendingCount(cwd), 1, "dedup window suppresses the immediate second capture");
});

test("US1: notify on a non-agent-turn-complete / empty payload writes nothing", async () => {
	const cwd = tempRepo();
	await runOptIn(cwd);
	await runNotify(JSON.stringify({ type: "other", cwd }));
	assert.equal(pendingCount(cwd), 0);
	await runNotify(JSON.stringify({ type: "agent-turn-complete", cwd, "input-messages": [] }));
	assert.equal(pendingCount(cwd), 0, "no user message -> skip-empty");
});

test("US1: notify on a not-opted-in project is a safe no-op, and malformed input never throws", async () => {
	const cwd = tempRepo();
	await runNotify(turnPayload(cwd)); // not opted in
	assert.equal(pendingCount(cwd), 0);
	const out = await runNotify("{ not json");
	assert.equal(typeof out, "string");
});

test("US2: optin -> status -> disable -> status cycle delegates to the core", async () => {
	const cwd = tempRepo();

	const optin = await runOptIn(cwd);
	assert.match(optin, /Checkpointing enabled/);
	assert.ok(existsSync(join(cwd, ".checkpoint.json")));
	assert.ok(existsSync(join(cwd, "sessions", "archive")));

	assert.match(await runStatus(cwd), /Configured: yes[\s\S]*Enabled: yes/);
	assert.match(await runDisable(cwd), /disabled/i);
	assert.match(await runStatus(cwd), /Enabled: no/);
});

test("US2: manual on a not-configured project guides the user to opt in", async () => {
	const cwd = tempRepo();
	const out = await runManual(cwd);
	assert.match(out, /Run \/checkpoint-optin/);
	assert.equal(pendingCount(cwd), 0);
});

test("US2: manual reads the newest Codex rollout (best-effort) and captures via the core", async () => {
	const cwd = tempRepo();
	await runOptIn(cwd);

	// Point HOME at a temp dir holding a fake rollout so newestRolloutFile() finds it.
	const fakeHome = mkdtempSync(join(tmpdir(), "ckpt-codex-home-"));
	const rolloutDir = join(fakeHome, ".codex", "sessions", "2026", "06", "24");
	mkdirSync(rolloutDir, { recursive: true });
	writeFileSync(
		join(rolloutDir, "rollout-2026-06-24T00-00-00-abc.jsonl"),
		JSON.stringify({ role: "user", content: "build the feature" }) + "\n",
	);

	const prevHome = process.env.HOME;
	process.env.HOME = fakeHome;
	try {
		const out = await runManual(cwd);
		assert.match(out, /Checkpoint written:/);
		assert.equal(pendingCount(cwd), 1);
		const file = readdirSync(join(cwd, "sessions", "pending")).find((f) => f.endsWith(".md"))!;
		assert.match(readFileSync(join(cwd, "sessions", "pending", file), "utf8"), /Reason: manual/);
	} finally {
		if (prevHome === undefined) delete process.env.HOME;
		else process.env.HOME = prevHome;
	}
});
