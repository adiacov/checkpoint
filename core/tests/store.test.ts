import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { normalizeConfig } from "../src/config.ts";
import {
	archiveCheckpointFiles,
	archiveDirPath,
	countCheckpointFiles,
	listCheckpointFiles,
	newestPendingMtimeMs,
	pendingDirPath,
	writeCheckpointFile,
} from "../src/store.ts";

function tmp(): string {
	return mkdtempSync(path.join(tmpdir(), "ckpt-store-"));
}

const cfg = () => normalizeConfig({});

test("writeCheckpointFile creates the dir and writes the body", () => {
	const root = tmp();
	const dir = path.join(root, "sessions", "pending");
	const file = writeCheckpointFile(dir, "2026-06-22-manual", "hello");
	assert.ok(existsSync(file));
	assert.equal(path.basename(file), "2026-06-22-manual.md");
	assert.equal(countCheckpointFiles(dir), 1);
});

test("writeCheckpointFile appends a numeric suffix on collision (no overwrite)", () => {
	const root = tmp();
	const dir = path.join(root, "pending");
	const a = writeCheckpointFile(dir, "stamp-reason", "first");
	const b = writeCheckpointFile(dir, "stamp-reason", "second");
	const c = writeCheckpointFile(dir, "stamp-reason", "third");
	assert.equal(path.basename(a), "stamp-reason.md");
	assert.equal(path.basename(b), "stamp-reason-2.md");
	assert.equal(path.basename(c), "stamp-reason-3.md");
	assert.equal(listCheckpointFiles(dir).length, 3);
});

test("newestPendingMtimeMs is undefined when empty, set otherwise", () => {
	const root = tmp();
	const dir = path.join(root, "pending");
	assert.equal(newestPendingMtimeMs(dir), undefined);
	writeCheckpointFile(dir, "a", "x");
	const mtime = newestPendingMtimeMs(dir);
	assert.ok(typeof mtime === "number" && mtime > 0);
});

test("count/list ignore non-markdown and missing dirs", () => {
	const root = tmp();
	const dir = path.join(root, "pending");
	assert.equal(countCheckpointFiles(dir), 0);
	writeCheckpointFile(dir, "a", "x");
	writeFileSync(path.join(dir, "notes.txt"), "ignore me");
	assert.equal(countCheckpointFiles(dir), 1);
});

// --- archiveCheckpointFiles (003 recovery) ---

test("archiveCheckpointFiles moves named files pending -> archive", () => {
	const root = tmp();
	const config = cfg();
	writeCheckpointFile(pendingDirPath(root, config), "a", "x");
	writeCheckpointFile(pendingDirPath(root, config), "b", "y");

	const result = archiveCheckpointFiles(root, config, ["a.md", "b.md"]);
	assert.deepEqual(result.moved.sort(), ["a.md", "b.md"]);
	assert.deepEqual(result.skipped, []);
	assert.deepEqual(result.errors, []);
	assert.equal(countCheckpointFiles(pendingDirPath(root, config)), 0);
	assert.equal(countCheckpointFiles(archiveDirPath(root, config)), 2);
});

test("archiveCheckpointFiles all-mode archives every pending *.md, leaving .gitkeep", () => {
	const root = tmp();
	const config = cfg();
	const pending = pendingDirPath(root, config);
	writeCheckpointFile(pending, "a", "x");
	writeCheckpointFile(pending, "b", "y");
	writeFileSync(path.join(pending, ".gitkeep"), "");

	const result = archiveCheckpointFiles(root, config); // no names -> all
	assert.deepEqual(result.moved.sort(), ["a.md", "b.md"]);
	assert.ok(existsSync(path.join(pending, ".gitkeep")), ".gitkeep stays put");
	assert.equal(countCheckpointFiles(archiveDirPath(root, config)), 2);
});

test("archiveCheckpointFiles reports missing names without aborting the batch", () => {
	const root = tmp();
	const config = cfg();
	writeCheckpointFile(pendingDirPath(root, config), "a", "x");

	const result = archiveCheckpointFiles(root, config, ["a.md", "ghost.md"]);
	assert.deepEqual(result.moved, ["a.md"]);
	assert.deepEqual(result.skipped, [{ name: "ghost.md", reason: "not-found" }]);
});

test("archiveCheckpointFiles skips an explicitly named non-checkpoint (.gitkeep)", () => {
	const root = tmp();
	const config = cfg();
	const result = archiveCheckpointFiles(root, config, [".gitkeep"]);
	assert.deepEqual(result.skipped, [{ name: ".gitkeep", reason: "not-checkpoint" }]);
});

test("archiveCheckpointFiles is collision-safe: never overwrites an archived file", () => {
	const root = tmp();
	const config = cfg();
	writeCheckpointFile(pendingDirPath(root, config), "a", "PENDING");
	writeCheckpointFile(archiveDirPath(root, config), "a", "ARCHIVED");

	const result = archiveCheckpointFiles(root, config, ["a.md"]);
	assert.deepEqual(result.skipped, [{ name: "a.md", reason: "already-archived" }]);
	// Archive copy untouched; pending copy not lost.
	assert.equal(readFileSync(path.join(archiveDirPath(root, config), "a.md"), "utf8"), "ARCHIVED");
	assert.ok(existsSync(path.join(pendingDirPath(root, config), "a.md")));
});

test("archiveCheckpointFiles: a name already archived (gone from pending) -> already-archived", () => {
	const root = tmp();
	const config = cfg();
	writeCheckpointFile(archiveDirPath(root, config), "a", "ARCHIVED");
	const result = archiveCheckpointFiles(root, config, ["a.md"]);
	assert.deepEqual(result.skipped, [{ name: "a.md", reason: "already-archived" }]);
	assert.deepEqual(result.moved, []);
});

test("archiveCheckpointFiles on an absent pending dir is an empty no-op", () => {
	const root = tmp();
	const config = cfg();
	const result = archiveCheckpointFiles(root, config);
	assert.deepEqual(result, { moved: [], skipped: [], errors: [] });
});
