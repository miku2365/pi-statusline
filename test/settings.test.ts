import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const directory = mkdtempSync(join(tmpdir(), "pi-statusline-settings-"));
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@earendil-works/pi-coding-agent") {
      return { shortCircuit: true, url: `data:text/javascript,${encodeURIComponent(`export const getAgentDir = () => ${JSON.stringify(directory)};`)}` };
    }
    return nextResolve(specifier, context);
  },
});
const { loadSettings, saveSettings, settingsPath } = await import("../src/settings.ts");
hooks.deregister();

test("配置缺失静默回退，损坏与无效字段给出诊断", () => {
  const notices: string[] = [];
  try {
    assert.deepEqual(loadSettings((message) => notices.push(message)), { preset: "cometix", glyphs: "nerd" });
    assert.equal(notices.length, 0);
    writeFileSync(settingsPath(), "{broken", "utf8");
    assert.equal(loadSettings((message) => notices.push(message)).preset, "cometix");
    assert.equal(notices.length, 1);
    writeFileSync(settingsPath(), JSON.stringify({ preset: "unknown", glyphs: "ascii" }));
    assert.deepEqual(loadSettings((message) => notices.push(message)), { preset: "cometix", glyphs: "ascii" });
    assert.equal(notices.length, 2);
  } finally { rmSync(settingsPath(), { force: true }); }
});

test("保存配置原子替换，失败后不遗留临时文件", () => {
  try {
    saveSettings({ preset: "zen", glyphs: "ascii" });
    assert.equal(JSON.parse(readFileSync(settingsPath(), "utf8")).preset, "zen");
    saveSettings({ preset: "focus", glyphs: "unicode" });
    assert.deepEqual(loadSettings(), { preset: "focus", glyphs: "unicode" });
    rmSync(settingsPath());
    mkdirSync(settingsPath());
    assert.throws(() => saveSettings({ preset: "zen", glyphs: "ascii" }));
    assert.deepEqual(readdirSync(directory), ["cometix-statusline.json"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
