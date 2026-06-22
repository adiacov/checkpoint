import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { capture } from "../src/api.ts";
import { countCheckpointFiles } from "../src/store.ts";
import type { CommandRunner, ConversationEntry, CoreDeps } from "../src/types.ts";

function tmp(): string {
	return mkdtempSync(path.join(tmpdir(), "ckpt-api-"));
}

function writeConfig(root: string, partial: Record<string, unknown> = {}): void {
	writeFileSync(
		path.join(root, ".checkpoint.json"),
		JSON.stringify({ version: 1, enabled: true, ...partial }),
	);
}

/** Fake git runner: reports `root` as the toplevel, empty output otherwise (repo present). */
function repoRunner(root: string): CommandRunner {
	return async (_command, args) => {
		if (args[0] === "rev-parse") return { code: 0, stdout: `${root}\n`, stderr: "" };
		return { code: 0, stdout: "", stderr: "" };
	};
}

const userEntries: ConversationEntry[] = [
	{ role: "user", content: "hello" },
	{ role: "assistant", content: "hi" },
];

function depsFor(root: string, extra: Partial<CoreDeps> = {}): CoreDeps {
	return { runGit: repoRunner(root), entries: userEntries, ...extra };
}

const pendingDir = (root: string) => path.join(root, "sessions", "pending");

test("capture writes a well-formed checkpoint for an opted-in project", async () => {
	const root = tmp();
	writeConfig(root);
	const result = await capture(root, "manual", depsFor(root));
	assert.equal(result.written, true);
	assert.ok(result.filePath);
	const body = readFileSync(result.filePath!, "utf8");
	assert.match(body, /# Pending Session Checkpoint/);
	assert.match(body, /Reason: manual/);
	assert.match(body, /## Git facts/);
	assert.match(body, /### user — /);
	assert.equal(countCheckpointFiles(pendingDir(root)), 1);
});

test("capture skips when project is not configured", async () => {
	const root = tmp();
	const result = await capture(root, "manual", depsFor(root));
	assert.deepEqual(result, { written: false, skippedReason: "not-configured" });
});

test("capture skips when disabled", async () => {
	const root = tmp();
	writeConfig(root, { enabled: false });
	const result = await capture(root, "shutdown", depsFor(root));
	assert.equal(result.skippedReason, "disabled");
	assert.equal(countCheckpointFiles(pendingDir(root)), 0);
});

test("capture skips an empty session when skip-empty is on", async () => {
	const root = tmp();
	writeConfig(root);
	const result = await capture(root, "shutdown", {
		runGit: repoRunner(root),
		entries: [{ role: "assistant", content: "only assistant" }],
	});
	assert.equal(result.skippedReason, "empty-session");
});

test("capture writes an empty-body checkpoint when skip-empty is off", async () => {
	const root = tmp();
	writeConfig(root, { skipEmptySessions: false });
	const result = await capture(root, "shutdown", {
		runGit: repoRunner(root),
		entries: [],
	});
	assert.equal(result.written, true);
});

test("capture skips reload unless include-reload is set", async () => {
	const root = tmp();
	writeConfig(root);
	const skipped = await capture(root, "reload", depsFor(root));
	assert.equal(skipped.skippedReason, "reload");

	const root2 = tmp();
	writeConfig(root2, { includeReload: true });
	const written = await capture(root2, "reload", depsFor(root2));
	assert.equal(written.written, true);
});

test("capture dedups a second capture within the window (stateless mtime)", async () => {
	const root = tmp();
	writeConfig(root, { dedupWindowSeconds: 60 });
	const first = await capture(root, "shutdown", depsFor(root));
	assert.equal(first.written, true);
	const second = await capture(root, "shutdown", depsFor(root));
	assert.equal(second.skippedReason, "duplicate");
	assert.equal(countCheckpointFiles(pendingDir(root)), 1);
});

test("capture in a non-git directory still writes with degraded git facts", async () => {
	const root = tmp();
	writeConfig(root);
	const nonRepoRunner: CommandRunner = async () => ({ code: 128, stdout: "", stderr: "" });
	const result = await capture(root, "manual", {
		runGit: nonRepoRunner,
		entries: userEntries,
	});
	assert.equal(result.written, true);
	const body = readFileSync(result.filePath!, "utf8");
	assert.match(body, /Branch: unknown/);
});

test("capture surfaces an IO failure via error instead of dropping silently", async () => {
	const root = tmp();
	// Block creation of sessions/pending by occupying `sessions` with a file.
	writeFileSync(path.join(root, "sessions"), "not a dir");
	writeConfig(root);
	const result = await capture(root, "manual", depsFor(root));
	assert.equal(result.written, false);
	assert.ok(result.error, "expected an error message");
});
