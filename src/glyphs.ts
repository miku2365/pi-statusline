import type { GlyphSet } from "./types.ts";

export interface GlyphPack {
  model: string;
  dir: string;
  git: string;
  context: string;
  trend: string;
  cache: string;
  cost: string;
  rate: string;
  activity: string;
  session: string;
  duration: string;
  speed: string;
  quota: string;
  time: string;
  ccswitch: string;
  ccswitchHealth: string;
  ccswitchCooling: string;
  ccswitchDisabled: string;
  ccswitchSwitches: string;
  clean: string;
  dirty: string;
  conflict: string;
  separator: string;
  powerlineSep: string;
}

/** Icons copied from Haleclipse/CCometixLine `src/style/glyphs.rs`. */
export const GLYPHS: Record<GlyphSet, GlyphPack> = {
  nerd: {
    model: "\u{ef23}",
    dir: "\u{f024b}",
    git: "\u{f02a2}",
    context: "\u{f49b}",
    trend: "\u{f201}",
    cache: "\u{f1c0}",
    cost: "\u{eec1}",
    rate: "\u{f0e4}",
    activity: "\u{f0ad}",
    session: "\u{f02b}",
    duration: "\u{f19bb}",
    speed: "\u{f04c5}",
    quota: "\u{f0520}",
    time: "\u{f19bb}",
    ccswitch: "\u{f07e1}",
    ccswitchHealth: "\u{f0e7}",
    ccswitchCooling: "\u{f252}",
    ccswitchDisabled: "\u{f4f4}",
    ccswitchSwitches: "\u{f079}",
    clean: "✓",
    dirty: "●",
    conflict: "⚠",
    separator: " | ",
    powerlineSep: "\u{e0b0}",
  },
  unicode: {
    model: "◆",
    dir: "▣",
    git: "⎇",
    context: "◔",
    trend: "∿",
    cache: "≈",
    cost: "$",
    rate: "∂",
    activity: "⚒",
    session: "#",
    duration: "◷",
    speed: "⇶",
    quota: "▤",
    time: "◷",
    ccswitch: "\u{1f300}",
    ccswitchHealth: "↯",
    ccswitchCooling: "\u{23f3}",
    ccswitchDisabled: "\u{26d4}",
    ccswitchSwitches: "\u{1f504}",
    clean: "✓",
    dirty: "●",
    conflict: "⚠",
    separator: " | ",
    powerlineSep: ">",
  },
  ascii: {
    model: "",
    dir: "",
    git: "",
    context: "",
    trend: "~",
    cache: "",
    cost: "",
    rate: "",
    activity: "",
    session: "#",
    duration: "",
    speed: "",
    quota: "",
    time: "",
    ccswitch: "<>",
    ccswitchHealth: "",
    ccswitchCooling: "~",
    ccswitchDisabled: "x",
    ccswitchSwitches: "*",
    clean: "ok",
    dirty: "*",
    conflict: "!",
    separator: " | ",
    powerlineSep: ">",
  },
};

export const EFFORT_LABEL: Record<string, string> = {
  off: "",
  minimal: "Min",
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "xHigh",
  max: "Max",
};
