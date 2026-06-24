// Installer tests — run entirely against a temporary $HOME; the real ~/.pi, ~/.codex, ~/.claude are
// never touched. Uses --no-build (build:false) against the repo's existing dist/.
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { REPO_ROOT, run } from "../../scripts/install.mjs";

// In-memory stand-in for the `claude plugin` CLI so tests never touch the real Claude install.
function makeClaudeStub() {
	const state = { mkt: false, plugin: false, calls: [] };
	const cli = (args) => {
		state.calls.push(args.join(" "));
		const [a, b] = args;
		if (a === "marketplace" && b === "list") return ok(state.mkt ? "checkpoint-local" : "");
		if (a === "list") return ok(state.plugin ? "checkpoint@checkpoint-local" : "");
		if (a === "marketplace" && b === "add") return ((state.mkt = true), ok("added"));
		if (a === "install") return ((state.plugin = true), ok("installed"));
		if (a === "uninstall") return ((state.plugin = false), ok(""));
		if (a === "marketplace" && b === "remove") return ((state.mkt = false), ok(""));
		return ok("");
	};
	cli.state = state;
	return cli;
}
function ok(stdout) {
	return { ok: true, missing: false, stdout, stderr: "" };
}

let tmp;
let claudeStub;
beforeEach(() => {
	tmp = mkdtempSync(join(tmpdir(), "ckpt-install-"));
	claudeStub = makeClaudeStub();
});
afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
});

function opts(extra) {
	return {
		verb: "install",
		agents: ["pi", "claude", "codex"],
		mode: "symlink",
		dryRun: false,
		force: false,
		build: false,
		targetRoots: {},
		home: join(tmp, "home"),
		installDir: join(tmp, "state"),
		claudeCli: claudeStub,
		...extra,
	};
}

const piTarget = () => join(tmp, "home", ".pi", "agent", "extensions", "checkpoint");
const codexPrompt = (n) => join(tmp, "home", ".codex", "prompts", n);

test("symlink install: pi dir + codex prompts link into the repo; re-run is a no-op", async () => {
	const first = await run(opts());
	assert.equal(first.exitCode, 0);

	// pi: a symlink resolving into the repo's adapters/pi
	const st = lstatSync(piTarget());
	assert.ok(st.isSymbolicLink());
	assert.equal(realpathSync(piTarget()), join(REPO_ROOT, "adapters", "pi"));

	// codex: all four prompt files linked
	const names = readdirSync(join(REPO_ROOT, "adapters", "codex", "prompts"));
	for (const n of names) assert.ok(existsSync(codexPrompt(n)), `${n} linked`);

	// manifest written
	const manifest = JSON.parse(readFileSync(join(tmp, "state", "manifest.json"), "utf8"));
	assert.ok(manifest.entries.some((e) => e.agent === "pi" && e.target === piTarget()));

	// re-run → everything no-op
	const second = await run(opts());
	assert.equal(second.exitCode, 0);
	assert.ok(second.actions.every((a) => a.action === "no-op"), JSON.stringify(second.actions));
});

test("SC-004 isolation: installing only --agent codex leaves pi and claude roots untouched", async () => {
	const res = await run(opts({ agents: ["codex"] }));
	assert.equal(res.exitCode, 0);
	assert.ok(!existsSync(piTarget()), "pi target not created");
	assert.ok(!existsSync(join(tmp, "home", ".claude")), "claude root not created");
	assert.ok(existsSync(codexPrompt("checkpoint.md")), "codex installed");
});

test("uninstall restores targets, empties manifest, preserves unrelated content; second uninstall no-op", async () => {
	// seed an unrelated pi extension that must survive
	const piDir = join(tmp, "home", ".pi", "agent", "extensions");
	mkdirSync(piDir, { recursive: true });
	writeFileSync(join(piDir, "other.ts"), "// not ours\n");

	await run(opts());
	assert.ok(existsSync(piTarget()));

	const un = await run(opts({ verb: "uninstall" }));
	assert.equal(un.exitCode, 0);
	assert.ok(!existsSync(piTarget()), "pi link removed");
	assert.ok(!existsSync(codexPrompt("checkpoint.md")), "codex prompt removed");
	assert.ok(existsSync(join(piDir, "other.ts")), "unrelated extension preserved");

	const manifest = JSON.parse(readFileSync(join(tmp, "state", "manifest.json"), "utf8"));
	assert.equal(manifest.entries.length, 0, "manifest emptied");

	const again = await run(opts({ verb: "uninstall" }));
	assert.equal(again.exitCode, 0);
	assert.ok(again.actions.every((a) => a.action === "no-op"));
});

test("dry-run changes nothing on disk but reports planned actions", async () => {
	const res = await run(opts({ dryRun: true }));
	assert.ok(res.actions.some((a) => a.action === "installed"));
	assert.ok(!existsSync(piTarget()), "no fs change in dry-run");
	assert.ok(!existsSync(join(tmp, "state", "manifest.json")), "no manifest written in dry-run");
});

test("conflict-stop: pre-existing user content at a target is left intact; --force replaces it", async () => {
	const piDir = join(tmp, "home", ".pi", "agent", "extensions");
	mkdirSync(piDir, { recursive: true });
	writeFileSync(piTarget(), "// a user file where our link would go\n");

	const conflict = await run(opts({ agents: ["pi"] }));
	assert.equal(conflict.exitCode, 1);
	assert.ok(conflict.actions.some((a) => a.action === "conflict"));
	assert.ok(lstatSync(piTarget()).isFile(), "user content untouched");

	const forced = await run(opts({ agents: ["pi"], force: true }));
	assert.equal(forced.exitCode, 0);
	assert.ok(lstatSync(piTarget()).isSymbolicLink(), "replaced with our link under --force");
});

test("legacy pi checkpoint.ts is treated as user content (conflict) and removed with --force", async () => {
	const piDir = join(tmp, "home", ".pi", "agent", "extensions");
	mkdirSync(piDir, { recursive: true });
	const legacy = join(piDir, "checkpoint.ts");
	writeFileSync(legacy, "// legacy reference extension\n");

	const conflict = await run(opts({ agents: ["pi"] }));
	assert.equal(conflict.exitCode, 1);
	assert.ok(conflict.actions.some((a) => a.target === legacy && a.action === "conflict"));
	assert.ok(existsSync(legacy), "legacy left intact without --force");

	const forced = await run(opts({ agents: ["pi"], force: true }));
	assert.equal(forced.exitCode, 0);
	assert.ok(!existsSync(legacy), "legacy removed under --force");
});

test("claude: drives the plugin CLI (marketplace add + install), idempotent, uninstall reverses", async () => {
	const inst = await run(opts({ agents: ["claude"] }));
	assert.equal(inst.exitCode, 0);
	const called = (prefix) => claudeStub.state.calls.some((c) => c.startsWith(prefix));
	assert.ok(called("marketplace add"), claudeStub.state.calls.join(" | "));
	assert.ok(called("install checkpoint@checkpoint-local"));
	assert.ok(claudeStub.state.mkt && claudeStub.state.plugin, "marketplace + plugin registered");

	// re-run → no-op (no second add/install)
	const again = await run(opts({ agents: ["claude"] }));
	assert.ok(again.actions.every((a) => a.action === "no-op"), JSON.stringify(again.actions));

	// uninstall reverses both
	const un = await run(opts({ agents: ["claude"], verb: "uninstall" }));
	assert.equal(un.exitCode, 0);
	assert.ok(called("uninstall checkpoint@checkpoint-local"));
	assert.ok(called("marketplace remove checkpoint-local"));
	assert.ok(!claudeStub.state.mkt && !claudeStub.state.plugin, "fully removed");
});

test("claude: missing `claude` CLI is reported as failed, not a crash", async () => {
	const missingCli = () => ({ ok: false, missing: true, stdout: "", stderr: "`claude` CLI not found on PATH" });
	const res = await run(opts({ agents: ["claude"], claudeCli: missingCli }));
	assert.equal(res.exitCode, 1);
	assert.ok(res.actions.some((a) => a.action === "failed" && /claude/.test(a.detail)));
});

test("copy mode places real files (not links), re-syncs, and converges from symlink", async () => {
	// codex prompts in copy mode (small files; avoids copying pi's node_modules)
	const copy = await run(opts({ agents: ["codex"], mode: "copy" }));
	assert.equal(copy.exitCode, 0);
	assert.ok(lstatSync(codexPrompt("checkpoint.md")).isFile());
	assert.ok(!lstatSync(codexPrompt("checkpoint.md")).isSymbolicLink(), "real copy, not a link");

	// re-run copy → idempotent no-op (content identical)
	const again = await run(opts({ agents: ["codex"], mode: "copy" }));
	assert.ok(again.actions.filter((a) => a.mode === "copy").every((a) => a.action === "no-op"));

	// now install symlink → converges (copy replaced by link)
	const toLink = await run(opts({ agents: ["codex"], mode: "symlink" }));
	assert.equal(toLink.exitCode, 0);
	assert.ok(lstatSync(codexPrompt("checkpoint.md")).isSymbolicLink(), "converged to symlink");

	// uninstall removes copies/links via manifest
	const un = await run(opts({ agents: ["codex"], verb: "uninstall" }));
	assert.equal(un.exitCode, 0);
	assert.ok(!existsSync(codexPrompt("checkpoint.md")));
});
