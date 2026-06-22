import assert from "node:assert/strict";
import { test } from "node:test";
import {
	hasUserMessage,
	isRealUserMessage,
	messageToText,
	selectRecentEntries,
	truncate,
} from "../src/entries.ts";
import type { ConversationEntry } from "../src/types.ts";

test("messageToText returns string content as-is", () => {
	assert.equal(messageToText({ role: "user", content: "hello" }), "hello");
});

test("messageToText renders content blocks: thinking omitted, tool summarized, image omitted", () => {
	const entry: ConversationEntry = {
		role: "assistant",
		content: [
			{ type: "text", text: "doing work" },
			{ type: "thinking" },
			{ type: "toolCall", name: "bash", arguments: { cmd: "ls" } },
			{ type: "image" },
			{ type: "mystery" },
		],
	};
	assert.equal(
		messageToText(entry),
		'doing work\n[thinking omitted]\n[tool call: bash] {"cmd":"ls"}\n[image omitted]\n[mystery]',
	);
});

test("messageToText handles bashExecution objects", () => {
	const entry: ConversationEntry = {
		role: "bashExecution",
		content: { command: "ls -la", output: "file.txt" },
	};
	assert.equal(messageToText(entry), "$ ls -la\nfile.txt");
});

test("messageToText stringifies arbitrary object content", () => {
	const entry: ConversationEntry = { role: "tool", content: { foo: 1 } };
	assert.equal(messageToText(entry), JSON.stringify({ foo: 1 }, null, 2));
});

test("truncate appends a marker only when over the limit", () => {
	assert.equal(truncate("abc", 10), "abc");
	assert.equal(truncate("abcdef", 3), "abc\n\n[truncated 3 chars]");
});

test("selectRecentEntries keeps only the last N", () => {
	const entries: ConversationEntry[] = Array.from({ length: 30 }, (_, i) => ({
		role: "user",
		content: `m${i}`,
	}));
	const recent = selectRecentEntries(entries, 24);
	assert.equal(recent.length, 24);
	assert.equal(recent[0]?.content, "m6");
	assert.equal(recent.at(-1)?.content, "m29");
});

test("real-user-message detection requires role=user and non-empty text", () => {
	assert.equal(isRealUserMessage({ role: "user", content: "hi" }), true);
	assert.equal(isRealUserMessage({ role: "user", content: "   " }), false);
	assert.equal(isRealUserMessage({ role: "assistant", content: "hi" }), false);
	assert.equal(hasUserMessage([{ role: "assistant", content: "only assistant" }]), false);
	assert.equal(
		hasUserMessage([
			{ role: "assistant", content: "x" },
			{ role: "user", content: "real" },
		]),
		true,
	);
});
