#!/usr/bin/env node
/**
 * CLI entry for the Claude Code checkpoint adapter. Both the plugin's hooks (via stdin payloads)
 * and its slash commands (via a `cwd` argument) invoke this with a subcommand. It only dispatches
 * to the bridge, which calls @checkpoint/core. Lifecycle subcommands always exit 0 so a hook can
 * never break the session.
 */

import {
	readStdin,
	runDisable,
	runLifecycleCapture,
	runManual,
	runOptIn,
	runSessionStart,
	runStatus,
} from "./bridge.js";

type Subcommand =
	| "session-start"
	| "session-end"
	| "pre-compact"
	| "manual"
	| "optin"
	| "disable"
	| "status";

const LIFECYCLE: ReadonlySet<string> = new Set(["session-start", "session-end", "pre-compact"]);

async function main(): Promise<void> {
	const sub = process.argv[2] as Subcommand | undefined;
	// Slash commands pass cwd as the next arg; default to the process cwd.
	const cwd = process.argv[3] ?? process.cwd();

	switch (sub) {
		case "session-start":
			print(await runSessionStart(await readStdin()));
			return;
		case "session-end":
			print(await runLifecycleCapture("shutdown", await readStdin()));
			return;
		case "pre-compact":
			print(await runLifecycleCapture("reload", await readStdin()));
			return;
		case "manual":
			print(await runManual(cwd));
			return;
		case "optin":
			print(await runOptIn(cwd));
			return;
		case "disable":
			print(await runDisable(cwd));
			return;
		case "status":
			print(await runStatus(cwd));
			return;
		default:
			process.stderr.write(
				`Unknown subcommand: ${sub ?? "(none)"}. Expected one of: session-start, session-end, pre-compact, manual, optin, disable, status.\n`,
			);
			process.exitCode = 2;
	}
}

function print(message: string): void {
	if (message) process.stdout.write(`${message}\n`);
}

main().catch((error: unknown) => {
	const sub = process.argv[2] ?? "";
	const message = error instanceof Error ? error.message : String(error);
	process.stderr.write(`checkpoint adapter error: ${message}\n`);
	// Lifecycle hooks must never break the session; commands may surface a non-zero code.
	process.exitCode = LIFECYCLE.has(sub) ? 0 : 1;
});
