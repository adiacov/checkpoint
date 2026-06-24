/**
 * Transcript translation: Claude Code session JSONL -> the core's neutral ConversationEntry[].
 *
 * This is the only real logic the adapter owns (Constitution Principle V). It does NOT truncate,
 * de-dup, rank, or summarize — bounding (`recentEntries`/`maxTextPerEntry`), dedup, skip-empty and
 * prune all live in @checkpoint/core. See specs/002-claude-code-adapter/data-model.md (rules
 * R1–R7) for the contract this implements.
 */

import type { ContentBlock, ConversationEntry } from "@checkpoint/core";

/** One parsed line of a Claude Code transcript (only the fields we read). */
interface TranscriptLine {
	type?: string;
	timestamp?: string;
	isSidechain?: boolean;
	message?: { role?: string; content?: unknown };
}

/** A Claude content block as it appears in `message.content` arrays. */
interface ClaudeBlock {
	type?: string;
	[k: string]: unknown;
}

/**
 * Translate a raw JSONL transcript into ConversationEntry[].
 *
 * R1: keep only `user`/`assistant` lines that have a `message`.
 * R2: drop sidechain (subagent) lines.
 * R3: preserve order.
 */
export function parseTranscript(jsonl: string): ConversationEntry[] {
	const entries: ConversationEntry[] = [];
	for (const raw of jsonl.split("\n")) {
		const line = raw.trim();
		if (!line) continue;

		let obj: TranscriptLine;
		try {
			obj = JSON.parse(line) as TranscriptLine;
		} catch {
			continue; // tolerate non-JSON / partial lines
		}

		if (obj.type !== "user" && obj.type !== "assistant") continue; // R1
		if (!obj.message) continue; // R1
		if (obj.isSidechain === true) continue; // R2

		entries.push(lineToEntry(obj)); // R3 (push in order)
	}
	return entries;
}

function lineToEntry(line: TranscriptLine): ConversationEntry {
	const message = line.message ?? {};
	const content = toContent(message.content);
	const role = resolveRole(message.role ?? "unknown", content); // R7
	const entry: ConversationEntry = { role, content };
	if (typeof line.timestamp === "string") entry.timestamp = line.timestamp; // R4
	return entry;
}

/** R5: string content stays a string; block arrays map per R6; anything else passes through. */
function toContent(content: unknown): string | ContentBlock[] | Record<string, unknown> {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map((b) => mapBlock(b as ClaudeBlock));
	if (content && typeof content === "object") return content as Record<string, unknown>;
	return "";
}

/** R6: map one Claude block to a core ContentBlock, preserving (never dropping) the message. */
function mapBlock(block: ClaudeBlock): ContentBlock {
	switch (block.type) {
		case "text":
			return { type: "text", text: typeof block.text === "string" ? block.text : "" };
		case "thinking":
			return { type: "thinking" }; // core renders "[thinking omitted]"
		case "tool_use":
			return { type: "toolCall", name: String(block.name ?? ""), arguments: block.input };
		case "tool_result":
			return { type: "toolResult", isError: block.is_error === true, content: block.content };
		case "image":
			return { type: "image" };
		default:
			return { ...block, type: String(block.type ?? "unknown") };
	}
}

/**
 * R7 (skip-empty correctness): Claude returns tool results under `role:"user"`. If a user line is
 * ONLY tool_result block(s), remap its role to "tool" so the core's `isRealUserMessage` does not
 * count it as a genuine user message. Real user text keeps `role:"user"`.
 */
function resolveRole(
	role: string,
	content: string | ContentBlock[] | Record<string, unknown>,
): string {
	if (role !== "user" || !Array.isArray(content) || content.length === 0) return role;
	const onlyToolResults = content.every((b) => b.type === "toolResult");
	return onlyToolResults ? "tool" : role;
}
