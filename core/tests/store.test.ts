import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
	countCheckpointFiles,
	listCheckpointFiles,
	newestPendingMtimeMs,
	writeCheckpointFile,
} from "../src/store.ts";

function tmp(): string {
	return mkdtempSync(path.join(tmpdir(), "ckpt-store-"));
}

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
