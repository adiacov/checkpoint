import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCheckpoint, gitFactsBlock } from "../src/checkpoint.ts";
import { normalizeConfig } from "../src/config.ts";
import type { GitFacts } from "../src/types.ts";

const facts: GitFacts = {
	branch: "main",
	status: "clean",
	diffStat: "none",
	recentCommits: "abc123 init",
};

test("gitFactsBlock renders branch line plus fenced status/diff/commits", () => {
	const block = gitFactsBlock(facts);
	assert.match(block, /^Branch: main\n/);
	assert.match(block, /### Status\n\n```text\nclean\n```/);
	assert.match(block, /### Diff stat\n\n```text\nnone\n```/);
	assert.match(block, /### Recent commits\n\n```text\nabc123 init\n```/);
});

test("formatCheckpoint includes header, integration note, git facts, and conversation", () => {
	const body = formatCheckpoint({
		now: new Date("2026-06-22T10:00:00.000Z"),
		reason: "manual",
		root: "/tmp/proj",
		cwd: "/tmp/proj/sub",
		sessionFile: "session-1",
		gitFacts: facts,
		entries: [
			{ role: "user", content: "hello", timestamp: "2026-06-22T09:59:00.000Z" },
			{ role: "assistant", content: "hi" },
		],
		config: normalizeConfig({ enabled: true }),
	});

	assert.match(body, /^# Pending Session Checkpoint\n/);
	assert.match(body, /Time: 2026-06-22T10:00:00\.000Z/);
	assert.match(body, /Reason: manual/);
	assert.match(body, /Project root: \/tmp\/proj/);
	assert.match(body, /CWD: \/tmp\/proj\/sub/);
	assert.match(body, /Session file: session-1/);
	assert.match(body, /## Integration note\n\nThis is raw session evidence, not durable memory\./);
	assert.match(body, /## Git facts/);
	assert.match(body, /## Recent conversation/);
	assert.match(body, /### user — 2026-06-22T09:59:00\.000Z\n\nhello/);
	assert.match(body, /### assistant — undefined\n\nhi/);
});

test("formatCheckpoint truncates long entries and bounds entry count", () => {
	const config = normalizeConfig({ enabled: true, recentEntries: 2, maxTextPerEntry: 5 });
	const body = formatCheckpoint({
		now: new Date("2026-06-22T10:00:00.000Z"),
		reason: "manual",
		root: "/r",
		cwd: "/r",
		gitFacts: facts,
		entries: [
			{ role: "user", content: "first-should-be-dropped" },
			{ role: "user", content: "second" },
			{ role: "user", content: "abcdefghij" },
		],
		config,
	});
	assert.doesNotMatch(body, /first-should-be-dropped/);
	assert.match(body, /abcde\n\n\[truncated 5 chars\]/);
});
