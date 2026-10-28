import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { findModelPricing } from "./pricing.ts";
import type { UsageSummary } from "./types.ts";

interface UsageLike {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cost?: { total?: number };
}

export function summarizeUsage(
  entries: readonly SessionEntry[],
  branch: readonly SessionEntry[] = entries,
): UsageSummary {
  const totals: UsageSummary = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };

  let calculatedCost = 0;
  let hasValidPrice = false;
  let hasUnpricedUsage = false;

  for (const entry of entries) {
    if (!totals.startedAt) {
      const started = Date.parse(entry.timestamp);
      if (!Number.isNaN(started)) totals.startedAt = started;
    }
    let usage: UsageLike | undefined;
    let modelId: string | undefined;

    if (entry.type === "message" && entry.message.role === "assistant") {
      usage = entry.message.usage;
      modelId = entry.message.model;
    } else if (entry.type === "message" && entry.message.role === "toolResult") {
      usage = entry.message.usage;
    } else if (entry.type === "compaction" || entry.type === "branch_summary" || entry.type === "usage") {
      usage = entry.usage;
    }
    if (!usage) continue;

    const inTokens = usage.input ?? 0;
    const outTokens = usage.output ?? 0;
    const rTokens = usage.cacheRead ?? 0;
    const wTokens = usage.cacheWrite ?? 0;

    totals.input += inTokens;
    totals.output += outTokens;
    totals.cacheRead += rTokens;
    totals.cacheWrite += wTokens;

    // 优先使用 API 返回的费用；零值可能是未配置定价的占位符。
    if (usage.cost?.total != null && Number.isFinite(usage.cost.total) && usage.cost.total > 0) {
      calculatedCost += usage.cost.total;
      hasValidPrice = true;
    } else {
      // 没有 API 费用时，尝试 CC Switch 的模型定价。
      const rates = findModelPricing(modelId);
      if (rates) {
        const itemCost =
          (inTokens * rates.input +
            outTokens * rates.output +
            rTokens * rates.cacheRead +
            wTokens * rates.cacheWrite) /
          1_000_000;
        calculatedCost += itemCost;
        hasValidPrice = true;
      } else if (inTokens + outTokens + rTokens + wTokens > 0) {
        hasUnpricedUsage = true;
      }
    }
  }

  // 最新请求指标只沿当前分支计算；累计消耗仍包含整个会话树。
  let cacheObserved = false;
  for (const entry of branch) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const usage = entry.message.usage;
    const cacheRead = usage?.cacheRead ?? 0;
    const cacheWrite = usage?.cacheWrite ?? 0;
    const promptTokens = (usage?.input ?? 0) + cacheRead + cacheWrite;
    if (totals.lastPromptTokens != null) totals.prevPromptTokens = totals.lastPromptTokens;
    totals.lastPromptTokens = promptTokens;
    totals.cacheHitRate = promptTokens > 0 && (cacheObserved || cacheRead > 0)
      ? (cacheRead / promptTokens) * 100
      : undefined;
    cacheObserved ||= cacheRead > 0 || cacheWrite > 0;
  }

  if (hasValidPrice && !hasUnpricedUsage) {
    totals.cost = calculatedCost;
    totals.hasPrice = true;
  }

  return totals;
}

export function formatCount(count: number): string {
  const abs = Math.abs(count);
  const sign = count < 0 ? "-" : "";
  if (abs < 1000) return `${sign}${abs}`;
  if (abs < 10_000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  if (abs < 1_000_000) return `${sign}${Math.round(abs / 1000)}k`;
  if (abs < 10_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  return `${sign}${Math.round(abs / 1_000_000)}M`;
}

export function formatDuration(ms: number, compact = false): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m${!compact && sec % 60 ? `${sec % 60}s` : ""}`;
  const hour = Math.floor(min / 60);
  return `${hour}h${min % 60 ? `${min % 60}m` : ""}`;
}

export function lastTurnDurationMs(entries: readonly SessionEntry[]): number | undefined {
  let lastUser: number | undefined;
  let duration: number | undefined;
  for (const entry of entries) {
    const ts = Date.parse(entry.timestamp);
    if (Number.isNaN(ts)) continue;
    if (entry.type === "message" && entry.message.role === "user") lastUser = ts;
    if (entry.type === "message" && entry.message.role === "assistant" && lastUser != null && ts >= lastUser) {
      duration = ts - lastUser;
    }
  }
  return duration;
}

export function lastTurnTps(entries: readonly SessionEntry[], durationMs?: number): number | undefined {
  let startedAt: number | undefined;
  let endedAt: number | undefined;
  let output = 0;
  for (const entry of entries) {
    const ts = Date.parse(entry.timestamp);
    if (!Number.isFinite(ts) || entry.type !== "message") continue;
    if (entry.message.role === "user") {
      startedAt = ts;
      endedAt = undefined;
      output = 0;
    } else if (entry.message.role === "assistant" && startedAt != null && ts >= startedAt) {
      output += entry.message.usage?.output ?? 0;
      endedAt = ts;
    }
  }
  if (startedAt == null || endedAt == null || output <= 0) return undefined;
  const seconds = (durationMs ?? (endedAt - startedAt)) / 1000;
  return seconds >= 0.2 ? output / seconds : undefined;
}

export function eighthsBar(percent: number, cells: number): string {
  const ratio = Math.max(0, Math.min(100, percent)) / 100;
  const exact = ratio * cells;
  const full = Math.min(cells, Math.floor(exact));
  const frac = exact - full;
  const partials = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
  const idx = Math.min(7, Math.round(frac * 8));
  let bar = "█".repeat(full);
  if (full < cells && idx > 0) bar += partials[idx];
  return bar.padEnd(cells, " ");
}
