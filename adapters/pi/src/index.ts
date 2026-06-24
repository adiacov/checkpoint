/**
 * pi adapter for @checkpoint/core. A thin, in-process pi extension: the default export registers
 * the four-command surface and the two lifecycle handlers, each delegating every checkpoint
 * decision to the core. It contains NO checkpoint logic — config, git facts, markdown, skip-empty,
 * dedup, prune, and pending-count all live in the core (Constitution I). The only adapter-specific
 * work is command/handler registration, reason passthrough, and transcript translation. See
 * specs/004-pi-adapter/contracts/commands.md.
 */

import { relative } from "node:path";
import {
	capture,
	disable,
	optIn,
	sessionStart,
	status,
	type CaptureResult,
	type CommandRunner,
	type CoreDeps,
	type DisableResult,
	type OptInResult,
	type StatusResult,
} from "@checkpoint/core";
import type { CommandContext, ExtensionAPI } from "./pi-types.js";
import { entriesFromSessionManager } from "./transcript.js";

export default function checkpointExtension(pi: ExtensionAPI): void {
	// Run git through pi (parity with the reference; avoids assuming child_process in pi's runtime).
	// This is plumbing for the core's injectable runner, not checkpoint logic.
	const runGit: CommandRunner = (command, args) => pi.exec(command, args);

	/** Build the per-capture dependencies the core needs from the live session context. */
	function captureDeps(ctx: CommandContext): CoreDeps {
		const sessionFile = ctx.sessionManager.getSessionFile?.();
		const deps: CoreDeps = { entries: entriesFromSessionManager(ctx.sessionManager), runGit };
		return sessionFile ? { ...deps, sessionFile } : deps;
	}

	/** Notify only when pi has a UI surface (matches the reference's `ctx.hasUI` guards). */
	function notify(ctx: CommandContext, message: string, level: "info" | "error" = "info"): void {
		if (ctx.hasUI) ctx.ui.notify(message, level);
	}

	// --- Commands (the four-command surface — Principle II) -----------------------------------

	pi.registerCommand("checkpoint", {
		description: "Write a manual raw session checkpoint if checkpointing is enabled",
		handler: async (_args, ctx) => {
			const result = await capture(ctx.cwd, "manual", captureDeps(ctx));
			notify(ctx, formatCapture(result, ctx.cwd), captureLevel(result));
		},
	});

	pi.registerCommand("checkpoint-optin", {
		description: "Enable automatic raw session checkpoints for this project",
		handler: async (_args, ctx) => {
			try {
				const result = await optIn(ctx.cwd, { runGit });
				notify(ctx, formatOptIn(result, ctx.cwd), "info");
			} catch (error) {
				notify(ctx, `Checkpoint opt-in failed: ${errorMessage(error)}`, "error");
			}
		},
	});

	pi.registerCommand("checkpoint-disable", {
		description: "Disable automatic raw session checkpoints for this project",
		handler: async (_args, ctx) => {
			try {
				const result = await disable(ctx.cwd, { runGit });
				notify(ctx, formatDisable(result), "info");
			} catch (error) {
				notify(ctx, `Checkpoint disable failed: ${errorMessage(error)}`, "error");
			}
		},
	});

	pi.registerCommand("checkpoint-status", {
		description: "Show checkpoint configuration and pending checkpoint count",
		handler: async (_args, ctx) => {
			try {
				const result = await status(ctx.cwd, { runGit });
				notify(ctx, formatStatus(result), result.enabled ? "info" : "error");
			} catch (error) {
				notify(ctx, `Checkpoint status failed: ${errorMessage(error)}`, "error");
			}
		},
	});

	// --- Lifecycle handlers -------------------------------------------------------------------

	pi.on("session_shutdown", async (event, ctx) => {
		try {
			// Reason passes straight to the core, which gates `reload` via includeReload and decides
			// not-configured / disabled / empty / duplicate. No adapter-side gating.
			const result = await capture(ctx.cwd, event.reason ?? "shutdown", captureDeps(ctx));
			if (result.written && result.filePath) {
				notify(ctx, `Checkpoint written: ${relative(ctx.cwd, result.filePath)}`, "info");
			} else if (result.error) {
				notify(ctx, `Checkpoint failed: ${result.error}`, "error");
			}
			// Skips (empty / duplicate / reload-gated / not-configured) are silent, as in the reference.
		} catch (error) {
			notify(ctx, `Checkpoint failed: ${errorMessage(error)}`, "error");
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		try {
			const current = await status(ctx.cwd, { runGit });
			if (!current.configured || !current.enabled) return;
			const { pendingCount } = await sessionStart(ctx.cwd, { runGit });
			if (pendingCount > 0) {
				notify(
					ctx,
					`${pendingCount} pending checkpoint(s) need review in ${current.pendingDir}.`,
					"info",
				);
			}
		} catch (error) {
			notify(ctx, `Checkpoint startup check failed: ${errorMessage(error)}`, "error");
		}
	});
}

// --- Result formatters (humanize the core's typed results; no logic) --------------------------

/** Human-readable rendering of a core CaptureResult, relative to the project root. */
export function formatCapture(result: CaptureResult, cwd: string): string {
	if (result.written && result.filePath) {
		return `Checkpoint written: ${relative(cwd, result.filePath)}`;
	}
	if (result.error) return `Checkpoint failed: ${result.error}`;
	switch (result.skippedReason) {
		case "not-configured":
		case "disabled":
			return "Checkpointing is disabled here. Run /checkpoint-optin first.";
		case "empty-session":
			return "Skipped: empty session (no checkpoint written).";
		case "reload":
			return "Skipped: reload checkpoints are disabled for this project.";
		case "duplicate":
			return "Skipped: duplicate of a recent checkpoint.";
		default:
			return "No checkpoint written.";
	}
}

/** Error level for a manual capture: disabled/not-configured/error are surfaced as errors. */
function captureLevel(result: CaptureResult): "info" | "error" {
	if (result.written) return "info";
	if (result.error) return "error";
	return result.skippedReason === "not-configured" || result.skippedReason === "disabled"
		? "error"
		: "info";
}

export function formatOptIn(result: OptInResult, cwd: string): string {
	const rules = result.addedIgnoreRules.length
		? ` Added ignore rules: ${result.addedIgnoreRules.join(", ")}.`
		: " Ignore rules already present.";
	return `Checkpointing enabled. Config: ${relative(cwd, result.configPath)}; pending: ${result.pendingDir}; archive: ${result.archiveDir}.${rules}`;
}

export function formatDisable(result: DisableResult): string {
	if (!result.disabled) return "Checkpointing is not enabled for this project.";
	return "Checkpointing disabled (config kept; re-enable with /checkpoint-optin).";
}

export function formatStatus(result: StatusResult): string {
	if (!result.configured) {
		return "Checkpointing is not configured here. Run /checkpoint-optin.";
	}
	return [
		`Configured: yes`,
		`Enabled: ${result.enabled ? "yes" : "no"}`,
		`Pending: ${result.pendingCount} (${result.pendingDir})`,
		`Archived: ${result.archivedCount} (${result.archiveDir})`,
	].join("\n");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
