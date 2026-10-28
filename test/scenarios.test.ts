import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { renderFooter } from "../src/render.ts";
import { formatLayoutReport } from "../src/layout.ts";
import { PRESETS, type PresetName } from "../src/types.ts";
import { scenario, SCENARIO_NOW } from "./scenarios.ts";

function render(s: ReturnType<typeof scenario>, preset: PresetName, width = 240, glyphs: "ascii" | "nerd" = "ascii") {
  return renderFooter(width, s.ctx as never, {} as never, s.footerData as never, s.runtime, { preset, glyphs });
}

const expected: Record<PresetName, string[]> = {
  cometix: ["Model / Med | sample | main ok | 62% / 124k/200k tokens | 90% hit / R900 W0", "2m5s | 1 tok/s"],
  dashboard: ["Model / Med | sample | main ok", "######+    62% | ~ +/-0 | 90% hit / R900 W0", "# sample / 2m5s | $1.25"],
  budget: ["$1.25 | $36.00/h | 12:00", "62% / 124k/200k tokens | 90% hit / R900 W0"],
  "cache-aware": ["Model / Med | sample | main ok | 62% / 124k/200k tokens", "90% hit / R900 W0 | $36.00/h"],
  focus: ["############+        62%", "Model / Med | ~ +/-0 | 90% hit / R900 W0"],
  minimal: ["Model / Med / 62% / 124k/200k tokens / 90% hit / R900 W0 / $1.25"],
  powerline: [" Model / Med > sample > main ok > 62% / 124k/200k tokens > 90% hit / R900 W0 >", " 2m5s > 1 tok/s >"],
  zen: ["Model / Med | 62% / 124k/200k tokens | 90% hit / R900 W0 | $1.25"],
};

test("固定正常场景：八套预设的完整文本快照", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: SCENARIO_NOW });
  for (const preset of PRESETS) assert.deepEqual(render(scenario(), preset).map(stripVTControlCharacters), expected[preset], preset);
});

test("Git、缓存和费用场景保留各自语义", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: SCENARIO_NOW });
  for (const [git, value] of [["clean", "main ok"], ["dirty", "main * +2"], ["conflict", "main !"], ["detached", "@abcdef1 ok"]] as const) {
    assert.ok(stripVTControlCharacters(render(scenario({ git }), "cometix")[0]).includes(value));
  }
  const write = stripVTControlCharacters(render(scenario({ cache: "write" }), "cometix")[0]);
  assert.match(write, /R0 W900/);
  assert.doesNotMatch(write, /hit/);
  const none = stripVTControlCharacters(render(scenario({ cache: "none" }), "cometix")[0]);
  assert.doesNotMatch(none, /hit|R0 W0/);
  assert.match(stripVTControlCharacters(render(scenario({ cache: "miss" }), "cometix")[0]), /0% hit/);
  for (const cost of ["unknown", "mixed"] as const) {
    assert.equal(stripVTControlCharacters(render(scenario({ cost }), "budget")[0]), "$-.-- | 12:00");
  }
});

test("Powerline 告警覆盖背景及相邻箭头，plain 使用相同阈值", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: SCENARIO_NOW });
  assert.doesNotMatch(render(scenario({ percent: 69 }), "powerline")[0], /\x1b\[48;5;[13]m/);
  assert.match(render(scenario({ percent: 70 }), "powerline")[0], /\x1b\[48;5;3m/);
  assert.match(render(scenario({ percent: 90 }), "powerline")[0], /\x1b\[48;5;1m\x1b\[38;5;15m 90%/);
  assert.match(render(scenario({ git: "conflict" }), "powerline")[0], /\x1b\[48;5;1m\x1b\[38;5;15m main !/);
  assert.match(render(scenario({ percent: 90 }), "cometix")[0], /\x1b\[38;5;1m90%/);
  assert.match(render(scenario({ ccs: "ok" }), "powerline")[1], /\x1b\[48;5;3m/);
  assert.match(render(scenario({ ccs: "exhausted" }), "powerline")[1], /\x1b\[48;5;1m/);
});

test("布局报告是实际最近帧，收缩不增加行数，整轮耗时保留秒", (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: SCENARIO_NOW });
  for (const running of [false, true]) {
    const s = scenario({ running });
    assert.match(stripVTControlCharacters(render(s, "cometix")[1]), /2m5s/);
    const lines = render(s, "cometix", 35, "nerd");
    assert.equal(lines.length, 2);
    assert.equal(s.runtime.layout?.width, 35);
    assert.ok(s.runtime.layout!.lines[0].steps.length > 0);
    assert.match(formatLayoutReport(s.runtime.layout).join("\n"), /完整→|紧凑→|最小→/);
    render(s, "cometix", 240);
    assert.ok(s.runtime.layout!.lines.every((line) => line.steps.length === 0));
  }
});
