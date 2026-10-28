import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderFooter } from "../src/render.ts";
import { GLYPH_SETS, PRESETS } from "../src/types.ts";

const entries = [
  { type: "message", timestamp: "2026-01-01T00:00:00Z", message: { role: "user" } },
  { type: "message", timestamp: "2026-01-01T00:00:02Z", message: {
    role: "assistant", model: "review-model", usage: { input: 100, output: 100, cacheRead: 50 },
  } },
];
const ctx = {
  cwd: process.cwd(), model: { name: "Test", reasoning: true, contextWindow: 200000 },
  getContextUsage: () => ({ percent: 25, tokens: 50000, contextWindow: 200000 }),
  sessionManager: { getEntries: () => entries, getBranch: () => entries, getSessionName: () => "test" },
};
const runtime = { thinkingLevel: "medium", isStreaming: false, activeTools: new Map(), lastTurnMs: 4000 };

const ccsStatuses = [
  "CCS v0.3.16 ✓3/5 · ⏳1 · ⛔0 · 🔄2 · provider/model",
  "CCS v0.3.16 ↻2 provider/model",
  "CCS v0.3.16 ⏸切换停止 provider/model",
];

test("zen 即使保存 Nerd 字形，也不输出自身的图标或非 ASCII 文案", () => {
  for (const status of ccsStatuses) {
    const footerData = { getGitBranch: () => null, getExtensionStatuses: () => new Map([["ccswitch-ha", status]]) };
    const lines = renderFooter(500, ctx as never, {} as never, footerData as never, runtime, { preset: "zen", glyphs: "nerd" });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /CCS v0.3.16/);
    assert.match(lines[0], /^[\x20-\x7e]+$/);
    assert.equal(lines[0].includes("<>"), false);
  }
});

test("速度显示使用运行时记录的整轮耗时", () => {
  const footerData = { getGitBranch: () => null, getExtensionStatuses: () => new Map() };
  const lines = renderFooter(500, ctx as never, {} as never, footerData as never, runtime, { preset: "cometix", glyphs: "ascii" });
  assert.match(lines[1], /25 tok\/s/);
});

test("真实 TUI 列宽：全部预设与字形在窄窗口中不越界或截断 ANSI", () => {
  const wideCtx = { ...ctx, model: { ...ctx.model, name: "中文模型 👩‍💻 e\u0301 很长的名称" } };
  for (const preset of PRESETS) {
    for (const glyphs of GLYPH_SETS) {
      for (const width of [1, 2, 3, 4, 8, 15, 30, 60, 100, 160]) {
        for (const status of ccsStatuses) {
          const footerData = { getGitBranch: () => "feature/中文", getExtensionStatuses: () => new Map([["ccswitch-ha", status]]) };
          const lines = renderFooter(width, wideCtx as never, {} as never, footerData as never, runtime, { preset, glyphs });
          for (const line of lines) {
            assert.ok(visibleWidth(line) <= width, `${preset}/${glyphs}/${width}: ${visibleWidth(line)}`);
            assert.doesNotMatch(stripVTControlCharacters(line), /[\x00-\x1f\x7f-\x9f]/);
          }
        }
      }
    }
  }
});

test("只读取一次历史，不构建隐藏段，不将未知 Git 状态标为干净", () => {
  let reads = 0;
  const selectedCtx = { ...ctx, sessionManager: {
    getEntries: () => { reads++; return entries; },
    getBranch: () => entries,
    getSessionName: () => { throw new Error("隐藏 session 不应执行"); },
  } };
  const noGit = {
    getGitBranch: () => { throw new Error("隐藏 Git 不应执行"); },
    getExtensionStatuses: () => new Map(),
  };
  renderFooter(120, selectedCtx as never, {} as never, noGit as never, runtime, { preset: "zen", glyphs: "ascii" });
  assert.equal(reads, 1);
  reads = 0;
  const footerData = { ...noGit, getGitBranch: () => "main" };
  const lines = renderFooter(500, selectedCtx as never, {} as never, footerData as never, runtime, { preset: "cometix", glyphs: "nerd" });
  assert.equal(reads, 1);
  assert.doesNotMatch(stripVTControlCharacters(lines[0]), /main ✓/);
});

test("外部文本不能注入清屏或换行，扩展状态只保留 SGR 颜色", () => {
  const unsafe = "before\x1b[2J\x1b[H\n\t\x1b]0;bad-title\x07after";
  const unsafeCtx = { ...ctx, model: { ...ctx.model, name: unsafe } };
  const footerData = {
    getGitBranch: () => unsafe,
    getExtensionStatuses: () => new Map([["other", `\x1b[31m${unsafe}\x1b[0m`]]),
  };
  const lines = renderFooter(500, unsafeCtx as never, {} as never, footerData as never, runtime, { preset: "cometix", glyphs: "ascii" });
  for (const line of lines) {
    assert.doesNotMatch(line, /\x1b\[2J|\x1b\[H|\x1b\]|[\r\n\t\x07]/);
  }
  assert.match(lines.at(-1)!, /\x1b\[31m/);
});
