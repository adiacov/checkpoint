/**
 * Contract & neutrality guard (contracts/commands.md C1–C3, spec FR-011). Asserts the declarative
 * surface (four commands, three hooks, correct reason mapping) and that the adapter contains no
 * checkpoint logic and no out-of-scope surfaces. Mirrors the core's no-SDK guard test.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

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

	// No git access, no writing checkpoint markdown, no config/dir bookkeeping — all live in the core.
	assert.doesNotMatch(all, /child_process/, "adapter must not run git itself");
	assert.doesNotMatch(all, /writeFileSync|writeFile\(/, "adapter must not write checkpoint files");
	assert.doesNotMatch(all, /\.checkpoint\.json/, "adapter must not touch the config file directly");
	assert.doesNotMatch(all, /sessions\/(pending|archive)/, "adapter must not manage session dirs");
	assert.doesNotMatch(
		all,
		/prune|dedup|skipEmpty|summari[sz]e/i,
		"checkpoint logic belongs in the core",
	);

	// FR-011 negative surfaces: no PATH binary, no recovery/curation.
	const pkg = JSON.parse(read("package.json"));
	assert.equal(pkg.bin, undefined, "adapter must not install a global PATH binary");
	assert.doesNotMatch(
		all,
		/archive\(|moveToArchive|promoteToMemory/i,
		"recovery/curation is out of scope",
	);
});

test("the adapter depends on @checkpoint/core and nothing agent-specific", () => {
	const pkg = JSON.parse(read("package.json"));
	assert.deepEqual(Object.keys(pkg.dependencies ?? {}), ["@checkpoint/core"]);
});
