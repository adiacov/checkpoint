import assert from "node:assert/strict";
import { test } from "node:test";
import { gitFacts, resolveRoot } from "../src/git.ts";
import type { CommandRunner } from "../src/types.ts";

/** Build a fake runner that maps a git subcommand to a canned result. */
function fakeRunner(
	responses: Record<string, { code?: number; stdout?: string; stderr?: string }>,
): CommandRunner {
	return async (_command, args) => {
		const key = args.join(" ");
		const r = responses[key] ?? { code: 1, stdout: "", stderr: "not found" };
		return { code: r.code ?? 0, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
	};
}

test("resolveRoot returns git toplevel when available", async () => {
	const runner = fakeRunner({ "rev-parse --show-toplevel": { stdout: "/repo/root\n" } });
	assert.equal(await resolveRoot(runner, "/repo/root/sub"), "/repo/root");
});

test("resolveRoot falls back to cwd in a non-repo", async () => {
	const runner = fakeRunner({
		"rev-parse --show-toplevel": { code: 128, stderr: "not a git repo" },
	});
	assert.equal(await resolveRoot(runner, "/plain/dir"), "/plain/dir");
});

test("gitFacts returns collected facts on success", async () => {
	const runner = fakeRunner({
		"branch --show-current": { stdout: "main\n" },
		"status --short": { stdout: " M file.ts\n" },
		"diff --stat": { stdout: " file.ts | 2 +-\n" },
		"log --oneline -5": { stdout: "abc123 init\n" },
	});
	const facts = await gitFacts(runner, "/repo");
	assert.deepEqual(facts, {
		branch: "main",
		status: "M file.ts",
		diffStat: "file.ts | 2 +-",
		recentCommits: "abc123 init",
	});
});

test("gitFacts degrades each field to a fallback in a non-repo / on error", async () => {
	const runner: CommandRunner = async () => ({ code: 128, stdout: "", stderr: "" });
	const facts = await gitFacts(runner, "/plain");
	assert.equal(facts.branch, "unknown");
	assert.equal(facts.status, "git status unavailable");
	assert.equal(facts.diffStat, "none");
	assert.equal(facts.recentCommits, "none");
});

test("gitFacts maps empty successful status to clean", async () => {
	const runner = fakeRunner({
		"branch --show-current": { stdout: "main" },
		"status --short": { stdout: "" },
		"diff --stat": { stdout: "" },
		"log --oneline -5": { stdout: "abc init" },
	});
	const facts = await gitFacts(runner, "/repo");
	assert.equal(facts.status, "clean");
	assert.equal(facts.diffStat, "none");
});
