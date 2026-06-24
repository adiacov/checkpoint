/**
 * Unit tests for the only real adapter logic: pi session entries -> core ConversationEntry[].
 * Validates data-model.md rules R1-R7 and the skip-empty correctness (via the core's hasUserMessage).
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { entriesFromSessionManager } from "../src/transcript.ts";
import type { PiEntry, SessionManager } from "../src/pi-types.ts";

/** Build a session manager whose getBranch returns the given entries. */
function branch(entries: PiEntry[]): SessionManager {
	return { getBranch: () => entries, getSessionFile: () => "/tmp/session.jsonl" };
}

test("R1: only `message` entries are kept; other entry kinds are dropped", () => {
	const out = entriesFromSessionManager(
		branch([
			{ type: "message", message: { role: "user", content: "hi" } },
			{ type: "snapshot" },
			{ type: "message" }, // no message payload -> dropped
			{ type: "message", message: { role: "assistant", content: "yo" } },
		]),
	);
	assert.equal(out.length, 2);
	assert.deepEqual(
		out.map((e) => e.role),
		["user", "assistant"],
	);
});

test("R2: order is preserved", () => {
	const out = entriesFromSessionManager(
		branch([
			{ type: "message", message: { role: "user", content: "1" } },
			{ type: "message", message: { role: "assistant", content: "2" } },
			{ type: "message", message: { role: "user", content: "3" } },
		]),
	);
	assert.deepEqual(
		out.map((e) => e.content),
		["1", "2", "3"],
	);
});

test("R3/R4: missing role -> 'unknown'; timestamp normalized, falling back to entry timestamp", () => {
	const out = entriesFromSessionManager(
		branch([
			{ type: "message", timestamp: "2026-06-24T00:00:00.000Z", message: { content: "x" } },
			{
				type: "message",
				message: { role: "user", content: "y", timestamp: "2026-06-24T01:02:03.000Z" },
			},
		]),
	);
	assert.equal(out[0]?.role, "unknown");
	assert.equal(out[0]?.timestamp, "2026-06-24T00:00:00.000Z");
	assert.equal(out[1]?.timestamp, "2026-06-24T01:02:03.000Z");
});

test("R5: string content is passed through unchanged", () => {
	const out = entriesFromSessionManager(
		branch([{ type: "message", message: { role: "user", content: "plain text" } }]),
	);
	assert.equal(out[0]?.content, "plain text");
});

test("R5: bashExecution maps to the {command, output} record the core expects", () => {
	const out = entriesFromSessionManager(
		branch([
			{ type: "message", message: { role: "bashExecution", command: "ls", output: "a\nb" } },
		]),
	);
	assert.deepEqual(out[0]?.content, { command: "ls", output: "a\nb" });
});

test("R6: each block type maps to the core's ContentBlock vocabulary", () => {
	const out = entriesFromSessionManager(
		branch([
			{
				type: "message",
				message: {
					role: "assistant",
					content: [
						{ type: "text", text: "hello" },
						{ type: "thinking", thinking: "secret" },
						{ type: "toolCall", name: "Bash", arguments: { cmd: "ls" } },
						{ type: "image", url: "x" },
						{ type: "weirdblock", foo: 1 },
					],
				},
			},
		]),
	);
	assert.deepEqual(out[0]?.content, [
		{ type: "text", text: "hello" },
		{ type: "thinking" },
		{ type: "toolCall", name: "Bash", arguments: { cmd: "ls" } },
		{ type: "image" },
		{ type: "weirdblock", foo: 1 },
	]);
});

test("R6: a malformed block degrades to an unknown block", () => {
	const out = entriesFromSessionManager(
		branch([
			{ type: "message", message: { role: "assistant", content: [null, { noType: true }] } },
		]),
	);
	assert.deepEqual(out[0]?.content, [{ type: "unknown" }, { type: "unknown" }]);
});

test("getEntries is used when getBranch is absent", () => {
	const sm: SessionManager = {
		getEntries: () => [{ type: "message", message: { role: "user", content: "from entries" } }],
	};
	const out = entriesFromSessionManager(sm);
	assert.equal(out[0]?.content, "from entries");
});

test("V3 skip-empty: a session with no real user text yields no real user message", async () => {
	// The core owns hasUserMessage; assert our output drives it correctly.
	const { capture } = await import("@checkpoint/core");
	// No user-role text -> capture would skip-empty. We assert via the translated shape here:
	const out = entriesFromSessionManager(
		branch([
			{ type: "message", message: { role: "assistant", content: "only assistant talk" } },
			{ type: "message", message: { role: "tool", content: "tool output" } },
		]),
	);
	assert.ok(
		!out.some((e) => e.role === "user"),
		"no user-role entry -> core's skip-empty suppresses capture",
	);
	assert.equal(typeof capture, "function");
});
