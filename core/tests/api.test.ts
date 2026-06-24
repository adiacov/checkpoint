import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { archive, capture, disable, optIn, sessionStart, status } from "../src/api.ts";
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

// --- 003: archive (recovery close-out) ---

test("archive moves a batch pending -> archive, leaving pending empty (C1)", async () => {
	const root = tmp();
	writeConfig(root);
	writeCheckpointFile(pendingDir(root), "a", "x");
	writeCheckpointFile(pendingDir(root), "b", "y");

	const result = await archive(root, ["a.md", "b.md"], { runGit: repoRunner(root) });
	assert.deepEqual(result.moved.sort(), ["a.md", "b.md"]);
	assert.equal(result.prunedCount, 0);
	assert.equal(countCheckpointFiles(pendingDir(root)), 0);
	assert.equal(countCheckpointFiles(archiveDir(root)), 2);
});

test("archive partial batch: valid file moved, missing reported (C2)", async () => {
	const root = tmp();
	writeConfig(root);
	writeCheckpointFile(pendingDir(root), "a", "x");
	const result = await archive(root, ["a.md", "ghost.md"], { runGit: repoRunner(root) });
	assert.deepEqual(result.moved, ["a.md"]);
	assert.deepEqual(result.skipped, [{ name: "ghost.md", reason: "not-found" }]);
});

test("archive prunes the archive to the max after moving (C3)", async () => {
	const root = tmp();
	writeConfig(root, { maxArchivedCheckpoints: 50 });
	seedArchive(root, 50); // archive already full
	writeCheckpointFile(pendingDir(root), "2026-06-23-new", "n");

	const result = await archive(root, undefined, { runGit: repoRunner(root) });
	assert.deepEqual(result.moved, ["2026-06-23-new.md"]);
	assert.equal(result.prunedCount, 1);
	assert.equal(countCheckpointFiles(archiveDir(root)), 50);
});

test("archive is collision-safe: already-archived skip, no overwrite (C4)", async () => {
	const root = tmp();
	writeConfig(root);
	writeCheckpointFile(pendingDir(root), "a", "PENDING");
	writeCheckpointFile(archiveDir(root), "a", "ARCHIVED");
	const result = await archive(root, ["a.md"], { runGit: repoRunner(root) });
	assert.deepEqual(result.skipped, [{ name: "a.md", reason: "already-archived" }]);
	assert.equal(readFileSync(path.join(archiveDir(root), "a.md"), "utf8"), "ARCHIVED");
});

test("archive on an unconfigured project is an empty no-op (C7)", async () => {
	const root = tmp();
	const result = await archive(root, undefined, { runGit: repoRunner(root) });
	assert.deepEqual(result, { moved: [], skipped: [], errors: [], prunedCount: 0 });
});

test("archive with an absent pending dir is an empty no-op (C8)", async () => {
	const root = tmp();
	writeConfig(root); // configured but never captured -> no pending dir yet
	const result = await archive(root, undefined, { runGit: repoRunner(root) });
	assert.deepEqual(result.moved, []);
	assert.deepEqual(result.errors, []);
});

test("archive is idempotent: re-running changes nothing and loses nothing (C9)", async () => {
	const root = tmp();
	writeConfig(root);
	writeCheckpointFile(pendingDir(root), "a", "x");
	const first = await archive(root, ["a.md"], { runGit: repoRunner(root) });
	assert.deepEqual(first.moved, ["a.md"]);

	const second = await archive(root, ["a.md"], { runGit: repoRunner(root) });
	assert.deepEqual(second.moved, []);
	assert.deepEqual(second.skipped, [{ name: "a.md", reason: "already-archived" }]);
	assert.equal(countCheckpointFiles(archiveDir(root)), 1);
});

test("archive moves content byte-for-byte without altering it (mechanical only, C10)", async () => {
	const root = tmp();
	writeConfig(root);
	const original = "# Pending Session Checkpoint\n\narbitrary raw body, never curated\n";
	writeCheckpointFile(pendingDir(root), "a", original);
	await archive(root, ["a.md"], { runGit: repoRunner(root) });
	assert.equal(readFileSync(path.join(archiveDir(root), "a.md"), "utf8"), original);
});

// --- Cross-cutting: agent-neutrality (Constitution Principle I / FR-001) ---

test("core source imports no agent SDK (agent-neutral)", () => {
	const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
	const forbidden = [/@earendil/i, /\bpi-coding-agent\b/i, /@anthropic/i, /\bcodex\b/i];
	for (const name of readdirSync(srcDir).filter((f) => f.endsWith(".ts"))) {
		const text = readFileSync(path.join(srcDir, name), "utf8");
		for (const importLine of text.split(/\r?\n/).filter((l) => /^\s*import\b/.test(l))) {
			for (const pattern of forbidden) {
				assert.ok(
					!pattern.test(importLine),
					`${name} must not import an agent SDK: ${importLine.trim()}`,
				);
			}
		}
	}
});
