import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GitStatusSummary } from "./types.ts";

const GIT_TIMEOUT_MS = 800;

export function hasGitDir(cwd: string): boolean {
  const gitDir = process.env.GIT_DIR;
  if (gitDir) return existsSync(gitDir);
  let dir = cwd;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

export async function readGitStatus(
  pi: ExtensionAPI,
  cwd: string,
  signal?: AbortSignal,
): Promise<GitStatusSummary | undefined> {
  if (!hasGitDir(cwd)) return undefined;
  const result = await pi.exec(
    "git",
    ["--no-optional-locks", "-c", "core.quotePath=false", "status", "--porcelain=v2", "--branch"],
    { cwd, timeout: GIT_TIMEOUT_MS, signal },
  );
  if (result.code !== 0 || result.killed) return undefined;
  return parseGitStatusPorcelain(result.stdout);
}

/** CCometixLine `git status --porcelain=v2 --branch`. */
export function parseGitStatusPorcelain(output: string): GitStatusSummary {
  const summary: GitStatusSummary = {
    ahead: 0,
    behind: 0,
    staged: 0,
    modified: 0,
    untracked: 0,
    conflicts: 0,
  };
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("# ")) {
      const header = line.slice(2);
      const space = header.indexOf(" ");
      const key = space === -1 ? header : header.slice(0, space);
      const value = space === -1 ? "" : header.slice(space + 1);
      if (key === "branch.oid" && value !== "(initial)") summary.oid = value;
      if (key === "branch.head" && value !== "(detached)") summary.branch = value;
      if (key === "branch.ab") {
        for (const part of value.split(/\s+/)) {
          if (part.startsWith("+")) summary.ahead = Number(part.slice(1)) || 0;
          if (part.startsWith("-")) summary.behind = Number(part.slice(1)) || 0;
        }
      }
      continue;
    }
    const fields = line.split(" ");
    const kind = fields[0];
    if (kind === "1" || kind === "2") {
      const xy = fields[1] ?? "..";
      if (xy[0] && xy[0] !== ".") summary.staged += 1;
      if (xy[1] && xy[1] !== ".") summary.modified += 1;
      continue;
    }
    if (kind === "u") {
      summary.conflicts += 1;
      continue;
    }
    if (kind === "?") summary.untracked += 1;
  }
  return summary;
}

export function gitIsDirty(git: GitStatusSummary): boolean {
  return git.staged + git.modified + git.untracked + git.conflicts > 0;
}

export function gitSummariesEqual(a?: GitStatusSummary, b?: GitStatusSummary): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.branch === b.branch &&
    a.oid === b.oid &&
    a.ahead === b.ahead &&
    a.behind === b.behind &&
    a.staged === b.staged &&
    a.modified === b.modified &&
    a.untracked === b.untracked &&
    a.conflicts === b.conflicts
  );
}
