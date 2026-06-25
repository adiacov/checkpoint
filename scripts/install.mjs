#!/usr/bin/env node
// checkpoint install / distribution (feature 006)
//
// Installs each adapter from THIS repo into the location its agent loads from. The repo stays the
// single source of truth; agent dirs are install targets. Default mode is symlink-from-repo; copy is
// the fallback. This script contains NO checkpoint logic (Constitution I) — it only places/links
// files and wires the documented Codex `notify` line and the Claude local-marketplace registration.
//
// Usage: node scripts/install.mjs <install|uninstall|status> [flags]
//   --agent <claude|pi|codex|all>   default all (comma-separated or repeatable)
//   --mode <symlink|copy>           default symlink
//   --dry-run                       print the plan; change nothing
//   --force                         replace/remove user content at a target
//   --no-build                      skip building; require an existing dist/
//   --target-root <agent=path>      override an agent's target root (tests/advanced; repeatable)
//   -h, --help                      usage
//
// Exit codes: 0 success/dry-run/status · 1 any conflict(without --force)/failed · 2 usage error.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const AGENTS = ["pi", "claude", "codex"];
const CODEX_SENTINEL = "# checkpoint-managed (006) — do not edit this line";
const CLAUDE_MARKETPLACE = "checkpoint-local";
const CLAUDE_PLUGIN_KEY = "checkpoint@checkpoint-local";
const MANIFEST_VERSION = 1;

// ─────────────────────────────────────────────────────────── fs / path helpers

function lstatSafe(p) {
  try {
    return lstatSync(p);
  } catch {
    return null;
  }
}

function realpathSafe(p) {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
}

function readFileSafe(p) {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function readJsonSafe(p) {
  const text = readFileSafe(p);
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function removePath(p) {
  rmSync(p, { recursive: true, force: true });
}

function writeJson(p, obj) {
  ensureDir(dirname(p));
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
}

function rel(p) {
  const r = relative(REPO_ROOT, p);
  return r.startsWith("..") ? p : r;
}

// A symlink is "ours" when it resolves to something inside the repo.
function isRepoSymlink(target) {
  const st = lstatSafe(target);
  if (!st || !st.isSymbolicLink()) return false;
  const real = realpathSafe(target);
  return (
    real != null && (real === REPO_ROOT || real.startsWith(`${REPO_ROOT}/`))
  );
}

function newestMtime(p) {
  const st = lstatSafe(p);
  if (!st) return 0;
  if (!st.isDirectory()) return st.mtimeMs;
  let max = st.mtimeMs;
  for (const name of readdirSync(p)) {
    if (name === "node_modules" || name === "dist") continue;
    max = Math.max(max, newestMtime(join(p, name)));
  }
  return max;
}

function place(source, target, mode) {
  ensureDir(dirname(target));
  removePath(target);
  if (mode === "copy") {
    cpSync(source, target, { recursive: true });
  } else {
    symlinkSync(source, target);
  }
}

// Deep content equality (for copy-mode idempotency).
function treeEqual(source, target) {
  const a = lstatSafe(source);
  const b = lstatSafe(target);
  if (!a || !b) return false;
  if (a.isDirectory() !== b.isDirectory()) return false;
  if (!a.isDirectory()) return readFileSafe(source) === readFileSafe(target);
  const an = readdirSync(source).sort();
  const bn = readdirSync(target).sort();
  if (an.join("\0") !== bn.join("\0")) return false;
  return an.every((n) => treeEqual(join(source, n), join(target, n)));
}

// ─────────────────────────────────────────────────────────── manifest

function manifestPath(opts) {
  return join(opts.installDir ?? join(REPO_ROOT, ".install"), "manifest.json");
}

function readManifest(opts) {
  const obj = readJsonSafe(manifestPath(opts));
  if (!obj || !Array.isArray(obj.entries))
    return { version: MANIFEST_VERSION, entries: [] };
  return obj;
}

function writeManifest(opts, manifest) {
  writeJson(manifestPath(opts), manifest);
}

function record(manifest, entry) {
  const i = manifest.entries.findIndex(
    (e) => e.target === entry.target && e.marker === (entry.marker ?? null),
  );
  const full = {
    marker: null,
    installedAt: new Date().toISOString(),
    ...entry,
  };
  if (i >= 0) manifest.entries[i] = full;
  else manifest.entries.push(full);
}

function unrecord(manifest, target, marker = null) {
  manifest.entries = manifest.entries.filter(
    (e) => !(e.target === target && (e.marker ?? null) === marker),
  );
}

function findEntry(manifest, target, marker = null) {
  return manifest.entries.find(
    (e) => e.target === target && (e.marker ?? null) === marker,
  );
}

// ─────────────────────────────────────────────────────────── action helper

function action(agent, target, mode, act, detail, apply = null) {
  return { agent, target, mode, action: act, detail, apply };
}

// ─────────────────────────────────────────────────────────── build orchestration

function distExists(adapterDir) {
  return existsSync(join(adapterDir, "dist"));
}

// `extraSrcDirs` covers bundled-in sources whose changes are not visible in the adapter's own src/.
// The Claude adapter bundles @checkpoint/core into its dist, so a core-only edit must mark it stale.
function isStale(adapterDir, extraSrcDirs = []) {
  const dist = join(adapterDir, "dist");
  if (!existsSync(dist)) return true;
  const distMtime = newestMtime(dist);
  if (newestMtime(join(adapterDir, "src")) > distMtime) return true;
  return extraSrcDirs.some((dir) => newestMtime(dir) > distMtime);
}

function runBuild(adapterDir) {
  // Build the core first if its dist is stale, then the adapter.
  const core = join(REPO_ROOT, "core");
  if (isStale(core))
    execFileSync("npm", ["run", "build"], { cwd: core, stdio: "inherit" });
  execFileSync("npm", ["run", "build"], { cwd: adapterDir, stdio: "inherit" });
}

// Returns a build action to prepend, or null. Throws to mark the whole agent failed.
function planBuild(agent, adapterDir, opts, extraSrcDirs = []) {
  if (opts.build === false) {
    if (!distExists(adapterDir)) {
      throw new Error(
        `dist/ missing for ${agent}; build it or drop --no-build`,
      );
    }
    return null; // --no-build trusts an existing dist (no staleness check)
  }
  if (!isStale(adapterDir, extraSrcDirs)) return null;
  return action(
    agent,
    join(adapterDir, "dist"),
    "build",
    "build",
    "dist stale → npm run build",
    () => runBuild(adapterDir),
  );
}

// ─────────────────────────────────────────────────────────── generic placement

function planPlacement(agent, source, target, opts, manifest) {
  const mode = opts.mode;
  const st = lstatSafe(target);
  const entry = findEntry(manifest, target);
  const apply = () => {
    place(source, target, mode);
    record(manifest, {
      agent,
      type: mode === "symlink" ? "link" : "copy",
      target,
      mode,
    });
  };

  if (!st && !entry) {
    return action(agent, target, mode, "installed", `→ ${rel(source)}`, apply);
  }

  const ours = isRepoSymlink(target) || !!entry;
  if (!ours) {
    if (!opts.force) {
      return action(
        agent,
        target,
        mode,
        "conflict",
        "exists, not installed by checkpoint; --force to replace",
      );
    }
    return action(
      agent,
      target,
      mode,
      "updated",
      "replaced user content (--force)",
      apply,
    );
  }

  // Tool-managed already — is it already in the desired state for this mode?
  if (mode === "symlink") {
    if (
      st &&
      st.isSymbolicLink() &&
      realpathSafe(target) === realpathSafe(source)
    ) {
      return action(agent, target, mode, "no-op", "already linked");
    }
  } else if (st && !st.isSymbolicLink() && treeEqual(source, target)) {
    return action(agent, target, mode, "no-op", "copy up to date");
  }
  return action(agent, target, mode, "updated", "re-synced", apply);
}

function planUninstallPlacement(agent, target, manifest) {
  const st = lstatSafe(target);
  const entry = findEntry(manifest, target);
  if (!st && !entry)
    return action(agent, target, "-", "no-op", "nothing to remove");
  const ours = isRepoSymlink(target) || !!entry;
  if (!ours)
    return action(
      agent,
      target,
      "-",
      "no-op",
      "present but not installed by checkpoint; left intact",
    );
  return action(
    agent,
    target,
    entry?.mode ?? "symlink",
    "removed",
    "removed",
    () => {
      removePath(target);
      unrecord(manifest, target);
    },
  );
}

// ─────────────────────────────────────────────────────────── Codex notify (TOML)

function codexNotifyLine(repoRoot) {
  const bridge = join(repoRoot, "adapters", "codex", "dist", "index.js");
  return `notify = ["node", ${JSON.stringify(bridge)}, "notify"]`;
}

// Locate a managed block: the sentinel line immediately followed by a notify line.
function findManagedNotify(lines) {
  const idx = lines.findIndex((l) => l.trim() === CODEX_SENTINEL);
  if (idx < 0 || idx + 1 >= lines.length) return null;
  if (!/^\s*notify\s*=/.test(lines[idx + 1])) return null;
  return {
    sentinelIdx: idx,
    notifyIdx: idx + 1,
    current: lines[idx + 1].trim(),
  };
}

// A user notify lives before the first [table] header and is not the managed one.
function hasUserRootNotify(lines, managed) {
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) break; // first table header → end of root table
    if (managed && (i === managed.sentinelIdx || i === managed.notifyIdx))
      continue;
    if (/^\s*notify\s*=/.test(lines[i])) return i;
  }
  return -1;
}

export function applyCodexNotify(text, notifyLine, { force } = {}) {
  const had = text.length > 0;
  const lines = had ? text.split("\n") : [];
  const managed = findManagedNotify(lines);
  if (managed) {
    lines[managed.notifyIdx] = notifyLine;
    return lines.join("\n");
  }
  const userIdx = hasUserRootNotify(lines, null);
  if (userIdx >= 0 && force) lines.splice(userIdx, 1);
  const block = [CODEX_SENTINEL, notifyLine, ""];
  const out = [...block, ...lines].join("\n");
  return had && !out.endsWith("\n") ? `${out}\n` : out;
}

export function removeCodexNotify(text) {
  const lines = text.split("\n");
  const managed = findManagedNotify(lines);
  if (!managed) return { changed: false, text };
  // remove the sentinel + notify lines, plus the single blank separator our top-insert adds
  lines.splice(managed.sentinelIdx, 2);
  if (lines[managed.sentinelIdx] === "") lines.splice(managed.sentinelIdx, 1);
  return { changed: true, text: lines.join("\n") };
}

function planCodexNotify(ctx) {
  const cfg = join(ctx.roots.codex, "config.toml");
  const desired = codexNotifyLine(ctx.repoRoot);
  const text = readFileSafe(cfg) ?? "";
  const lines = text.length ? text.split("\n") : [];
  const managed = findManagedNotify(lines);
  if (managed) {
    if (managed.current === desired)
      return action("codex", cfg, "config", "no-op", "notify up to date");
    return action(
      "codex",
      cfg,
      "config",
      "updated",
      "updated notify path",
      () => {
        writeFileSync(
          cfg,
          applyCodexNotify(readFileSafe(cfg) ?? "", desired, {
            force: ctx.opts.force,
          }),
        );
        record(ctx.manifest, {
          agent: "codex",
          type: "config",
          target: cfg,
          marker: CODEX_SENTINEL,
        });
      },
    );
  }
  if (hasUserRootNotify(lines, null) >= 0 && !ctx.opts.force) {
    return action(
      "codex",
      cfg,
      "config",
      "conflict",
      "existing notify present; --force to override",
    );
  }
  return action("codex", cfg, "config", "installed", "added notify", () => {
    ensureDir(dirname(cfg));
    writeFileSync(
      cfg,
      applyCodexNotify(readFileSafe(cfg) ?? "", desired, {
        force: ctx.opts.force,
      }),
    );
    record(ctx.manifest, {
      agent: "codex",
      type: "config",
      target: cfg,
      marker: CODEX_SENTINEL,
    });
  });
}

function planUninstallCodexNotify(ctx) {
  const cfg = join(ctx.roots.codex, "config.toml");
  const text = readFileSafe(cfg);
  const entry = findEntry(ctx.manifest, cfg, CODEX_SENTINEL);
  if (text == null || !findManagedNotify(text.split("\n"))) {
    if (entry) unrecord(ctx.manifest, cfg, CODEX_SENTINEL);
    return action("codex", cfg, "config", "no-op", "no managed notify");
  }
  return action(
    "codex",
    cfg,
    "config",
    "removed",
    "removed managed notify",
    () => {
      const r = removeCodexNotify(readFileSafe(cfg) ?? "");
      writeFileSync(cfg, r.text);
      unrecord(ctx.manifest, cfg, CODEX_SENTINEL);
    },
  );
}

// ─────────────────────────────────────────────────────────── Claude plugin (via the claude CLI)

// Claude Code installs plugins through its own CLI (marketplace add + plugin install), which copies
// the plugin into ~/.claude/plugins/cache and registers it in installed_plugins.json. Hand-writing
// those files is version-fragile and doesn't actually load the plugin, so we drive the real CLI.
// The runner is injectable (`opts.claudeCli`) so tests never touch the real Claude install.
export function defaultClaudeCli(args) {
  try {
    const stdout = execFileSync("claude", ["plugin", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, missing: false, stdout, stderr: "" };
  } catch (e) {
    const missing = e.code === "ENOENT";
    return {
      ok: false,
      missing,
      stdout: e.stdout?.toString() ?? "",
      stderr: missing
        ? "`claude` CLI not found on PATH"
        : e.stderr?.toString() || e.message,
    };
  }
}

function oneLine(s) {
  return (s ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 200);
}

function planClaude(ctx) {
  const cli = ctx.opts.claudeCli ?? defaultClaudeCli;
  const acts = [];
  const build = planBuild(
    "claude",
    join(REPO_ROOT, "adapters", "claude-code"),
    ctx.opts,
    [join(REPO_ROOT, "core", "src")],
  );
  if (build) acts.push(build);

  const mkList = cli(["marketplace", "list"]);
  if (mkList.missing) {
    acts.push(
      action(
        "claude",
        "claude CLI",
        "claude",
        "failed",
        "`claude` not found on PATH — install Claude Code first",
      ),
    );
    return acts;
  }
  const hasMkt = mkList.stdout.includes(CLAUDE_MARKETPLACE);
  const hasPlugin = cli(["list"]).stdout.includes(CLAUDE_PLUGIN_KEY);

  acts.push(
    hasMkt
      ? action(
          "claude",
          CLAUDE_MARKETPLACE,
          "claude",
          "no-op",
          "marketplace registered",
        )
      : action(
          "claude",
          CLAUDE_MARKETPLACE,
          "claude",
          "installed",
          "claude plugin marketplace add",
          () => {
            const r = cli(["marketplace", "add", ctx.repoRoot]);
            if (!r.ok)
              throw new Error(`marketplace add failed: ${oneLine(r.stderr)}`);
          },
        ),
  );
  acts.push(
    hasPlugin
      ? action(
          "claude",
          CLAUDE_PLUGIN_KEY,
          "claude",
          "no-op",
          "plugin installed",
        )
      : action(
          "claude",
          CLAUDE_PLUGIN_KEY,
          "claude",
          "installed",
          "claude plugin install",
          () => {
            const r = cli(["install", CLAUDE_PLUGIN_KEY]);
            if (!r.ok)
              throw new Error(`plugin install failed: ${oneLine(r.stderr)}`);
            record(ctx.manifest, {
              agent: "claude",
              type: "plugin",
              target: CLAUDE_PLUGIN_KEY,
              marker: CLAUDE_MARKETPLACE,
            });
          },
        ),
  );
  return acts;
}

function planUninstallClaude(ctx) {
  const cli = ctx.opts.claudeCli ?? defaultClaudeCli;
  const acts = [];
  const mkList = cli(["marketplace", "list"]);
  if (mkList.missing) {
    acts.push(
      action(
        "claude",
        "claude CLI",
        "claude",
        "no-op",
        "`claude` not found on PATH — nothing to remove",
      ),
    );
    return acts;
  }
  const hasPlugin = cli(["list"]).stdout.includes(CLAUDE_PLUGIN_KEY);
  const hasMkt = mkList.stdout.includes(CLAUDE_MARKETPLACE);

  acts.push(
    hasPlugin
      ? action(
          "claude",
          CLAUDE_PLUGIN_KEY,
          "claude",
          "removed",
          "claude plugin uninstall",
          () => {
            const r = cli(["uninstall", CLAUDE_PLUGIN_KEY]);
            if (!r.ok)
              throw new Error(`plugin uninstall failed: ${oneLine(r.stderr)}`);
            unrecord(ctx.manifest, CLAUDE_PLUGIN_KEY, CLAUDE_MARKETPLACE);
          },
        )
      : action(
          "claude",
          CLAUDE_PLUGIN_KEY,
          "claude",
          "no-op",
          "plugin not installed",
        ),
  );
  acts.push(
    hasMkt
      ? action(
          "claude",
          CLAUDE_MARKETPLACE,
          "claude",
          "removed",
          "claude plugin marketplace remove",
          () => {
            const r = cli(["marketplace", "remove", CLAUDE_MARKETPLACE]);
            if (!r.ok)
              throw new Error(
                `marketplace remove failed: ${oneLine(r.stderr)}`,
              );
          },
        )
      : action(
          "claude",
          CLAUDE_MARKETPLACE,
          "claude",
          "no-op",
          "marketplace not registered",
        ),
  );
  return acts;
}

// ─────────────────────────────────────────────────────────── per-agent handlers

const HANDLERS = {
  pi: {
    dir: join(REPO_ROOT, "adapters", "pi"),
    planInstall(ctx) {
      const acts = [];
      const build = planBuild("pi", this.dir, ctx.opts);
      if (build) acts.push(build);
      const target = join(ctx.roots.pi, "checkpoint");
      acts.push(planPlacement("pi", this.dir, target, ctx.opts, ctx.manifest));
      // Legacy reference extension is user content — flag/replace it.
      const legacy = join(ctx.roots.pi, "checkpoint.ts");
      if (lstatSafe(legacy)) {
        if (ctx.opts.force) {
          acts.push(
            action(
              "pi",
              legacy,
              "-",
              "removed",
              "removed legacy reference (--force)",
              () => removePath(legacy),
            ),
          );
        } else {
          acts.push(
            action(
              "pi",
              legacy,
              "-",
              "conflict",
              "legacy reference present; --force to replace",
            ),
          );
        }
      }
      return acts;
    },
    planUninstall(ctx) {
      return [
        planUninstallPlacement(
          "pi",
          join(ctx.roots.pi, "checkpoint"),
          ctx.manifest,
        ),
      ];
    },
  },

  codex: {
    dir: join(REPO_ROOT, "adapters", "codex"),
    planInstall(ctx) {
      const acts = [];
      const build = planBuild("codex", this.dir, ctx.opts);
      if (build) acts.push(build);
      const promptsDir = join(this.dir, "prompts");
      for (const name of readdirSync(promptsDir)) {
        acts.push(
          planPlacement(
            "codex",
            join(promptsDir, name),
            join(ctx.roots.codex, "prompts", name),
            ctx.opts,
            ctx.manifest,
          ),
        );
      }
      acts.push(planCodexNotify(ctx));
      return acts;
    },
    planUninstall(ctx) {
      const acts = [];
      const promptsDir = join(this.dir, "prompts");
      for (const name of readdirSync(promptsDir)) {
        acts.push(
          planUninstallPlacement(
            "codex",
            join(ctx.roots.codex, "prompts", name),
            ctx.manifest,
          ),
        );
      }
      acts.push(planUninstallCodexNotify(ctx));
      return acts;
    },
  },

  claude: {
    dir: join(REPO_ROOT, "adapters", "claude-code"),
    planInstall(ctx) {
      return planClaude(ctx);
    },
    planUninstall(ctx) {
      return planUninstallClaude(ctx);
    },
  },
};

// ─────────────────────────────────────────────────────────── run / report

export function resolveTargetRoots(opts) {
  const home = opts.home ?? homedir();
  const def = {
    pi: join(home, ".pi", "agent", "extensions"),
    codex: join(home, ".codex"),
    claude: join(home, ".claude"),
  };
  return { ...def, ...(opts.targetRoots ?? {}) };
}

export async function run(opts) {
  const ctx = {
    repoRoot: REPO_ROOT,
    roots: resolveTargetRoots(opts),
    opts,
    manifest: readManifest(opts),
  };

  const actions = [];
  for (const agent of opts.agents) {
    try {
      const handler = HANDLERS[agent];
      if (opts.verb === "install") actions.push(...handler.planInstall(ctx));
      else if (opts.verb === "uninstall")
        actions.push(...handler.planUninstall(ctx));
      else actions.push(...statusActions(agent, ctx));
    } catch (e) {
      actions.push(action(agent, "-", "-", "failed", e.message));
    }
  }

  if (opts.verb !== "status" && !opts.dryRun) {
    const failedAgents = new Set();
    for (const a of actions) {
      if (failedAgents.has(a.agent) && a.action !== "build") {
        // a prior step for this agent failed → skip dependent steps
        if (["installed", "updated", "removed"].includes(a.action)) {
          a.action = "skipped";
          a.detail = "skipped (earlier step for this agent failed)";
        }
        continue;
      }
      if (
        a.apply &&
        ["installed", "updated", "removed", "build"].includes(a.action)
      ) {
        try {
          await a.apply();
        } catch (e) {
          a.action = "failed";
          a.detail = e.message;
          failedAgents.add(a.agent);
        }
      }
    }
    writeManifest(opts, ctx.manifest);
  }

  return { actions, exitCode: exitCodeFor(actions) };
}

function statusActions(agent, ctx) {
  const mine = ctx.manifest.entries.filter((e) => e.agent === agent);
  if (mine.length === 0)
    return [action(agent, "-", "-", "no-op", "not installed")];
  return mine.map((e) =>
    action(agent, e.target, e.mode ?? e.type, "no-op", `installed (${e.type})`),
  );
}

function exitCodeFor(actions) {
  return actions.some((a) => a.action === "conflict" || a.action === "failed")
    ? 1
    : 0;
}

export function formatReport(opts, actions) {
  const lines = [];
  const suffix = opts.dryRun ? "  (dry-run)" : "";
  lines.push(`checkpoint ${opts.verb} — mode=${opts.mode}${suffix}`);
  lines.push("");
  for (const a of actions) {
    lines.push(
      `  ${a.agent.padEnd(7)} ${String(a.target).padEnd(48)} ${String(a.mode).padEnd(8)} ${a.action.padEnd(10)} ${a.detail ?? ""}`.trimEnd(),
    );
  }
  lines.push("");
  const counts = {};
  for (const a of actions) counts[a.action] = (counts[a.action] ?? 0) + 1;
  const order = [
    "installed",
    "updated",
    "removed",
    "no-op",
    "skipped",
    "conflict",
    "failed",
    "build",
  ];
  lines.push(
    `summary: ${
      order
        .filter((k) => counts[k])
        .map((k) => `${counts[k]} ${k}`)
        .join(", ") || "nothing to do"
    }`,
  );
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────── argv parsing

export function parseArgs(argv) {
  const opts = {
    verb: null,
    agents: AGENTS.slice(),
    mode: "symlink",
    dryRun: false,
    force: false,
    build: true,
    targetRoots: {},
  };
  const agentSel = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (!arg.startsWith("--") && opts.verb === null) {
      opts.verb = arg;
      continue;
    }
    switch (arg) {
      case "--agent":
        agentSel.push(...argv[++i].split(","));
        break;
      case "--mode":
        opts.mode = argv[++i];
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--force":
        opts.force = true;
        break;
      case "--no-build":
        opts.build = false;
        break;
      case "--target-root": {
        const [a, ...rest] = argv[++i].split("=");
        opts.targetRoots[a] = rest.join("=");
        break;
      }
      default:
        throw new UsageError(`unknown argument: ${arg}`);
    }
  }
  if (!["install", "uninstall", "status"].includes(opts.verb)) {
    throw new UsageError(
      `expected verb install|uninstall|status, got: ${opts.verb ?? "(none)"}`,
    );
  }
  if (!["symlink", "copy"].includes(opts.mode))
    throw new UsageError(`bad --mode: ${opts.mode}`);
  if (agentSel.length) {
    const sel = agentSel.includes("all") ? AGENTS.slice() : agentSel;
    for (const a of sel)
      if (!AGENTS.includes(a)) throw new UsageError(`unknown agent: ${a}`);
    opts.agents = AGENTS.filter((a) => sel.includes(a));
  }
  return { opts };
}

class UsageError extends Error {}

const USAGE = `Usage: node scripts/install.mjs <install|uninstall|status> [flags]
  --agent <claude|pi|codex|all>   default all
  --mode <symlink|copy>           default symlink
  --dry-run                       print the plan; change nothing
  --force                         replace/remove user content at a target
  --no-build                      skip building; require an existing dist/
  --target-root <agent=path>      override an agent's target root
  -h, --help                      this help`;

async function main() {
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
  const { actions, exitCode } = await run(parsed.opts);
  console.log(formatReport(parsed.opts, actions));
  process.exit(exitCode);
}

if (
  process.argv[1] &&
  realpathSafe(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
