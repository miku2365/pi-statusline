import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_SETTINGS,
  GLYPH_SETS,
  type GlyphSet,
  PRESETS,
  type PresetName,
  type StatuslineSettings,
} from "./types.ts";

export function settingsPath(): string {
  return join(getAgentDir(), "cometix-statusline.json");
}

export function loadSettings(report?: (message: string) => void): StatuslineSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(settingsPath(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      report?.(`状态栏配置读取失败，使用默认值：${error instanceof Error ? error.message : String(error)}`);
    }
    return { ...DEFAULT_SETTINGS };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    report?.("状态栏配置必须是 JSON 对象，使用默认值");
    return { ...DEFAULT_SETTINGS };
  }
  const raw = parsed as Partial<StatuslineSettings>;
  if ((raw.preset !== undefined && !isPreset(raw.preset)) ||
      (raw.glyphs !== undefined && !isGlyphs(raw.glyphs))) {
    report?.("状态栏配置的 preset 或 glyphs 无效，对应字段使用默认值");
  }
  return {
    preset: isPreset(raw.preset) ? raw.preset : DEFAULT_SETTINGS.preset,
    glyphs: isGlyphs(raw.glyphs) ? raw.glyphs : DEFAULT_SETTINGS.glyphs,
  };
}

export function saveSettings(settings: StatuslineSettings): void {
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    renameSync(tmp, path);
  } finally {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // 清理失败不能覆盖原始保存错误。
    }
  }
}

function isPreset(value: unknown): value is PresetName {
  return typeof value === "string" && (PRESETS as readonly string[]).includes(value);
}

function isGlyphs(value: unknown): value is GlyphSet {
  return typeof value === "string" && (GLYPH_SETS as readonly string[]).includes(value);
}
