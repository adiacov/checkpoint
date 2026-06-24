/**
 * Unit tests for the adapter's transcript translation (data-model.md). Two sources: the
 * agent-turn-complete notify payload (primary) and the best-effort rollout JSONL parser.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { entriesFromNotifyPayload, entriesFromRollout } from "../src/transcript.ts";

// --- Source A: notify payload --------------------------------------------------------------------

test("A1: a non-agent-turn-complete payload yields no entries", () => {
	assert.deepEqual(entriesFromNotifyPayload({ type: "something-else" }), []);
	assert.deepEqual(entriesFromNotifyPayload({}), []);
});

test("A2/A3/A4: input-messages -> user entries (in order), then last-assistant-message", () => {
	const out = entriesFromNotifyPayload({
		type: "agent-turn-complete",
		"input-messages": ["first", "second"],
		"last-assistant-message": "done",
	});
	assert.deepEqual(out, [
		{ role: "user", content: "first" },
		{ role: "user", content: "second" },
		{ role: "assistant", content: "done" },
	]);
});

test("A3: a missing/empty last-assistant-message adds no assistant entry", () => {
	assert.deepEqual(
		entriesFromNotifyPayload({ type: "agent-turn-complete", "input-messages": ["hi"] }),
		[{ role: "user", content: "hi" }],
	);
	assert.deepEqual(
		entriesFromNotifyPayload({
			type: "agent-turn-complete",
			"input-messages": ["hi"],
			"last-assistant-message": "",
		}),
		[{ role: "user", content: "hi" }],
	);
});

test("A5: a missing / non-array input-messages yields no user entries (core then skip-empties)", () => {
	assert.deepEqual(entriesFromNotifyPayload({ type: "agent-turn-complete" }), []);
	assert.deepEqual(
		entriesFromNotifyPayload({
			type: "agent-turn-complete",
			"input-messages": "not an array",
			"last-assistant-message": "x",
		}),
		[{ role: "assistant", content: "x" }],
	);
});

// --- Source B: rollout JSONL ---------------------------------------------------------------------

test("B6: missing/empty input yields []", () => {
	assert.deepEqual(entriesFromRollout(undefined), []);
	assert.deepEqual(entriesFromRollout(""), []);
});

test("B1/B3: malformed lines and non-conversation records are dropped, never throwing", () => {
	const jsonl = [
		"{ not json",
		JSON.stringify({ type: "token_usage", total: 42 }),
		JSON.stringify({ role: "user", content: "hello" }),
		"",
		JSON.stringify({ type: "tool_call", payload: { name: "bash" } }),
	].join("\n");
	assert.deepEqual(entriesFromRollout(jsonl), [{ role: "user", content: "hello" }]);
});

test("B2: role/content resolved from top-level, .payload, and .message; B5 order preserved", () => {
	const jsonl = [
		JSON.stringify({ role: "user", content: "top" }),
		JSON.stringify({ payload: { role: "assistant", content: "in-payload" } }),
		JSON.stringify({ message: { role: "user", content: "in-message" } }),
	].join("\n");
	assert.deepEqual(entriesFromRollout(jsonl), [
		{ role: "user", content: "top" },
		{ role: "assistant", content: "in-payload" },
		{ role: "user", content: "in-message" },
	]);
});

test("B4: array content maps to the core's ContentBlock vocabulary", () => {
	const jsonl = JSON.stringify({
		role: "assistant",
		content: [
			{ type: "text", text: "hi" },
			{ type: "output_text", text: "loose-text" },
			{ type: "thinking", thinking: "secret" },
			{ type: "image", url: "x" },
			{ type: "weird", foo: 1 },
		],
	});
	assert.deepEqual(entriesFromRollout(jsonl), [
		{
			role: "assistant",
			content: [
				{ type: "text", text: "hi" },
				{ type: "text", text: "loose-text" },
				{ type: "thinking" },
				{ type: "image" },
				{ type: "weird", foo: 1 },
			],
		},
	]);
});

test("only conversation roles are kept (system/tool included; others dropped)", () => {
	const jsonl = [
		JSON.stringify({ role: "system", content: "sys" }),
		JSON.stringify({ role: "tool", content: "tool out" }),
		JSON.stringify({ role: "reasoning", content: "drop me" }),
	].join("\n");
	assert.deepEqual(entriesFromRollout(jsonl), [
		{ role: "system", content: "sys" },
		{ role: "tool", content: "tool out" },
	]);
});
