import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { renderFooter } from "../src/render.ts";
import { summarizeUsage } from "../src/usage.ts";
import type { RuntimeState } from "../src/types.ts";

test("真实会话树切回旧分支：最近指标沿分支计算，累计费用及 R/W 保留全部消耗", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-01-01T00:00:00Z") });
  const manager = SessionManager.inMemory(process.cwd());
  const user = () => manager.appendMessage({ role: "user", content: "test", timestamp: Date.now() });
  const assistant = (input: number, output: number, cacheRead: number) => manager.appendMessage({
    role: "assistant", content: [{ type: "text", text: "ok" }],
    api: "openai-completions", provider: "test", model: "review-model",
    usage: { input, output, cacheRead, cacheWrite: 0, totalTokens: input + output + cacheRead,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 1 } },
    stopReason: "stop", timestamp: Date.now(),
  });
  user();
  t.mock.timers.tick(2000);
  assistant(100, 20, 400);
  t.mock.timers.tick(2000);
  const branchA = assistant(100, 20, 900);
  t.mock.timers.tick(6000);
  user();
  t.mock.timers.tick(10000);
  const branchB = assistant(100, 200, 0);
  const ctx = {
    cwd: process.cwd(), model: { name: "Test", contextWindow: 200000 }, sessionManager: manager,
    getContextUsage: () => ({ percent: 1, tokens: 100, contextWindow: 200000 }),
  };
  const footer = { getGitBranch: () => null, getExtensionStatuses: () => new Map() };
  const runtime: RuntimeState = { thinkingLevel: "off", isStreaming: false, activeTools: new Map() };
  const render = (preset: "cometix" | "dashboard") => renderFooter(500, ctx as never, {} as never,
    footer as never, runtime, { preset, glyphs: "ascii" }).map(stripVTControlCharacters);
  for (const [leaf, rate, duration, tps, trend] of [
    [branchA, 90, "4.0s", 10, "+500"],
    [branchB, 0, "10s", 20, "-900"],
    [branchA, 90, "4.0s", 10, "+500"],
  ] as const) {
    manager.branch(leaf);
    const usage = summarizeUsage(manager.getEntries(), manager.getBranch());
    assert.equal(usage.cost, 3);
    assert.equal(usage.cacheRead, 1300);
    assert.equal(usage.cacheHitRate, rate);
    const lines = render("cometix");
    assert.match(lines[0], new RegExp(`${rate}% hit / R1.3k W0`));
    assert.equal(lines[1], `${duration} | ${tps} tok/s`);
    const dashboard = render("dashboard");
    assert.ok(dashboard[1].includes(trend));
    assert.match(dashboard[2], /\$3\.00/);
  }
  // 累计树中已有缓存不应让另一个无缓存分支出现命中率。
  assert.equal(summarizeUsage(manager.getEntries(), []).cacheHitRate, undefined);
});
