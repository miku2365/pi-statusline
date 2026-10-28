import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCcSwitch, parseCcSwitchStatus } from "../src/ccswitch.ts";
import { GLYPHS } from "../src/glyphs.ts";

const nerd = {
  health: GLYPHS.nerd.ccswitchHealth,
  cooling: GLYPHS.nerd.ccswitchCooling,
  disabled: GLYPHS.nerd.ccswitchDisabled,
  switches: GLYPHS.nerd.ccswitchSwitches,
};

test("parses the steady CCSwitch status line", () => {
  const view = parseCcSwitchStatus("CCS v0.3.16 ✓3/5 · ⏳1 · ⛔0 · 🔄2 · ugq-codex/gpt-5.6-sol");
  assert.equal(view?.phase, "ok");
  assert.equal(view?.version, "0.3.16");
  assert.equal(view?.healthy, 3);
  assert.equal(view?.cooling, 1);
  assert.equal(view?.disabled, 0);
  assert.equal(view?.switches, 2);
  assert.equal(
    formatCcSwitch(view!, nerd).full,
    `CCS v0.3.16 · ugq-codex | ${nerd.health} 3/5 ${nerd.cooling} 1/${nerd.disabled} 0/${nerd.switches} 2`,
  );
  assert.equal(formatCcSwitch(view!, nerd).compact, `${nerd.health} 3/5`);
});

test("parses switching and exhausted lines, and ignores ANSI", () => {
  const switching = parseCcSwitchStatus("\u001b[32mCCS v0.3.16 ↻2 ugq-grok/grok-4.6\u001b[0m");
  assert.equal(switching?.phase, "switching");
  assert.equal(
    formatCcSwitch(switching!, nerd).full,
    `CCS v0.3.16 · ugq-grok | ${nerd.health} ↻2 ${nerd.cooling} 0/${nerd.disabled} 0/${nerd.switches} 0`,
  );
  assert.equal(parseCcSwitchStatus("CCS v0.3.16 ⏸切换停止 ugq-codex/gpt-5.6-sol")?.phase, "exhausted");
  assert.equal(parseCcSwitchStatus(undefined), undefined);
});
