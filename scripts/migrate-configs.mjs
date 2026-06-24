#!/usr/bin/env node
// checkpoint config single-source migration sweep (feature 007)
//
// Consolidates sibling projects to the canonical `.checkpoint.json`, removing the legacy
// `.pi/checkpoint.json`. Safe by default: dry-run unless --apply; never commits; never deletes a
// legacy file unless its canonical was written first; skips dirty git repos; refuses to delete
// legacy while the OLD pi extension (which still reads it) is the one installed.
//
// The per-directory merge/remove logic lives in @checkpoint/core (`migrateConfig`); this script only
// discovers projects, checks git/ordering preconditions, and reports. No config logic here.
//
// Usage: node scripts/migrate-configs.mjs [flags]
//   --root <path>            scan root (default: this repo's parent dir); its children are scanned
//   --apply                  perform changes (default: dry-run, change nothing)
//   --force                  include dirty git repos AND override the pi ordering guard
//   --pi-extensions <path>   dir checked by the ordering guard (default ~/.pi/agent/extensions)
//   -h, --help               this help
//
// Exit codes: 0 clean · 1 any failure or guard-blocked deletion (without --force) · 2 usage error.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateConfig } from "../core/dist/index.js";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

class UsageError extends Error {}

// ─────────────────────────────────────────────────────────── git / guard helpers

export function gitState(dir) {
	try {
		execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { stdio: "ignore" });
	} catch {
		return "non-git";
	}
	try {
		const out = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
		return out.trim().length > 0 ? "dirty" : "clean";
	} catch {
		return "non-git";
	}
}

// The 004/006 ordering guard: deleting a legacy file while the OLD reference pi extension is the one
// installed (and the shared-core adapter is not) would make pi inert for that project.
export function guardBlocksDeletion(piExtensions) {
	const legacyPiPresent = existsSync(join(piExtensions, "checkpoint.ts"));
	const sharedCorePresent = existsSync(join(piExtensions, "checkpoint"));
	return legacyPiPresent && !sharedCorePresent;
}

// ─────────────────────────────────────────────────────────── sweep

const DELETES_LEGACY = new Set(["migrated", "redundant-legacy-removed"]);

export function run(opts) {
	if (!existsSync(opts.root)) throw new UsageError(`--root is not a directory: ${opts.root}`);
	const blocks = guardBlocksDeletion(opts.piExtensions) && !opts.force;

	const children = readdirSync(opts.root, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();

	const outcomes = [];
	let guardBlocked = false;

	for (const name of children) {
		const dir = join(opts.root, name);
		const plan = migrateConfig(dir, { apply: false }); // classify without mutating
		const gs = gitState(dir);

		// Nothing to change.
		if (plan.action === "not-configured" || plan.action === "already-canonical") {
			outcomes.push({ path: dir, gitState: gs, outcome: plan.action, detail: "" });
			continue;
		}
		if (plan.action === "failed") {
			outcomes.push({ path: dir, gitState: gs, outcome: "failed", detail: plan.error ?? "error" });
			continue;
		}

		// plan.action deletes a legacy file → subject to the guards (applied in dry-run too so the
		// preview matches what --apply would do).
		if (gs === "dirty" && !opts.force) {
			outcomes.push({ path: dir, gitState: gs, outcome: "skipped", detail: "dirty; --force to include" });
			continue;
		}
		if (DELETES_LEGACY.has(plan.action) && blocks) {
			guardBlocked = true;
			outcomes.push({
				path: dir,
				gitState: gs,
				outcome: "skipped",
				detail: "ordering guard: legacy pi installed, shared-core absent; --force to override",
			});
			continue;
		}

		if (opts.apply) {
			const res = migrateConfig(dir, { apply: true });
			outcomes.push({ path: dir, gitState: gs, outcome: res.action, detail: res.error ?? "" });
		} else {
			outcomes.push({ path: dir, gitState: gs, outcome: plan.action, detail: "" });
		}
	}

	const anyFailed = outcomes.some((o) => o.outcome === "failed");
	return { outcomes, guardBlocked, exitCode: anyFailed || guardBlocked ? 1 : 0 };
}

// ─────────────────────────────────────────────────────────── reporting

const ACTION_LABEL = {
	migrated: "legacy → canonical, remove legacy",
	"redundant-legacy-removed": "canonical kept, remove legacy",
	"already-canonical": "",
	"not-configured": "",
	skipped: "",
	failed: "",
};

export function formatReport(opts, result) {
	const lines = [];
	lines.push(`checkpoint migrate-configs — root=${opts.root}${opts.apply ? "" : "  (dry-run)"}`);
	lines.push("");
	for (const o of result.outcomes) {
		const detail = o.detail || ACTION_LABEL[o.outcome] || "";
		lines.push(`  ${o.path.padEnd(48)} ${o.gitState.padEnd(8)} ${o.outcome.padEnd(24)} ${detail}`.trimEnd());
	}
	lines.push("");
	const counts = {};
	for (const o of result.outcomes) counts[o.outcome] = (counts[o.outcome] ?? 0) + 1;
	const order = ["migrated", "redundant-legacy-removed", "already-canonical", "not-configured", "skipped", "failed"];
	lines.push(`summary: ${order.filter((k) => counts[k]).map((k) => `${counts[k]} ${k}`).join(", ") || "nothing to migrate"}`);
	if (result.guardBlocked) {
		lines.push("");
		lines.push("note: legacy deletions were blocked by the pi ordering guard (install the shared-core pi adapter via scripts/install.mjs, or pass --force).");
	}
	return lines.join("\n");
}

// ─────────────────────────────────────────────────────────── argv / main

export function parseArgs(argv) {
	const opts = {
		root: dirname(REPO_ROOT),
		apply: false,
		force: false,
		piExtensions: join(homedir(), ".pi", "agent", "extensions"),
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case "-h":
			case "--help":
				return { help: true };
			case "--root":
				opts.root = resolve(argv[++i]);
				break;
			case "--apply":
				opts.apply = true;
				break;
			case "--force":
				opts.force = true;
				break;
			case "--pi-extensions":
				opts.piExtensions = resolve(argv[++i]);
				break;
			default:
				throw new UsageError(`unknown argument: ${arg}`);
		}
	}
	return { opts };
}

const USAGE = `Usage: node scripts/migrate-configs.mjs [flags]
  --root <path>            scan root (default: this repo's parent dir)
  --apply                  perform changes (default: dry-run)
  --force                  include dirty git repos AND override the pi ordering guard
  --pi-extensions <path>   dir checked by the ordering guard (default ~/.pi/agent/extensions)
  -h, --help               this help`;

function main() {
	let parsed;
	try {
		parsed = parseArgs(process.argv.slice(2));
	} catch (e) {
		console.error(e.message);
		console.error(USAGE);
		process.exit(2);
	}
	if (parsed.help) {
		console.log(USAGE);
		process.exit(0);
	}
	let result;
	try {
		result = run(parsed.opts);
	} catch (e) {
		console.error(e.message);
		process.exit(e instanceof UsageError ? 2 : 1);
	}
	console.log(formatReport(parsed.opts, result));
	process.exit(result.exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	main();
}
