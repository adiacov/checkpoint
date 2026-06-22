import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Global opt-in checkpoint extension.
 *
 * This extension is installed once in ~/.pi/agent/extensions, but it is inert for
 * a project until that project contains .pi/checkpoint.json with enabled=true.
 * The goal is to make end-of-session memory capture automatic without polluting
 * every repo the operator opens with pi.
 *
 * Design split:
 * - This extension captures raw session evidence into sessions/pending/.
 * - Project instructions such as AGENTS.md decide how an agent should curate
 *   those raw checkpoints into durable memory files, then archive them.
 */

type CheckpointConfig = {
	version: 1;
	enabled: boolean;
	pendingDir: string;
	archiveDir: string;
	includeReload: boolean;
	skipEmptySessions: boolean;
	maxArchivedCheckpoints: number;
	recentEntries: number;
	maxTextPerEntry: number;
	createdAt: string;
	updatedAt: string;
};

type ProjectContext = {
	cwd: string;
	root: string;
	configPath: string;
	config?: CheckpointConfig;
};

type ExecResult = {
	code: number;
	stdout: string;
	stderr: string;
};

const CONFIG_RELATIVE_PATH = path.join(".pi", "checkpoint.json");
const DEFAULT_RECENT_ENTRIES = 24;
const DEFAULT_MAX_TEXT_PER_ENTRY = 4000;
const DEFAULT_MAX_ARCHIVED_CHECKPOINTS = 50;
const MIN_SECONDS_BETWEEN_AUTOMATIC_CHECKPOINTS = 20;
const DEFAULT_CONFIG: Omit<CheckpointConfig, "createdAt" | "updatedAt"> = {
	version: 1,
	enabled: true,
	pendingDir: path.join("sessions", "pending"),
	archiveDir: path.join("sessions", "archive"),
	includeReload: false,
	skipEmptySessions: true,
	maxArchivedCheckpoints: DEFAULT_MAX_ARCHIVED_CHECKPOINTS,
	recentEntries: DEFAULT_RECENT_ENTRIES,
	maxTextPerEntry: DEFAULT_MAX_TEXT_PER_ENTRY,
};

let lastAutomaticCheckpoint: { root: string; reason: string; timeMs: number } | undefined;

export default function checkpointExtension(pi: ExtensionAPI) {
	pi.registerCommand("checkpoint-enable", {
		description: "Enable automatic raw session checkpoints for this project",
		handler: async (_args, ctx) => {
			const project = await detectProjectContext(pi, ctx.cwd);
			const now = new Date().toISOString();
			const existing = project.config;
			const config: CheckpointConfig = normalizeConfig({
				...DEFAULT_CONFIG,
				...existing,
				enabled: true,
				createdAt: existing?.createdAt ?? now,
				updatedAt: now,
			});

			writeConfig(project.configPath, config);
			ensureCheckpointDirs(project.root, config);
			const addedIgnoreRules = ensureGitIgnoreRules(project.root, config);
			ctx.ui.notify([
				"Checkpointing enabled for this project.",
				`Config: ${path.relative(project.root, project.configPath)}`,
				`Pending: ${config.pendingDir}`,
				`Archive: ${config.archiveDir}`,
				`Automatic reload checkpoints: ${config.includeReload ? "yes" : "no"}`,
				addedIgnoreRules.length > 0
					? `Added .gitignore rule(s): ${addedIgnoreRules.join(", ")}`
					: "Checkpoint .gitignore rules already present.",
			].join("\n"), "info");
		},
	});

	pi.registerCommand("checkpoint-disable", {
		description: "Disable automatic raw session checkpoints for this project",
		handler: async (_args, ctx) => {
			const project = await detectProjectContext(pi, ctx.cwd);
			if (!project.config) {
				ctx.ui.notify("Checkpointing is not enabled for this project.", "info");
				return;
			}

			const config = normalizeConfig({
				...project.config,
				enabled: false,
				updatedAt: new Date().toISOString(),
			});
			writeConfig(project.configPath, config);
			ctx.ui.notify(`Checkpointing disabled: ${path.relative(project.root, project.configPath)}`, "info");
		},
	});

	pi.registerCommand("checkpoint-status", {
		description: "Show checkpoint configuration and pending checkpoint count",
		handler: async (_args, ctx) => {
			const project = await detectProjectContext(pi, ctx.cwd);
			const config = project.config;
			if (!config) {
				ctx.ui.notify([
					"Checkpointing is not configured for this project.",
					`Project root: ${project.root}`,
					"Run /checkpoint-enable to opt in.",
				].join("\n"), "info");
				return;
			}

			ctx.ui.notify(formatStatus(project, config), config.enabled ? "info" : "error");
		},
	});

	pi.registerCommand("checkpoint", {
		description: "Write a manual raw session checkpoint if checkpointing is enabled",
		handler: async (_args, ctx) => {
			const project = await detectProjectContext(pi, ctx.cwd);
			if (!project.config?.enabled) {
				ctx.ui.notify("Checkpointing is disabled here. Run /checkpoint-enable first.", "error");
				return;
			}

			const file = await writeCheckpoint(pi, ctx, project, project.config, "manual");
			ctx.ui.notify(`Checkpoint written: ${path.relative(project.root, file)}`, "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		try {
			const project = await detectProjectContext(pi, ctx.cwd);
			if (!project.config?.enabled || !ctx.hasUI) return;

			pruneArchivedCheckpoints(project.root, project.config);
			const pending = countMarkdownFiles(path.join(project.root, project.config.pendingDir));
			if (pending > 0) {
				ctx.ui.notify(`${pending} pending checkpoint(s) need review in ${project.config.pendingDir}.`, "info");
			}
		} catch (error) {
			if (ctx.hasUI) ctx.ui.notify(`Checkpoint startup check failed: ${String(error)}`, "error");
		}
	});

	pi.on("session_shutdown", async (event, ctx) => {
		try {
			const project = await detectProjectContext(pi, ctx.cwd);
			const config = project.config;
			if (!config?.enabled) return;

			const reason = event.reason ?? "shutdown";
			if (reason === "reload" && !config.includeReload) return;
			if (config.skipEmptySessions && !hasUserMessage(ctx.sessionManager)) return;
			if (isDuplicateAutomaticCheckpoint(project.root, reason)) return;

			pruneArchivedCheckpoints(project.root, config);
			const file = await writeCheckpoint(pi, ctx, project, config, reason);
			markAutomaticCheckpoint(project.root, reason);
			if (ctx.hasUI) ctx.ui.notify(`Checkpoint written: ${path.relative(project.root, file)}`, "info");
		} catch (error) {
			if (ctx.hasUI) ctx.ui.notify(`Checkpoint failed: ${String(error)}`, "error");
		}
	});
}

async function detectProjectContext(pi: ExtensionAPI, cwd: string): Promise<ProjectContext> {
	const root = await detectGitRoot(pi) ?? cwd;
	const configPath = path.join(root, CONFIG_RELATIVE_PATH);
	return {
		cwd,
		root,
		configPath,
		config: readConfig(configPath),
	};
}

async function detectGitRoot(pi: ExtensionAPI) {
	const result = await pi.exec("git", ["rev-parse", "--show-toplevel"]);
	if (result.code !== 0) return undefined;
	return result.stdout.trim() || undefined;
}

function readConfig(configPath: string) {
	if (!existsSync(configPath)) return undefined;
	const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Partial<CheckpointConfig>;
	return normalizeConfig(parsed);
}

function normalizeConfig(config: Partial<CheckpointConfig>): CheckpointConfig {
	const now = new Date().toISOString();
	return {
		...DEFAULT_CONFIG,
		...config,
		version: 1,
		enabled: config.enabled === true,
		pendingDir: safeRelativeDir(config.pendingDir, DEFAULT_CONFIG.pendingDir),
		archiveDir: safeRelativeDir(config.archiveDir, DEFAULT_CONFIG.archiveDir),
		includeReload: config.includeReload === true,
		recentEntries: positiveInteger(config.recentEntries, DEFAULT_RECENT_ENTRIES),
		skipEmptySessions: config.skipEmptySessions !== false,
		maxArchivedCheckpoints: positiveInteger(config.maxArchivedCheckpoints, DEFAULT_MAX_ARCHIVED_CHECKPOINTS),
		maxTextPerEntry: positiveInteger(config.maxTextPerEntry, DEFAULT_MAX_TEXT_PER_ENTRY),
		createdAt: config.createdAt ?? now,
		updatedAt: config.updatedAt ?? now,
	};
}

function safeRelativeDir(value: unknown, fallback: string) {
	const raw = typeof value === "string" && value.trim() ? value.trim() : fallback;
	if (path.isAbsolute(raw) || raw.includes("..")) return fallback;
	return raw;
}

function positiveInteger(value: unknown, fallback: number) {
	return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function writeConfig(configPath: string, config: CheckpointConfig) {
	mkdirSync(path.dirname(configPath), { recursive: true });
	writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`, "utf8");
}

function ensureCheckpointDirs(root: string, config: CheckpointConfig) {
	mkdirSync(path.join(root, config.pendingDir), { recursive: true });
	mkdirSync(path.join(root, config.archiveDir), { recursive: true });
	ensureGitKeep(path.join(root, config.pendingDir));
	ensureGitKeep(path.join(root, config.archiveDir));
}

/**
 * Keep raw checkpoint markdown out of git while allowing .gitkeep files to be
 * tracked. This makes /checkpoint-enable establish the complete project
 * convention in one step: config, directories, and safe ignore rules.
 */
function ensureGitIgnoreRules(root: string, config: CheckpointConfig) {
	const gitignorePath = path.join(root, ".gitignore");
	const current = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
	const existingRules = new Set(current.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
	const requiredRules = [
		`${config.pendingDir.replace(/\\/g, "/")}/*.md`,
		`${config.archiveDir.replace(/\\/g, "/")}/*.md`,
	];
	const missingRules = requiredRules.filter((rule) => !existingRules.has(rule));

	if (missingRules.length === 0) return [];

	const prefix = current.length === 0 || current.endsWith("\n") ? "" : "\n";
	const section = [
		"# Raw pi checkpoint files",
		...missingRules,
	].join("\n");
	writeFileSync(gitignorePath, `${current}${prefix}${section}\n`, "utf8");
	return missingRules;
}

function ensureGitKeep(dir: string) {
	const file = path.join(dir, ".gitkeep");
	if (!existsSync(file)) writeFileSync(file, "", "utf8");
}

async function writeCheckpoint(pi: ExtensionAPI, ctx: any, project: ProjectContext, config: CheckpointConfig, reason: string) {
	ensureCheckpointDirs(project.root, config);

	const now = new Date();
	const stamp = now.toISOString().replace(/[:.]/g, "-");
	const safeReason = reason.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
	const file = path.join(project.root, config.pendingDir, `${stamp}-${safeReason}.md`);

	const body = [
		"# Pending Session Checkpoint",
		"",
		`Time: ${now.toISOString()}`,
		`Reason: ${reason}`,
		`Project root: ${project.root}`,
		`CWD: ${ctx.cwd}`,
		`Session file: ${ctx.sessionManager.getSessionFile?.() ?? "unknown"}`,
		"",
		"## Integration note",
		"",
		"This is raw session evidence, not durable memory.",
		"On the next session, review it and persist only important goals, decisions, current state, next actions, blockers, and durable realizations into the project's memory files.",
		`After integration, move this file to \`${config.archiveDir}/\` or otherwise mark it processed.`,
		"",
		"## Git facts",
		"",
		await gitFactsMarkdown(pi),
		"",
		"## Recent conversation",
		"",
		...getRecentMessageEntries(ctx.sessionManager, config.recentEntries).map((entry) => formatEntry(entry, config.maxTextPerEntry)),
		"",
	].join("\n");

	writeFileSync(file, body, "utf8");
	return file;
}

async function gitFactsMarkdown(pi: ExtensionAPI) {
	const [branch, status, diffStat, recentCommits] = await Promise.all([
		exec(pi, "git", ["branch", "--show-current"]),
		exec(pi, "git", ["status", "--short"]),
		exec(pi, "git", ["diff", "--stat"]),
		exec(pi, "git", ["log", "--oneline", "-5"]),
	]);

	return [
		`Branch: ${safeOutput(branch, "unknown") || "unknown"}`,
		"",
		"### Status",
		"",
		"```text",
		safeOutput(status, "git status unavailable") || "clean",
		"```",
		"",
		"### Diff stat",
		"",
		"```text",
		safeOutput(diffStat, "none") || "none",
		"```",
		"",
		"### Recent commits",
		"",
		"```text",
		safeOutput(recentCommits, "none") || "none",
		"```",
	].join("\n");
}

async function exec(pi: ExtensionAPI, command: string, args: string[]): Promise<ExecResult> {
	return await pi.exec(command, args);
}

function safeOutput(result: ExecResult, fallback: string) {
	if (result.code !== 0) return (result.stderr || fallback).trim();
	return result.stdout.trim();
}

function getRecentMessageEntries(sessionManager: any, count: number) {
	const branch = typeof sessionManager.getBranch === "function"
		? sessionManager.getBranch()
		: sessionManager.getEntries?.() ?? [];

	return branch
		.filter((entry: any) => entry.type === "message" && entry.message)
		.slice(-count);
}

function formatEntry(entry: any, maxText: number) {
	const message = entry.message;
	const role = message.role ?? "unknown";
	const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : entry.timestamp;
	const text = truncate(messageToText(message), maxText);

	return [`### ${role} — ${timestamp}`, "", text || "[no text content]", ""].join("\n");
}

function messageToText(message: any): string {
	if (typeof message.content === "string") return message.content;
	if (message.role === "bashExecution") return [`$ ${message.command}`, message.output].filter(Boolean).join("\n");
	if (!Array.isArray(message.content)) return JSON.stringify(message, null, 2);

	return message.content
		.map((block: any) => {
			if (block.type === "text") return block.text;
			if (block.type === "thinking") return "[thinking omitted]";
			if (block.type === "toolCall") return `[tool call: ${block.name}] ${JSON.stringify(block.arguments)}`;
			if (block.type === "image") return "[image omitted]";
			return `[${block.type ?? "unknown block"}]`;
		})
		.join("\n");
}

function truncate(text: string, max: number) {
	if (text.length <= max) return text;
	return `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]`;
}

function countMarkdownFiles(dir: string) {
	if (!existsSync(dir)) return 0;
	return readdirSync(dir).filter((name) => name.endsWith(".md")).length;
}

function pruneArchivedCheckpoints(root: string, config: CheckpointConfig) {
	const archiveDir = path.join(root, config.archiveDir);
	if (!existsSync(archiveDir)) return;

	const files = readdirSync(archiveDir)
		.filter((name) => name.endsWith(".md"))
		.sort();
	const excess = files.length - config.maxArchivedCheckpoints;
	if (excess <= 0) return;

	for (const name of files.slice(0, excess)) {
		try {
			unlinkSync(path.join(archiveDir, name));
		} catch {
			// Best-effort cleanup only. Checkpointing should not fail because pruning failed.
		}
	}
}

function hasUserMessage(sessionManager: any) {
	const branch = typeof sessionManager.getBranch === "function"
		? sessionManager.getBranch()
		: sessionManager.getEntries?.() ?? [];

	return branch.some((entry: any) => {
		const message = entry.message;
		return entry.type === "message" && message?.role === "user" && messageToText(message).trim().length > 0;
	});
}

function isDuplicateAutomaticCheckpoint(root: string, reason: string) {
	if (!lastAutomaticCheckpoint) return false;
	const elapsedSeconds = (Date.now() - lastAutomaticCheckpoint.timeMs) / 1000;
	return lastAutomaticCheckpoint.root === root
		&& lastAutomaticCheckpoint.reason === reason
		&& elapsedSeconds < MIN_SECONDS_BETWEEN_AUTOMATIC_CHECKPOINTS;
}

function markAutomaticCheckpoint(root: string, reason: string) {
	lastAutomaticCheckpoint = { root, reason, timeMs: Date.now() };
}

function formatStatus(project: ProjectContext, config: CheckpointConfig) {
	const pendingDir = path.join(project.root, config.pendingDir);
	const archiveDir = path.join(project.root, config.archiveDir);
	return [
		"checkpoint status",
		"",
		`Enabled: ${config.enabled ? "yes" : "no"}`,
		`Project root: ${project.root}`,
		`Config: ${path.relative(project.root, project.configPath)}`,
		`Pending dir: ${config.pendingDir}`,
		`Pending checkpoints: ${countMarkdownFiles(pendingDir)}`,
		`Archive dir: ${config.archiveDir}`,
		`Archived checkpoints: ${countMarkdownFiles(archiveDir)}`,
		`Include reload shutdowns: ${config.includeReload ? "yes" : "no"}`,
		`Recent entries: ${config.recentEntries}`,
		`Max text per entry: ${config.maxTextPerEntry}`,
	].join("\n");
}
