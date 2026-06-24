/**
 * The adapter's transcript translation: Codex conversation inputs -> the core's neutral
 * `ConversationEntry[]`. Two sources (specs/005-codex-adapter/data-model.md):
 *   A. the `agent-turn-complete` notify payload (primary, stable) — used by auto-capture;
 *   B. the Codex session rollout JSONL (best-effort, version-variable) — used by the manual command.
 * No truncation / recent-N / skip-empty / dedup — the core owns those (Constitution I/III).
 */

import type { ContentBlock, ConversationEntry } from "@checkpoint/core";

/** The fields the adapter reads from Codex's `agent-turn-complete` notify payload. */
export interface NotifyPayload {
	type?: string;
	cwd?: string;
	"input-messages"?: unknown;
	"last-assistant-message"?: unknown;
}

/**
 * Source A — translate an `agent-turn-complete` payload. Each `input-messages` string becomes a
 * `user` entry (in order), then `last-assistant-message` (if a non-empty string) an `assistant`
 * entry. Any other event type, or a missing/!array `input-messages`, yields no user entries so the
 * core's skip-empty behaves correctly.
 */
export function entriesFromNotifyPayload(payload: NotifyPayload): ConversationEntry[] {
	if (payload.type !== "agent-turn-complete") return []; // A1
	const entries: ConversationEntry[] = [];

	const inputs = payload["input-messages"];
	if (Array.isArray(inputs)) {
		for (const message of inputs) {
			if (typeof message === "string")
				entries.push({ role: "user", content: message }); // A2
			else if (message != null) entries.push({ role: "user", content: String(message) });
		}
	}

	const assistant = payload["last-assistant-message"];
	if (typeof assistant === "string" && assistant.length > 0) {
		entries.push({ role: "assistant", content: assistant }); // A3
	}
	return entries; // A4 order: users then assistant
}

const CONVERSATION_ROLES = new Set(["user", "assistant", "system", "tool"]);

/**
 * Source B — best-effort translation of a Codex session rollout JSONL string. The per-line schema
 * varies by Codex version, so this is deliberately tolerant: unparseable lines are skipped, only
 * records that resolve to a conversation role are kept, and it never throws. Returns `[]` for
 * empty/undefined input (manual checkpoint then degrades to git-facts-only via the core).
 */
export function entriesFromRollout(jsonl: string | undefined): ConversationEntry[] {
	if (!jsonl) return []; // B6
	const entries: ConversationEntry[] = [];
	for (const line of jsonl.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let record: unknown;
		try {
			record = JSON.parse(trimmed); // B1
		} catch {
			continue;
		}
		if (!isRecord(record)) continue;
		const role = resolveRole(record); // B2
		if (!role || !CONVERSATION_ROLES.has(role)) continue; // B3
		entries.push({ role, content: translateContent(resolveContent(record)) }); // B4
	}
	return entries; // B5 order preserved
}

/** Probe known locations for a role: top-level, `.payload`, `.message`. */
function resolveRole(record: Record<string, unknown>): string | undefined {
	const candidates = [
		record.role,
		nested(record, "payload", "role"),
		nested(record, "message", "role"),
	];
	for (const value of candidates) if (typeof value === "string") return value;
	return undefined;
}

/** Probe known locations for content: top-level, `.payload`, `.message`. */
function resolveContent(record: Record<string, unknown>): unknown {
	if ("content" in record) return record.content;
	const fromPayload = nested(record, "payload", "content");
	if (fromPayload !== undefined) return fromPayload;
	return nested(record, "message", "content");
}

function translateContent(content: unknown): ConversationEntry["content"] {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map(translateBlock);
	if (isRecord(content)) return content;
	return content == null ? "" : String(content);
}

function translateBlock(block: unknown): ContentBlock {
	if (!isRecord(block)) return { type: "unknown" };
	// Any text-bearing block (Codex uses `text`, `output_text`, `input_text`, …) renders as text.
	if (typeof block.text === "string") return { type: "text", text: block.text };
	if (typeof block.type !== "string") return { type: "unknown" };
	switch (block.type) {
		case "thinking":
			return { type: "thinking" };
		case "toolCall":
			return { type: "toolCall", name: String(block.name), arguments: block.arguments };
		case "image":
			return { type: "image" };
		default:
			return { ...block, type: block.type };
	}
}

function nested(record: Record<string, unknown>, key: string, field: string): unknown {
	const inner = record[key];
	return isRecord(inner) ? inner[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
