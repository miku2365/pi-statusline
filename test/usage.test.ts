import assert from "node:assert/strict";
import { test } from "node:test";
import { usablePricing } from "../src/pricing.ts";
import { eighthsBar, formatCount, formatDuration, lastTurnDurationMs, lastTurnTps, summarizeUsage } from "../src/usage.ts";
import { PRESET_LAYOUTS } from "../src/types.ts";

test("eighths bar fills and pads to cell count", () => {
  assert.equal(eighthsBar(0, 10).length, 10);
  assert.equal(eighthsBar(100, 10), "██████████");
  assert.equal(eighthsBar(50, 10)[0], "█");
  assert.equal(eighthsBar(50, 10).length, 10);
});

test("formatDuration compact labels", () => {
  assert.equal(formatDuration(1500), "1s");
  assert.equal(formatDuration(125_000), "2m5s");
  assert.equal(formatDuration(125_000, true), "2m");
  assert.equal(formatDuration(90_000), "1m30s");
  assert.equal(formatDuration(120_000), "2m");
  assert.equal(formatDuration(7_200_000), "2h");
  assert.equal(formatDuration(3_700_000), "1h1m");
});

test("formatCount keeps a minus sign", () => {
  assert.equal(formatCount(-1200), "-1.2k");
});

test("lastTurnDurationMs is last user to last assistant", () => {
  const entries = [
    { type: "message", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user" } },
    { type: "message", timestamp: "2026-01-01T00:00:06.200Z", message: { role: "assistant" } },
  ];
  assert.equal(lastTurnDurationMs(entries as never), 6200);
});

test("lastTurnTps is output tokens over wall time", () => {
  const entries = [
    { type: "message", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user" } },
    {
      type: "message",
      timestamp: "2026-01-01T00:00:02.000Z",
      message: { role: "assistant", usage: { output: 100 } },
    },
  ];
  assert.equal(Math.round(lastTurnTps(entries as never)!), 50);
});

test("混合模型有未知费用时不显示部分累计", () => {
  const entries = [
    { type: "message", timestamp: "2026-01-01T00:00:01Z", message: {
      role: "assistant", model: "review-priced", usage: { output: 10, cost: { total: 1 } },
    } },
    { type: "message", timestamp: "2026-01-01T00:00:02Z", message: {
      role: "assistant", model: "review-unknown-model", usage: { output: 100 },
    } },
  ];
  assert.equal(summarizeUsage(entries as never).cost, undefined);
  assert.equal(summarizeUsage(entries as never).hasPrice, undefined);
  assert.equal(summarizeUsage(entries.slice(0, 1) as never).cost, 1);
  const empty = { ...entries[1], message: { ...entries[1].message, usage: { output: 0 } } };
  assert.equal(summarizeUsage([entries[0], empty] as never).cost, 1);
});

test("多段响应按整轮输出和墙钟计速，元数据不改变计时", () => {
  const entries = [
    { type: "message", timestamp: "2026-01-01T00:00:00Z", message: { role: "user" } },
    { type: "message", timestamp: "2026-01-01T00:00:02Z", message: { role: "assistant", usage: { output: 100 } } },
    { type: "message", timestamp: "2026-01-01T00:00:10Z", message: { role: "toolResult" } },
    { type: "custom", timestamp: "2026-01-01T00:00:11Z" },
    { type: "message", timestamp: "2026-01-01T00:00:12Z", message: { role: "assistant", usage: { output: 100 } } },
  ];
  assert.equal(lastTurnTps(entries as never), 200 / 12);
  assert.equal(lastTurnTps(entries as never, 20_000), 10);
  assert.equal(lastTurnTps(entries as never, 0), undefined);
  const nextUser = { type: "message", timestamp: "2026-01-01T00:00:13Z", message: { role: "user" } };
  assert.equal(lastTurnTps([...entries, nextUser] as never), undefined);
});

test("缓存首次写入不显示命中率，无缓存不显示零命中率", () => {
  const assistant = (usage: object) => ({ type: "message", timestamp: "2026-01-01T00:00:01Z", message: {
    role: "assistant", model: "review-model", usage,
  } });
  const first = assistant({ input: 100, output: 10, cacheWrite: 900 });
  const initial = summarizeUsage([first] as never);
  assert.equal(initial.cacheWrite, 900);
  assert.equal(initial.cacheHitRate, undefined);
  assert.equal(summarizeUsage([assistant({ input: 100 }), first] as never).cacheHitRate, undefined);
  assert.equal(summarizeUsage([assistant({ input: 100 }), first, assistant({ input: 100 })] as never).cacheHitRate, 0);
  assert.equal(summarizeUsage([assistant({ input: 100 })] as never).cacheHitRate, undefined);
  assert.equal(summarizeUsage([first, assistant({ input: 100, cacheRead: 900 })] as never).cacheHitRate, 90);
  assert.equal(summarizeUsage([first, assistant({ input: 100 })] as never).cacheHitRate, 0);
  // 重载时只有一条读取缓存的记录，也应展示真实命中率。
  assert.equal(summarizeUsage([assistant({ input: 100, cacheRead: 900 })] as never).cacheHitRate, 90);
});

test("cometix is two lines: classic + duration/tps", () => {
  assert.deepEqual(PRESET_LAYOUTS.cometix.lines, [
    ["model", "dir", "git", "context", "cache"],
    ["duration", "tps"],
  ]);
});

test("dashboard/budget/cache-aware/focus are multi-line", () => {
  assert.equal(PRESET_LAYOUTS.dashboard.lines.length, 3);
  assert.equal(PRESET_LAYOUTS.budget.lines.length, 2);
  assert.equal(PRESET_LAYOUTS["cache-aware"].lines.length, 2);
  assert.equal(PRESET_LAYOUTS.focus.lines.length, 2);
  assert.equal(PRESET_LAYOUTS.powerline.lines.length, 2);
});

test("all-zero pricing is treated as missing", () => {
  assert.equal(
    usablePricing({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }),
    undefined,
  );
  assert.equal(usablePricing({ input: 3, output: 0, cacheRead: 0, cacheWrite: 0 })?.input, 3);
  assert.equal(usablePricing({ input: Infinity, output: 1, cacheRead: 0, cacheWrite: 0 }), undefined);
  assert.equal(usablePricing({ input: -1, output: 1, cacheRead: 0, cacheWrite: 0 }), undefined);
});
