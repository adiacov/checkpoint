import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { capture, disable, optIn, sessionStart, status } from "../src/api.ts";
import { loadConfig } from "../src/config.ts";
import { countCheckpointFiles, writeCheckpointFile } from "../src/store.ts";
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

// --- US2: opt-in / disable ---

test("optIn creates config, dirs, .gitkeep, and ignore rules with defaults", async () => {
	const root = tmp();
	const result = await optIn(root, { runGit: repoRunner(root) });

	const config = loadConfig(root);
	assert.equal(config?.enabled, true);
	assert.equal(config?.recentEntries, 24);
	assert.equal(config?.maxArchivedCheckpoints, 50);

	assert.ok(existsSync(path.join(root, "sessions", "pending", ".gitkeep")));
	assert.ok(existsSync(path.join(root, "sessions", "archive", ".gitkeep")));

	const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
	assert.match(gitignore, /sessions\/pending\/\*\.md/);
	assert.match(gitignore, /sessions\/archive\/\*\.md/);
	assert.deepEqual(result.addedIgnoreRules, ["sessions/pending/*.md", "sessions/archive/*.md"]);
});

test("optIn is idempotent: no duplicate ignore rules, createdAt preserved", async () => {
	const root = tmp();
	const first = await optIn(root, { runGit: repoRunner(root) });
	const createdAt = loadConfig(root)?.createdAt;

	const second = await optIn(root, { runGit: repoRunner(root) });
	assert.deepEqual(second.addedIgnoreRules, []);
	assert.equal(loadConfig(root)?.createdAt, createdAt);

	const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
	const occurrences = gitignore.match(/sessions\/pending\/\*\.md/g) ?? [];
	assert.equal(occurrences.length, 1);
	assert.ok(first.configPath.endsWith(".checkpoint.json"));
});

test("disable flips enabled only, leaving dirs and checkpoints intact", async () => {
	const root = tmp();
	await optIn(root, { runGit: repoRunner(root) });
	const written = await capture(root, "manual", depsFor(root));
	assert.equal(written.written, true);

	const result = await disable(root, { runGit: repoRunner(root) });
	assert.equal(result.disabled, true);
	assert.equal(loadConfig(root)?.enabled, false);

	// Dirs, gitkeep, and the existing checkpoint are intact.
	assert.ok(existsSync(path.join(root, "sessions", "pending", ".gitkeep")));
	assert.equal(countCheckpointFiles(pendingDir(root)), 1);

	// Capture now skips because disabled.
	const after = await capture(root, "manual", depsFor(root));
	assert.equal(after.skippedReason, "disabled");
});

test("disable is a no-op when the project is not configured", async () => {
	const root = tmp();
	const result = await disable(root, { runGit: repoRunner(root) });
	assert.equal(result.disabled, false);
});

// --- US3: session-start / status ---

const archiveDir = (root: string) => path.join(root, "sessions", "archive");

function seedArchive(root: string, count: number): void {
	for (let i = 0; i < count; i += 1) {
		// Zero-padded so lexicographic order matches creation order (oldest first).
		writeCheckpointFile(archiveDir(root), `2026-06-22-${String(i).padStart(3, "0")}`, `c${i}`);
	}
}

test("sessionStart prunes the archive to the max (oldest first) and reports pending count", async () => {
	const root = tmp();
	writeConfig(root, { maxArchivedCheckpoints: 50 });
	seedArchive(root, 53);
	writeCheckpointFile(pendingDir(root), "p1", "x");
	writeCheckpointFile(pendingDir(root), "p2", "y");

	const result = await sessionStart(root, { runGit: repoRunner(root) });
	assert.equal(result.pendingCount, 2);
	assert.equal(result.prunedCount, 3);
	assert.equal(countCheckpointFiles(archiveDir(root)), 50);

	// Oldest removed: the three lowest-numbered files are gone, the newest remain.
	const remaining = await sessionStart(root, { runGit: repoRunner(root) });
	assert.equal(remaining.prunedCount, 0);
});

test("sessionStart does not prune when archive is at or below the max", async () => {
	const root = tmp();
	writeConfig(root, { maxArchivedCheckpoints: 50 });
	seedArchive(root, 10);
	const result = await sessionStart(root, { runGit: repoRunner(root) });
	assert.equal(result.prunedCount, 0);
	assert.equal(countCheckpointFiles(archiveDir(root)), 10);
});

test("sessionStart returns zeros for an unconfigured project", async () => {
	const root = tmp();
	const result = await sessionStart(root, { runGit: repoRunner(root) });
	assert.deepEqual(result, { pendingCount: 0, prunedCount: 0 });
});

test("status reports configured/enabled state, dirs, and counts", async () => {
	const root = tmp();
	await optIn(root, { runGit: repoRunner(root) });
	writeCheckpointFile(pendingDir(root), "p1", "x");
	seedArchive(root, 2);

	const result = await status(root, { runGit: repoRunner(root) });
	assert.equal(result.configured, true);
	assert.equal(result.enabled, true);
	assert.equal(result.pendingCount, 1);
	assert.equal(result.archivedCount, 2);
	assert.ok(result.pendingDir.endsWith(path.join("sessions", "pending")));
	assert.ok(result.archiveDir.endsWith(path.join("sessions", "archive")));
});

test("status on an unconfigured project reports configured:false with zero counts", async () => {
	const root = tmp();
	const result = await status(root, { runGit: repoRunner(root) });
	assert.equal(result.configured, false);
	assert.equal(result.enabled, false);
	assert.equal(result.pendingCount, 0);
	assert.equal(result.archivedCount, 0);
});
