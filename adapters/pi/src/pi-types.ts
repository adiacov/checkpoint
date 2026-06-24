/**
 * Minimal local type shim for the slice of pi's `ExtensionAPI` this adapter uses.
 *
 * pi ships real types in `@earendil-works/pi-coding-agent` (what `reference/checkpoint.ts`
 * imports). We deliberately declare only the surface we touch here so the adapter builds
 * hermetically with `@checkpoint/core` as its single runtime dependency (the neutrality contract),
 * without pulling the full agent SDK into this in-repo package. At install/wiring time (feature
 * 006) these can be replaced by the real `import type` from the SDK with no code change — the shapes
 * mirror the reference's usage exactly.
 */

/** Result of `pi.exec` — same shape as the core's `CommandRunner` result (minus the options arg). */
export interface ExecResult {
	code: number;
	stdout: string;
	stderr: string;
}

/** A pi conversation message as read off a session entry (see `reference/checkpoint.ts`). */
export interface PiMessage {
	role?: string;
	content?: unknown;
	timestamp?: string | number;
	/** Present on `role === "bashExecution"` messages. */
	command?: string;
	output?: string;
}

/** A pi session-manager entry; conversation entries have `type === "message"`. */
export interface PiEntry {
	type?: string;
	timestamp?: string | number;
	message?: PiMessage;
}

/** The subset of pi's session manager the adapter reads. */
export interface SessionManager {
	getBranch?(): PiEntry[];
	getEntries?(): PiEntry[];
	getSessionFile?(): string | undefined;
}

/** pi's UI surface for user notifications. */
export interface UI {
	notify(message: string, level?: "info" | "error"): void;
}

/** Context handed to every command/lifecycle handler. */
export interface CommandContext {
	cwd: string;
	hasUI: boolean;
	ui: UI;
	sessionManager: SessionManager;
}

/** Payload for the `session_shutdown` event (carries the shutdown reason). */
export interface SessionShutdownEvent {
	reason?: string;
}

/** Payload for the `session_start` event (no fields the adapter needs today). */
export type SessionStartEvent = Record<string, never>;

export interface CommandSpec {
	description: string;
	handler: (args: string[], ctx: CommandContext) => void | Promise<void>;
}

/** The pi extension API the adapter is constructed with. */
export interface ExtensionAPI {
	registerCommand(name: string, spec: CommandSpec): void;
	on(
		event: "session_start",
		handler: (event: SessionStartEvent, ctx: CommandContext) => void | Promise<void>,
	): void;
	on(
		event: "session_shutdown",
		handler: (event: SessionShutdownEvent, ctx: CommandContext) => void | Promise<void>,
	): void;
	exec(command: string, args: string[]): Promise<ExecResult>;
}
