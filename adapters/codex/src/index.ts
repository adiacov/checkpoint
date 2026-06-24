#!/usr/bin/env node
/**
 * CLI entry for the Codex checkpoint adapter. Codex's `notify` program invokes this with the
 * `notify` subcommand (Codex appends the event JSON as the final arg); the command prompts make the
 * agent invoke it with `manual|optin|disable|status` (+ a `cwd` arg). It only dispatches to the
 * bridge, which calls @checkpoint/core. The `notify` subcommand always exits 0 so a notification can
 * never disrupt the session.
 */

import { runArchive, runDisable, runManual, runNotify, runOptIn, runStatus } from "./bridge.js";

type Subcommand = "notify" | "manual" | "optin" | "disable" | "status" | "archive";

const LIFECYCLE: ReadonlySet<string> = new Set(["notify"]);

async function main(): Promise<void> {
	const sub = process.argv[2] as Subcommand | undefined;
	// Command subcommands pass cwd as the next arg; default to the process cwd.
	const cwd = process.argv[3] ?? process.cwd();

	switch (sub) {
		case "notify":
			// Codex appends the agent-turn-complete JSON as the final argument.
			print(await runNotify(process.argv[3]));
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
		case "archive": {
			// `archive [name1 name2 ...] <cwd>`: trailing arg is cwd, preceding args are filenames.
			// Used by the recovery workflow (not a command prompt). With no filenames, all pending.
			const rest = process.argv.slice(3);
			const archiveCwd = rest.pop() ?? process.cwd();
			print(await runArchive(archiveCwd, rest));
			return;
		}
		default:
			process.stderr.write(
				`Unknown subcommand: ${sub ?? "(none)"}. Expected one of: notify, manual, optin, disable, status, archive.\n`,
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
	// The notify program must never disrupt the session; commands may surface a non-zero code.
	process.exitCode = LIFECYCLE.has(sub) ? 0 : 1;
});
