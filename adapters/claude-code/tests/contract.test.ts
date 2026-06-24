/**
 * Contract & neutrality guard (contracts/commands.md C1–C3, spec FR-011). Asserts the declarative
 * surface (four commands, three hooks, correct reason mapping) and that the adapter contains no
 * checkpoint logic and no out-of-scope surfaces. Mirrors the core's no-SDK guard test.
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
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runArchive } from "../src/bridge.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("C1: exactly the four canonical slash commands are declared", () => {
	const commands = readdirSync(new URL("../commands", import.meta.url))
		.filter((f) => f.endsWith(".md"))
		.sort();
	assert.deepEqual(commands, [
		"checkpoint-disable.md",
		"checkpoint-optin.md",
		"checkpoint-status.md",
		"checkpoint.md",
	]);
});

test("C2: exactly the three lifecycle hooks are wired to their subcommands", () => {
	const hooks = JSON.parse(read("hooks/hooks.json")).hooks as Record<string, unknown>;
	assert.deepEqual(Object.keys(hooks).sort(), ["PreCompact", "SessionEnd", "SessionStart"]);
	const sub = (event: string): string =>
		(hooks[event] as Array<{ hooks: Array<{ args: string[] }> }>)[0]!.hooks[0]!.args[1] as string;
	assert.equal(sub("SessionStart"), "session-start");
	assert.equal(sub("SessionEnd"), "session-end");
	assert.equal(sub("PreCompact"), "pre-compact");
});

test("C2: reason mapping matches the reference (session-end->shutdown, pre-compact->reload, manual)", () => {
	const index = read("src/index.ts");
	assert.match(index, /runLifecycleCapture\("shutdown", await readStdin\(\)\)/);
	assert.match(index, /runLifecycleCapture\("reload", await readStdin\(\)\)/);
	assert.match(read("src/bridge.ts"), /capture\(cwd, "manual",/);
});

/** Strip line and block comments so the neutrality scan inspects code, not prose. */
function stripComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

test("C3/FR-011: the adapter contains no checkpoint logic and no out-of-scope surfaces", () => {
	const sources = readdirSync(new URL("../src", import.meta.url))
		.filter((f) => f.endsWith(".ts"))
		.map((f) => stripComments(read(`src/${f}`)));
	const all = sources.join("\n");

	// No git access, no writing/moving checkpoint files, no config/dir bookkeeping — all live in the
	// core. (003: the adapter may *call* the core's archive(), but must not implement the move/prune
	// or any curation itself.)
	assert.doesNotMatch(all, /child_process/, "adapter must not run git itself");
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

	// FR-011 negative surfaces: no PATH binary installed.
	const pkg = JSON.parse(read("package.json"));
	assert.equal(pkg.bin, undefined, "adapter must not install a global PATH binary");
});

test("003: the archive subcommand delegates to the core archive() with no duplicated logic", () => {
	const bridge = read("src/bridge.ts");
	// archive is imported from the core and called as a thin delegate.
	assert.match(bridge, /\barchive\b[^;]*from "@checkpoint\/core"/s);
	assert.match(bridge, /await archive\(cwd,/);
	// Reached as a CLI subcommand, NOT a fifth slash command (commands dir is unchanged — see C1).
	assert.match(read("src/index.ts"), /case "archive"/);
});

test("003 smoke: runArchive moves a pending checkpoint via the core", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "ckpt-adapter-archive-"));
	writeFileSync(path.join(cwd, ".checkpoint.json"), JSON.stringify({ version: 1, enabled: true }));
	const pending = path.join(cwd, "sessions", "pending");
	const archiveDir = path.join(cwd, "sessions", "archive");
	writeFileSync(path.join(mkdirp(pending), "2026-06-24-manual.md"), "raw body");

	const out = await runArchive(cwd, ["2026-06-24-manual.md"]);
	assert.match(out, /Archived 1 checkpoint/);
	assert.ok(!existsSync(path.join(pending, "2026-06-24-manual.md")), "left pending");
	assert.ok(existsSync(path.join(archiveDir, "2026-06-24-manual.md")), "now in archive");
});

test("003 smoke: runArchive on an unconfigured project reports not-configured", async () => {
	const cwd = mkdtempSync(path.join(tmpdir(), "ckpt-adapter-archive-"));
	const out = await runArchive(cwd, []);
	assert.match(out, /not configured/i);
});

/** mkdir -p helper returning the dir, for the smoke test setup. */
function mkdirp(dir: string): string {
	mkdirSync(dir, { recursive: true });
	return dir;
}

test("the adapter depends on @checkpoint/core and nothing agent-specific", () => {
	const pkg = JSON.parse(read("package.json"));
	assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["@checkpoint/core"]);
});
