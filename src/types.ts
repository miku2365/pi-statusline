import type { FooterLayoutReport } from "./layout.ts";

export const PRESETS = [
  "cometix",
  "dashboard",
  "budget",
  "cache-aware",
  "focus",
  "minimal",
  "powerline",
  "zen",
] as const;
export type PresetName = (typeof PRESETS)[number];

export const GLYPH_SETS = ["nerd", "unicode", "ascii"] as const;
export type GlyphSet = (typeof GLYPH_SETS)[number];

export type SegmentName =
  | "model"
  | "dir"
  | "git"
  | "context"
  | "context.trend"
  | "context.bar"
  | "cache"
  | "cost"
  | "cost.rate"
  | "activity"
  | "session"
  | "duration"
  | "tps"
  | "time"
  | "ccswitch";

export type Skin = "plain" | "powerline";

export interface StatuslineSettings {
  preset: PresetName;
  glyphs: GlyphSet;
}

export interface Preset {
  name: PresetName;
  summary: string;
  skin: Skin;
  color: boolean;
  icons: boolean;
  separator: string;
  glyphs: GlyphSet;
  lines: SegmentName[][];
}

export interface GitStatusSummary {
  branch?: string;
  oid?: string;
  ahead: number;
  behind: number;
  staged: number;
  modified: number;
  untracked: number;
  conflicts: number;
}

export interface UsageSummary {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost?: number;
  hasPrice?: boolean;
  cacheHitRate?: number;
  lastPromptTokens?: number;
  prevPromptTokens?: number;
  startedAt?: number;
}

export interface RuntimeState {
  thinkingLevel: string;
  isStreaming: boolean;
  activeTools: Map<string, number>;
  git?: GitStatusSummary;
  turnStartedAt?: number;
  lastTurnMs?: number;
  requestRender?: () => void;
  layout?: FooterLayoutReport;
}

export const DEFAULT_SETTINGS: StatuslineSettings = {
  preset: "cometix",
  glyphs: "nerd",
};

export const PRESET_LAYOUTS: Record<PresetName, Preset> = {
  cometix: {
    name: "cometix",
    summary: "2 行：经典主行 + 轮次耗时/速度",
    skin: "plain",
    color: true,
    icons: true,
    separator: " | ",
    glyphs: "nerd",
    lines: [
      ["model", "dir", "git", "context", "cache"],
      ["duration", "tps"],
    ],
  },
  dashboard: {
    name: "dashboard",
    summary: "3 行面板：身份/Git、上下文条/趋势/缓存、会话/费用/活动",
    skin: "plain",
    color: true,
    icons: true,
    separator: " | ",
    glyphs: "nerd",
    lines: [
      ["model", "dir", "git"],
      ["context.bar", "context.trend", "cache"],
      ["session", "cost", "activity"],
    ],
  },
  budget: {
    name: "budget",
    summary: "2 行预算：费用与速率；上下文、缓存、时间",
    skin: "plain",
    color: true,
    icons: true,
    separator: " | ",
    glyphs: "nerd",
    lines: [
      ["cost", "cost.rate", "time"],
      ["context", "cache"],
    ],
  },
  "cache-aware": {
    name: "cache-aware",
    summary: "2 行缓存感知：主行 + 独立缓存明细与命中率",
    skin: "plain",
    color: true,
    icons: true,
    separator: " | ",
    glyphs: "nerd",
    lines: [
      ["model", "dir", "git", "context"],
      ["cache", "cost.rate"],
    ],
  },
  focus: {
    name: "focus",
    summary: "2 行专注：宽幅上下文条与趋势；模型、缓存",
    skin: "plain",
    color: true,
    icons: true,
    separator: " | ",
    glyphs: "unicode",
    lines: [
      ["context.bar"],
      ["model", "context.trend", "cache"],
    ],
  },
  minimal: {
    name: "minimal",
    summary: "极简 1 行：无图标，模型、上下文、缓存、费用",
    skin: "plain",
    color: true,
    icons: false,
    separator: " · ",
    glyphs: "unicode",
    lines: [["model", "context", "cache", "cost"]],
  },
  powerline: {
    name: "powerline",
    summary: "2 行 Powerline：主行色块 + 耗时/速度",
    skin: "powerline",
    color: true,
    icons: true,
    separator: "",
    glyphs: "nerd",
    lines: [
      ["model", "dir", "git", "context", "cache"],
      ["duration", "tps"],
    ],
  },
  zen: {
    name: "zen",
    summary: "纯 ASCII 1 行无色",
    skin: "plain",
    color: false,
    icons: false,
    separator: " | ",
    glyphs: "ascii",
    lines: [["model", "context", "cache", "cost"]],
  },
};

export const DROP_PRIORITY: Record<SegmentName, number> = {
  context: 120,
  "context.bar": 115,
  model: 110,
  git: 100,
  cache: 80,
  cost: 70,
  "cost.rate": 65,
  tps: 62,
  dir: 60,
  "context.trend": 55,
  activity: 50,
  duration: 45,
  session: 40,
  ccswitch: 30,
  time: 20,
};
