import type { GitStatusSummary, RuntimeState } from "../src/types.ts";

// 固定本地时钟，让时间段及费用速率在不同时区也有可重复输出。
export const SCENARIO_NOW = new Date(2026, 0, 1, 12, 0, 0).getTime();

type Options = {
  git?: "clean" | "dirty" | "conflict" | "detached";
  cache?: "none" | "write" | "hit" | "miss";
  percent?: number;
  cost?: "known" | "unknown" | "mixed";
  ccs?: "ok" | "switching" | "exhausted";
  running?: boolean;
};

export function scenario(options: Options = {}) {
  const cache = options.cache ?? "hit";
  const usage = { input: cache === "hit" || cache === "write" ? 100 : 1000,
    output: 125, cacheRead: cache === "hit" ? 900 : 0, cacheWrite: cache === "write" ? 900 : 0,
    cost: { total: options.cost === "unknown" ? 0 : 1.25 } };
  const assistant = (at: number, data = usage) => ({
    type: "message", timestamp: new Date(at).toISOString(), message: {
      role: "assistant", model: "scenario-unpriced-model", usage: data,
    },
  });
  const entries = [
    { type: "message", timestamp: new Date(SCENARIO_NOW - 125_000).toISOString(), message: { role: "user" } },
    ...(cache === "miss" ? [assistant(SCENARIO_NOW - 100_000, { ...usage, cacheWrite: 900 })] : []),
    assistant(SCENARIO_NOW - 1000),
    ...(options.cost === "mixed" ? [assistant(SCENARIO_NOW, { ...usage, cost: { total: 0 } })] : []),
  ];
  const git: GitStatusSummary = {
    branch: options.git === "detached" ? undefined : "main", oid: "abcdef1234567890",
    ahead: options.git === "dirty" ? 2 : 0, behind: 0, staged: 0,
    modified: options.git === "dirty" ? 1 : 0, untracked: 0, conflicts: options.git === "conflict" ? 1 : 0,
  };
  const runtime: RuntimeState = {
    thinkingLevel: "medium", isStreaming: options.running ?? false, activeTools: new Map(), git,
    lastTurnMs: 125_000, turnStartedAt: options.running ? SCENARIO_NOW - 125_000 : undefined,
  };
  const ctx = {
    cwd: "/workspace/sample", model: { name: "Model", reasoning: true, contextWindow: 200000 },
    getContextUsage: () => ({ percent: options.percent ?? 62, tokens: 124000, contextWindow: 200000 }),
    sessionManager: { getEntries: () => entries, getBranch: () => entries, getSessionName: () => "sample" },
  };
  const statuses = new Map<string, string>();
  if (options.ccs) statuses.set("ccswitch-ha", options.ccs === "switching"
    ? "CCS v0.3.16 ↻2 provider/model"
    : options.ccs === "exhausted" ? "CCS v0.3.16 ⏸切换停止 provider/model"
      : "CCS v0.3.16 ✓3/5 · ⏳1 · ⛔0 · 🔄2 · provider/model");
  const footerData = { getGitBranch: () => git.branch ?? null, getExtensionStatuses: () => statuses };
  return { ctx, footerData, runtime };
}
