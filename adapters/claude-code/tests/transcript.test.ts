/**
 * Unit tests for the transcript translation (data-model.md R1–R7). This is the adapter's only real
 * logic, so it carries the test weight; the rest is declarative wiring or core delegation. Tests
 * assert the adapter's output structure (not the core's rendering, which the core owns/tests).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { ContentBlock } from "@checkpoint/core";
import { parseTranscript } from "../src/transcript.ts";

/** Build a JSONL transcript from line objects. */
function jsonl(...lines: unknown[]): string {
	return lines.map((l) => JSON.stringify(l)).join("\n");
}

/** Mirrors the core's `isRealUserMessage` keying: a genuine user message has role "user". */
function hasGenuineUserMessage(entries: { role: string }[]): boolean {
	return entries.some((e) => e.role === "user");
}

test("R1: keeps only user/assistant lines that have a message", () => {
	const input = jsonl(
		{ type: "system", message: { role: "system", content: "boot" } },
		{ type: "file-history-snapshot" },
		{ type: "attachment", message: { role: "user", content: "x" } },
		{ type: "user", message: { role: "user", content: "hello" } },
		{ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } },
		{ type: "user" }, // no message -> dropped
	);
	const entries = parseTranscript(input);
	assert.deepEqual(
		entries.map((e) => e.role),
		["user", "assistant"],
	);
});

test("R2: drops sidechain (subagent) lines", () => {
	const input = jsonl(
		{ type: "user", isSidechain: true, message: { role: "user", content: "sub" } },
		{ type: "assistant", isSidechain: true, message: { role: "assistant", content: "sub-a" } },
		{ type: "user", message: { role: "user", content: "main" } },
	);
	const entries = parseTranscript(input);
	assert.equal(entries.length, 1);
	assert.equal(entries[0]!.content, "main");
});

test("R3/R4: preserves order and timestamp", () => {
	const input = jsonl(
		{
			type: "user",
			timestamp: "2026-06-24T00:00:01.000Z",
			message: { role: "user", content: "a" },
		},
		{
			type: "assistant",
			timestamp: "2026-06-24T00:00:02.000Z",
			message: { role: "assistant", content: "b" },
		},
	);
	const entries = parseTranscript(input);
	assert.equal(entries[0]!.timestamp, "2026-06-24T00:00:01.000Z");
	assert.equal(entries[1]!.timestamp, "2026-06-24T00:00:02.000Z");
	assert.deepEqual([entries[0]!.content, entries[1]!.content], ["a", "b"]);
});

test("R4: omits timestamp when the line has none", () => {
	const entries = parseTranscript(jsonl({ type: "user", message: { role: "user", content: "x" } }));
	assert.equal("timestamp" in entries[0]!, false);
});

test("R5: string content stays a string", () => {
	const entries = parseTranscript(
		jsonl({ type: "user", message: { role: "user", content: "plain" } }),
	);
	assert.equal(entries[0]!.content, "plain");
});

test("R6: maps every block type to the core's vocabulary without dropping any message", () => {
	const input = jsonl({
		type: "assistant",
		message: {
			role: "assistant",
			content: [
				{ type: "text", text: "answer" },
				{ type: "thinking", thinking: "secret", signature: "s" },
				{ type: "tool_use", id: "t1", name: "Bash", input: { cmd: "ls" } },
				{ type: "tool_result", tool_use_id: "t1", content: "files", is_error: false },
				{ type: "image" },
				{ type: "future_block", extra: 1 },
			],
		},
	});
	const blocks = parseTranscript(input)[0]!.content as ContentBlock[];
	assert.ok(Array.isArray(blocks));
	assert.equal(blocks.length, 6); // SC-004: none dropped
	assert.deepEqual(
		blocks.map((b) => b.type),
		["text", "thinking", "toolCall", "toolResult", "image", "future_block"],
	);
	assert.deepEqual(blocks[0], { type: "text", text: "answer" });
	assert.deepEqual(blocks[2], { type: "toolCall", name: "Bash", arguments: { cmd: "ls" } });
	assert.equal((blocks[3] as { type: string; isError: boolean }).isError, false);
});

test("R6: thinking block drops its text (core omits thinking)", () => {
	const input = jsonl({
		type: "assistant",
		message: { role: "assistant", content: [{ type: "thinking", thinking: "secret" }] },
	});
	const block = (parseTranscript(input)[0]!.content as ContentBlock[])[0]!;
	assert.deepEqual(block, { type: "thinking" });
});

test("R7: a user line that is only tool_result is remapped to role 'tool' (skip-empty correctness)", () => {
	const input = jsonl({
		type: "user",
		message: {
			role: "user",
			content: [{ type: "tool_result", tool_use_id: "t1", content: "out" }],
		},
	});
	const entries = parseTranscript(input);
	assert.equal(entries[0]!.role, "tool");
	// V3: a transcript of only tool results has no genuine user message -> core skip-empty applies.
	assert.equal(hasGenuineUserMessage(entries), false);
});

test("R7: genuine user text keeps role 'user'", () => {
	const input = jsonl({
		type: "user",
		message: { role: "user", content: [{ type: "text", text: "do the thing" }] },
	});
	const entries = parseTranscript(input);
	assert.equal(entries[0]!.role, "user");
	assert.equal(hasGenuineUserMessage(entries), true);
});

test("tolerates blank and malformed lines", () => {
	const input = [
		"",
		"not json",
		JSON.stringify({ type: "user", message: { role: "user", content: "ok" } }),
		"",
	].join("\n");
	const entries = parseTranscript(input);
	assert.equal(entries.length, 1);
	assert.equal(entries[0]!.content, "ok");
});
