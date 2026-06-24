/**
 * The only real adapter logic: translate pi session-manager entries into the core's
 * agent-neutral `ConversationEntry[]`. No truncation, recent-N selection, skip-empty, or dedup —
 * those are the core's (Constitution I). See specs/004-pi-adapter/data-model.md for the rules.
 */

import type { ContentBlock, ConversationEntry } from "@checkpoint/core";
import type { PiEntry, PiMessage, SessionManager } from "./pi-types.js";

/** Read the session's entries (branch when available, else flat list) and translate each message. */
export function entriesFromSessionManager(sessionManager: SessionManager): ConversationEntry[] {
	const raw =
		typeof sessionManager.getBranch === "function"
			? sessionManager.getBranch()
			: (sessionManager.getEntries?.() ?? []);

	return raw.filter(isMessageEntry).map(translateEntry); // R1 selection, R2 order preserved
}

function isMessageEntry(entry: PiEntry): entry is PiEntry & { message: PiMessage } {
	return entry.type === "message" && !!entry.message;
}

function translateEntry(entry: PiEntry & { message: PiMessage }): ConversationEntry {
	const message = entry.message;
	const role = typeof message.role === "string" ? message.role : "unknown"; // R3
	const timestamp = normalizeTimestamp(message.timestamp) ?? normalizeTimestamp(entry.timestamp); // R4
	const base: ConversationEntry = { role, content: translateContent(message) }; // R5
	return timestamp ? { ...base, timestamp } : base;
}

function translateContent(message: PiMessage): ConversationEntry["content"] {
	// bashExecution carries command/output at the top level; the core renders the record form.
	if (message.role === "bashExecution") {
		return { command: message.command ?? "", output: message.output ?? "" };
	}
	const content = message.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map(translateBlock); // R6
	// Unknown content shape: pass the message through so the core stringifies it (reference fallback).
	return message as Record<string, unknown>;
}

function translateBlock(block: unknown): ContentBlock {
	if (!isRecord(block) || typeof block.type !== "string") return { type: "unknown" };
	switch (block.type) {
		case "text":
			return { type: "text", text: typeof block.text === "string" ? block.text : "" };
		case "thinking":
			return { type: "thinking" }; // payload dropped; the core omits thinking anyway
		case "toolCall":
			return { type: "toolCall", name: String(block.name), arguments: block.arguments };
		case "image":
			return { type: "image" };
		default:
			// Open block: keep the original type (and any fields) so the core renders `[<type>]`.
			return { ...block, type: block.type };
	}
}

/** ISO-normalize a pi timestamp; fall back to a raw string, or `undefined` when unusable. */
function normalizeTimestamp(value: unknown): string | undefined {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const date = new Date(value);
	if (!Number.isNaN(date.getTime())) return date.toISOString();
	return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
