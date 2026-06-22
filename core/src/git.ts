/**
 * Git facts collection via an injected command runner (FR-002). Ported from the reference
 * `gitFactsMarkdown`/`exec`/`safeOutput`/`detectGitRoot`, but the markdown rendering lives in
 * checkpoint.ts — this module produces the resolved {@link GitFacts} data with fallbacks
 * already applied, so a non-git directory degrades gracefully instead of failing capture.
 */

import { spawn } from "node:child_process";
import type { CommandRunner, GitFacts } from "./types.js";

/** Default runner used when an adapter does not inject one. */
export const defaultRunner: CommandRunner = (command, args, options) =>
	new Promise((resolve) => {
		const child = spawn(command, args, { cwd: options?.cwd });
		let stdout = "";
		let stderr = "";
		child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
		child.stderr?.on("data", (chunk) => (stderr += String(chunk)));
		child.on("error", (err) => resolve({ code: 127, stdout, stderr: stderr || String(err) }));
		child.on("close", (code) => resolve({ code: code ?? 0, stdout, stderr }));
	});

/** Resolve the project root: git toplevel, or the working directory when not a repo. */
export async function resolveRoot(runGit: CommandRunner, cwd: string): Promise<string> {
	const result = await runGit("git", ["rev-parse", "--show-toplevel"], { cwd });
	if (result.code !== 0) return cwd;
	return result.stdout.trim() || cwd;
}

/** Collect branch/status/diff-stat/recent-commits, degrading each field to a fallback. */
export async function gitFacts(runGit: CommandRunner, cwd: string): Promise<GitFacts> {
	const [branch, status, diffStat, recentCommits] = await Promise.all([
		runGit("git", ["branch", "--show-current"], { cwd }),
		runGit("git", ["status", "--short"], { cwd }),
		runGit("git", ["diff", "--stat"], { cwd }),
		runGit("git", ["log", "--oneline", "-5"], { cwd }),
	]);

	return {
		branch: safeOutput(branch, "unknown") || "unknown",
		status: safeOutput(status, "git status unavailable") || "clean",
		diffStat: safeOutput(diffStat, "none") || "none",
		recentCommits: safeOutput(recentCommits, "none") || "none",
	};
}

function safeOutput(
	result: { code: number; stdout: string; stderr: string },
	fallback: string,
): string {
	if (result.code !== 0) return (result.stderr || fallback).trim();
	return result.stdout.trim();
}
