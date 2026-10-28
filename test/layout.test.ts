import assert from "node:assert/strict";
import { test } from "node:test";
import { formatLayoutReport, planFit, pickFitted, type FitItem } from "../src/layout.ts";
import { DROP_PRIORITY, type SegmentName } from "../src/types.ts";

function item(name: SegmentName, full: string, compact = full): FitItem {
  return { name, full, compact, priority: DROP_PRIORITY[name] };
}

function fit(items: FitItem[], width: number) {
  return pickFitted(items, width, " | ", (text) => text.length);
}

test("三级文案按低优先级逐级收缩，再隐藏，诊断与结果一致", () => {
  const items: FitItem[] = [
    { name: "context", full: "ctx 62%", compact: "ctx62%", minimal: "62%", priority: 120 },
    { name: "git", full: "main ● ↑2", compact: "main*", minimal: "main", priority: 100 },
  ];
  const plan = (width: number) => planFit(items, width, " | ", (text) => text.length);
  assert.equal(plan(17).items[1].level, "compact");
  assert.equal(plan(14).items[1].level, "minimal");
  const small = plan(13);
  assert.deepEqual(small.items.map((item) => item.text), ["ctx 62%"]);
  assert.deepEqual(small.steps.map((step) => step.to), ["compact", "minimal", "hidden"]);
  assert.equal(small.naturalWidth, 19);
  assert.deepEqual(plan(3).items.map((item) => item.text), ["62%"]);
  const report = formatLayoutReport({ width: 13, lines: [
    { line: 1, naturalWidth: small.naturalWidth, renderedWidth: 7, steps: small.steps },
  ] });
  assert.match(report[0], /13 列/);
  assert.match(report[1], /git 完整→紧凑；git 紧凑→最小；git 最小→隐藏/);
  assert.equal(items[1].full, "main ● ↑2");
});

test("keeps all segments when they fit", () => {
  const fitted = fit([item("model", "Sonnet"), item("dir", "repo"), item("git", "main ✓")], 40);
  assert.deepEqual(
    fitted.map((part) => part.text),
    ["Sonnet", "repo", "main ✓"],
  );
});

test("drops lowest-priority segment before truncating important ones", () => {
  const fitted = fit(
    [item("model", "Sonnet-4-6-long"), item("dir", "pretty-long-directory"), item("time", "16:42")],
    28,
  );
  assert.equal(
    fitted.some((part) => part.name === "time"),
    false,
  );
  assert.equal(
    fitted.some((part) => part.name === "model"),
    true,
  );
});

test("uses compact text before dropping", () => {
  const fitted = fit([item("context", "42.1% ████░░░░ · 84k/200k", "42%"), item("model", "Sonnet")], 20);
  const context = fitted.find((part) => part.name === "context");
  assert.equal(context?.text, "42%");
});
