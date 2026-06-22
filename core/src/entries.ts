/**
 * Conversation-entry normalization: rendering a caller-supplied entry to text, truncation,
 * thinking/tool/image handling, recent-entry selection, and real-user-message detection.
 * Ported from the reference `messageToText`/`truncate`/`hasUserMessage` (FR-004, FR-005),
 * adapted to the agent-neutral {@link ConversationEntry} (no agent `sessionManager`).
 */

import type { ContentBlock, ConversationEntry } from "./types.js";

/** Render an entry's content to plain text, omitting thinking and summarizing tool calls. */
export function messageToText(entry: ConversationEntry): string {
	const content = entry.content;
	if (typeof content === "string") return content;

	// bashExecution carries its command/output as a content object (adapter-normalized).
	if (entry.role === "bashExecution" && isRecord(content)) {
		const command = content.command;
		const output = content.output;
		return [command ? `$ ${String(command)}` : "", output ? String(output) : ""]
			.filter(Boolean)
			.join("\n");
	}

	if (!Array.isArray(content)) return JSON.stringify(content, null, 2);

	return content.map(renderBlock).join("\n");
}

function renderBlock(block: ContentBlock): string {
	// The union has an open member (`{ type: string; ... }`), so read fields off a record view.
	const b = block as Record<string, unknown>;
	if (block.type === "text") return typeof b.text === "string" ? b.text : "";
	if (block.type === "thinking") return "[thinking omitted]";
	if (block.type === "toolCall") {
		return `[tool call: ${String(b.name)}] ${JSON.stringify(b.arguments)}`;
	}
	if (block.type === "image") return "[image omitted]";
	return `[${block.type || "unknown block"}]`;
}

/** Truncate text to `max` characters, appending a marker noting how many were dropped. */
export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}

/** The most recent `count` entries (bounds checkpoint size regardless of session length). */
export function selectRecentEntries(
	entries: ConversationEntry[],
	count: number,
): ConversationEntry[] {
	return entries.slice(-count);
}

/** A "real user message" is a `user` entry with non-empty text — drives skip-empty (FR-005). */
export function isRealUserMessage(entry: ConversationEntry): boolean {
	return entry.role === "user" && messageToText(entry).trim().length > 0;
}

/** Whether the conversation contains at least one real user message. */
export function hasUserMessage(entries: ConversationEntry[]): boolean {
	return entries.some(isRealUserMessage);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
