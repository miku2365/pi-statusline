import { basename } from "node:path";
import type { ExtensionContext, ReadonlyFooterDataProvider, SessionEntry, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { Tone, fg, labeled, sanitizeTerminalText } from "./color.ts";
import { EFFORT_LABEL, GLYPHS, type GlyphPack } from "./glyphs.ts";
import { type FitItem, type FittedItem, type LineLayoutReport, type Severity, planFit } from "./layout.ts";
import {
  DROP_PRIORITY,
  PRESET_LAYOUTS,
  type GitStatusSummary,
  type GlyphSet,
  type Preset,
  type RuntimeState,
  type SegmentName,
  type StatuslineSettings,
} from "./types.ts";
import { formatCcSwitch, parseCcSwitchStatus } from "./ccswitch.ts";
import { gitIsDirty } from "./git.ts";
import { eighthsBar, formatCount, formatDuration, lastTurnDurationMs, lastTurnTps, summarizeUsage } from "./usage.ts";

const POWERLINE: Partial<Record<SegmentName, { fg: number; bg: number }>> = {
  model: { fg: 231, bg: 62 },
  dir: { fg: 231, bg: 25 },
  git: { fg: 16, bg: 114 },
  context: { fg: 16, bg: 73 },
  "context.bar": { fg: 16, bg: 73 },
  "context.trend": { fg: 231, bg: 60 },
  cache: { fg: 16, bg: 141 },
  cost: { fg: 16, bg: 179 },
  "cost.rate": { fg: 16, bg: 172 },
  activity: { fg: 231, bg: 166 },
  session: { fg: 231, bg: 24 },
  duration: { fg: 231, bg: 24 },
  tps: { fg: 231, bg: 97 },
  time: { fg: 231, bg: 238 },
  ccswitch: { fg: 16, bg: 35 },
};

export function renderFooter(
  width: number,
  ctx: ExtensionContext,
  _theme: Theme,
  footerData: ReadonlyFooterDataProvider,
  runtime: RuntimeState,
  settings: StatuslineSettings,
): string[] {
  if (width <= 0) {
    runtime.layout = undefined;
    return [];
  }
  const preset = PRESET_LAYOUTS[settings.preset];
  const glyphSet = preset.name === "zen" ? "ascii" : settings.glyphs;
  const glyphs = GLYPHS[glyphSet];
  const ellipsis = glyphSet === "ascii" ? "..." : "…";
  const itemsByName = buildSegments(ctx, footerData, runtime, glyphs, preset, glyphSet);
  const lines: string[] = [];
  const layouts: LineLayoutReport[] = [];
  const powerline = preset.skin === "powerline";

  preset.lines.forEach((names, index) => {
    const lineNames = index === preset.lines.length - 1 && itemsByName.has("ccswitch")
      ? [...names, "ccswitch" as const]
      : names;
    const items = lineNames
      .map((name) => itemsByName.get(name))
      .filter((item): item is FitItem => Boolean(item));
    if (items.length === 0) return;
    const separator = glyphSet === "ascii" ? asciiText(preset.separator) : preset.separator;
    const fitted = powerline
      ? fitPowerline(items, width, glyphs.powerlineSep, ellipsis)
      : fitPlain(items, width, colorSep(separator, preset.color), ellipsis);
    layouts.push({ line: index + 1, naturalWidth: fitted.plan.naturalWidth,
      renderedWidth: visibleWidth(fitted.text), steps: fitted.plan.steps });
    if (fitted.text) lines.push(fitted.text);
  });

  runtime.layout = { width, lines: layouts };
  const statuses = formatExtensionStatuses(footerData, width, preset.color, ellipsis);
  if (statuses) lines.push(statuses);
  return lines.length > 0 ? lines : [fg(Tone.muted, "statusline")];
}

function colorSep(separator: string, color: boolean): string {
  return color ? fg(Tone.separator, separator) : separator;
}

function asciiText(text: string): string {
  return text.replace(/·/g, "/").replace(/±/g, "+/-").replace(/—/g, "-")
    .replace(/█/g, "#").replace(/[▏▎▍▌▋▊▉]/g, "+").replace(/×/g, "x");
}

function fitPlain(items: FitItem[], width: number, separator: string, ellipsis: string) {
  const plan = planFit(items, width, separator, visibleWidth,
    (text, maxWidth) => truncateToWidth(text, maxWidth, ellipsis));
  return { plan, text: truncateToWidth(plan.items.map((item) => item.text).join(separator), width, ellipsis) };
}

function fitPowerline(items: FitItem[], width: number, sep: string, ellipsis: string) {
  const plan = planFit(
    items,
    width,
    sep,
    visibleWidth,
    (text, maxWidth) => truncateToWidth(text, Math.max(0, maxWidth - 2 - visibleWidth(sep)), ellipsis),
    (row) => visibleWidth(renderPowerline(row, sep)),
  );
  return { plan, text: truncateToWidth(renderPowerline(plan.items, sep), width, ellipsis) };
}

function powerlineColors(item: FitItem): { fg: number; bg: number } {
  const base = POWERLINE[item.name as SegmentName] ?? { fg: 231, bg: 238 };
  if (item.severity === "critical") return { fg: 15, bg: 1 };
  if (item.severity === "warning") return { fg: 0, bg: 3 };
  return base;
}

function renderPowerline(fitted: ReadonlyArray<FittedItem>, sep: string): string {
  let out = "";
  for (let i = 0; i < fitted.length; i += 1) {
    const item = fitted[i];
    const text = item.text ?? item.full;
    const { fg: pfg, bg } = powerlineColors(item);
    const next = fitted[i + 1] ? powerlineColors(fitted[i + 1]) : undefined;
    out += `\x1b[48;5;${bg}m\x1b[38;5;${pfg}m ${text} \x1b[38;5;${bg}m`;
    if (next) out += `\x1b[48;5;${next.bg}m${sep}`;
    else out += `\x1b[49m${sep}`;
    out += "\x1b[0m";
  }
  return out;
}

function buildSegments(
  ctx: ExtensionContext,
  footerData: ReadonlyFooterDataProvider,
  runtime: RuntimeState,
  glyphs: GlyphPack,
  preset: Preset,
  glyphSet: GlyphSet,
): Map<SegmentName, FitItem> {
  const map = new Map<SegmentName, FitItem>();
  const entries = ctx.sessionManager.getEntries();
  const branch = ctx.sessionManager.getBranch();
  const usage = summarizeUsage(entries, branch);
  const icon = (key: keyof GlyphPack) => (preset.icons ? glyphs[key] : "");
  const paint = preset.color && preset.skin !== "powerline";
  const builders: Record<SegmentName, () => FitItem | undefined> = {
    model: () => modelSegment(ctx, runtime, icon("model"), paint),
    dir: () => dirSegment(ctx.cwd, icon("dir"), paint),
    git: () => gitSegment(footerData.getGitBranch(), runtime.git, icon("git"), glyphs, glyphSet, paint),
    context: () => contextSegment(ctx, icon("context"), paint),
    "context.bar": () => contextBarSegment(ctx, icon("context"), paint, preset.name === "focus" ? 20 : 10),
    "context.trend": () => contextTrendSegment(usage, icon("trend"), paint),
    cache: () => cacheSegment(usage, icon("cache"), paint),
    duration: () => durationSegment(branch, runtime, icon("duration"), paint),
    tps: () => tpsSegment(branch, runtime, icon("speed"), paint),
    cost: () => costSegment(usage, icon("cost"), paint),
    "cost.rate": () => costRateSegment(usage, icon("rate"), paint),
    activity: () => activitySegment(runtime, icon("activity"), paint),
    session: () => sessionSegment(ctx, usage, icon("session"), paint),
    time: () => timeSegment(icon("time"), paint),
    ccswitch: () => ccswitchSegment(footerData, glyphs, paint, preset.icons, glyphSet),
  };
  for (const name of new Set<SegmentName>([...preset.lines.flat(), "ccswitch"])) {
    const entry = builders[name]();
    if (!entry) continue;
    if (glyphSet === "ascii") {
      entry.full = asciiText(entry.full);
      entry.compact = asciiText(entry.compact);
      if (entry.minimal != null) entry.minimal = asciiText(entry.minimal);
    }
    map.set(name, entry);
  }
  return map;
}

function modelSegment(ctx: ExtensionContext, runtime: RuntimeState, icon: string, paint: boolean): FitItem {
  const model = ctx.model;
  const name = model?.name || model?.id || "no-model";
  const effort =
    model?.reasoning && runtime.thinkingLevel && runtime.thinkingLevel !== "off"
      ? EFFORT_LABEL[runtime.thinkingLevel] || runtime.thinkingLevel
      : "";
  const fullText = effort ? `${name} · ${effort}` : name;
  return item(
    "model",
    paintText(icon, Tone.identity, fullText, Tone.identity, paint, true),
    paintText(icon, Tone.identity, name, Tone.identity, paint, true),
    paintText("", Tone.identity, name, Tone.identity, paint, true),
  );
}

function dirSegment(cwd: string, icon: string, paint: boolean): FitItem {
  const short = basename(cwd.replace(/[\\/]+$/, "")) || cwd;
  return item("dir", paintText(icon, Tone.dirIcon, short, Tone.workspace, paint), paintText("", 0, short, Tone.workspace, paint));
}

function gitSegment(
  branch: string | null,
  git: GitStatusSummary | undefined,
  icon: string,
  glyphs: GlyphPack,
  glyphSet: GlyphSet,
  paint: boolean,
): FitItem | undefined {
  const oid = git?.oid ? git.oid.slice(0, 7) : undefined;
  const raw = git?.branch || (oid ? `@${oid}` : branch || undefined);
  const name = raw ? sanitizeTerminalText(raw).trim() : undefined;
  if (!name) return undefined;
  const dirty = git ? gitIsDirty(git) : false;
  const conflicts = (git?.conflicts ?? 0) > 0;
  let mark = glyphs.clean;
  let tone: number = Tone.ok;
  if (conflicts) {
    mark = glyphs.conflict;
    tone = Tone.crit;
  } else if (dirty) {
    mark = glyphs.dirty;
    tone = Tone.warn;
  }
  const ascii = glyphSet === "ascii";
  const remote: string[] = [];
  if (git?.ahead) remote.push(`${ascii ? "+" : "↑"}${git.ahead}`);
  if (git?.behind) remote.push(`${ascii ? "-" : "↓"}${git.behind}`);
  const fullText = `${name}${git ? ` ${mark}` : ""}${remote.length ? ` ${remote.join(" ")}` : ""}`;
  const compactText = dirty ? `${name}*` : name;
  return item("git", paintText(icon, tone, fullText, tone, paint),
    paintText(icon, tone, compactText, tone, paint), paintText("", tone, name, tone, paint),
    conflicts ? "critical" : dirty ? "warning" : "normal");
}

function contextSeverity(percent: number | null | undefined): Severity {
  return percent == null ? "normal" : percent >= 90 ? "critical" : percent >= 70 ? "warning" : "normal";
}

function contextSegment(ctx: ExtensionContext, icon: string, paint: boolean): FitItem {
  const usage = ctx.getContextUsage();
  const percent = usage?.percent;
  const tokens = usage?.tokens;
  const severity = contextSeverity(percent);
  const tone = severity === "critical" ? Tone.crit : severity === "warning" ? Tone.warn : Tone.context;
  const pct = percent == null ? "?" : `${Math.round(percent)}%`;
  const window = usage?.contextWindow || ctx.model?.contextWindow || 0;
  const fullText =
    tokens == null
      ? pct
      : window
        ? `${pct} · ${formatCount(tokens)}/${formatCount(window)} tokens`
        : `${pct} · ${formatCount(tokens)} tokens`;
  return item("context", paintText(icon, tone, fullText, tone, paint),
    paintText(icon, tone, pct, tone, paint), paintText("", tone, pct, tone, paint), severity);
}

function contextBarSegment(ctx: ExtensionContext, icon: string, paint: boolean, cells: number): FitItem {
  const usage = ctx.getContextUsage();
  const percent = usage?.percent;
  const severity = contextSeverity(percent);
  const tone = severity === "critical" ? Tone.crit : severity === "warning" ? Tone.warn : Tone.quota;
  const pct = percent == null ? "?" : `${Math.round(percent)}%`;
  const bar = percent == null ? "".padEnd(cells, " ") : eighthsBar(percent, cells);
  const fullText = `${bar} ${pct}`;
  return item(
    "context.bar",
    paintText(icon, tone, fullText, tone, paint),
    paintText(icon, tone, pct, tone, paint),
    paintText("", tone, pct, tone, paint),
    severity,
  );
}

function durationSegment(
  entries: readonly SessionEntry[],
  runtime: RuntimeState,
  icon: string,
  paint: boolean,
): FitItem {
  const ms =
    runtime.turnStartedAt != null
      ? Date.now() - runtime.turnStartedAt
      : runtime.lastTurnMs ?? lastTurnDurationMs(entries);
  const duration = ms == null ? "—" : formatTurnDuration(ms);
  const compact = ms == null ? "—" : formatDuration(ms, true);
  return item(
    "duration",
    paintText(icon, Tone.ok, duration, Tone.ok, paint),
    paintText(icon, Tone.ok, compact, Tone.ok, paint),
    paintText("", Tone.ok, compact, Tone.ok, paint),
  );
}

function formatTurnDuration(ms: number): string {
  if (ms < 10_000) return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
  return formatDuration(ms);
}

function tpsSegment(entries: readonly SessionEntry[], runtime: RuntimeState, icon: string, paint: boolean): FitItem {
  const durationMs = runtime.turnStartedAt != null
    ? Date.now() - runtime.turnStartedAt
    : runtime.lastTurnMs;
  const tps = lastTurnTps(entries, durationMs);
  const text = tps == null ? "— tok/s" : `${Math.round(tps)} tok/s`;
  return item("tps", paintText(icon, Tone.timing, text, Tone.timing, paint),
    paintText(icon, Tone.timing, text, Tone.timing, paint), paintText("", Tone.timing, text, Tone.timing, paint));
}

function contextTrendSegment(
  usage: ReturnType<typeof summarizeUsage>,
  icon: string,
  paint: boolean,
): FitItem | undefined {
  if (usage.lastPromptTokens == null) return undefined;
  const delta = usage.lastPromptTokens - (usage.prevPromptTokens ?? usage.lastPromptTokens);
  const text = delta === 0 ? "±0" : `${delta > 0 ? "+" : ""}${formatCount(delta)}`;
  return item("context.trend", paintText(icon, Tone.context, text, Tone.context, paint),
    paintText(icon, Tone.context, text, Tone.context, paint), paintText("", Tone.context, text, Tone.context, paint));
}

function cacheSegment(
  usage: ReturnType<typeof summarizeUsage>,
  icon: string,
  paint: boolean,
): FitItem | undefined {
  if (!usage.cacheRead && !usage.cacheWrite) return undefined;
  const hit = usage.cacheHitRate != null ? `${Math.round(usage.cacheHitRate)}% hit` : "";
  const counts = `R${formatCount(usage.cacheRead)} W${formatCount(usage.cacheWrite)}`;
  const fullText = [hit, counts].filter(Boolean).join(" · ");
  return item(
    "cache",
    paintText(icon, Tone.cache, fullText, Tone.cache, paint),
    paintText(icon, Tone.cache, hit || counts, Tone.cache, paint),
    paintText("", Tone.cache, hit || counts, Tone.cache, paint),
  );
}

function costSegment(usage: ReturnType<typeof summarizeUsage>, icon: string, paint: boolean): FitItem {
  const text = usage.cost != null && usage.hasPrice ? `$${usage.cost.toFixed(2)}` : "$-.--";
  return item("cost", paintText(icon, Tone.cost, text, Tone.cost, paint),
    paintText(icon, Tone.cost, text, Tone.cost, paint), paintText("", Tone.cost, text, Tone.cost, paint));
}

function costRateSegment(
  usage: ReturnType<typeof summarizeUsage>,
  icon: string,
  paint: boolean,
): FitItem | undefined {
  if (!usage.startedAt || usage.cost == null || !usage.hasPrice || usage.cost <= 0) return undefined;
  const hours = Math.max((Date.now() - usage.startedAt) / 3_600_000, 1 / 60);
  const text = `$${(usage.cost / hours).toFixed(2)}/h`;
  return item("cost.rate", paintText(icon, Tone.cost, text, Tone.cost, paint),
    paintText(icon, Tone.cost, text, Tone.cost, paint), paintText("", Tone.cost, text, Tone.cost, paint));
}

function sessionSegment(
  ctx: ExtensionContext,
  usage: ReturnType<typeof summarizeUsage>,
  icon: string,
  paint: boolean,
): FitItem {
  const started = usage.startedAt ?? Date.parse(ctx.sessionManager.getHeader?.()?.timestamp ?? "");
  const duration = Number.isFinite(started) ? formatDuration(Date.now() - started) : "0s";
  const name = ctx.sessionManager.getSessionName?.();
  const fullText = name ? `${name} · ${duration}` : duration;
  const compact = Number.isFinite(started) ? formatDuration(Date.now() - started, true) : "0s";
  return item("session", paintText(icon, Tone.ok, fullText, Tone.ok, paint),
    paintText(icon, Tone.ok, compact, Tone.ok, paint), paintText("", Tone.ok, compact, Tone.ok, paint));
}

function activitySegment(runtime: RuntimeState, icon: string, paint: boolean): FitItem | undefined {
  const parts: string[] = [];
  if (runtime.isStreaming) parts.push("run");
  const tools = [...runtime.activeTools.entries()]
    .filter(([, count]) => count > 0)
    .map(([name, count]) => (count > 1 ? `${name}×${count}` : name));
  if (tools.length) parts.push(tools.slice(0, 3).join(","));
  if (parts.length === 0) return undefined;
  const text = parts.join(" ");
  return item(
    "activity",
    paintText(icon, Tone.activity, text, Tone.activity, paint),
    paintText(icon, Tone.activity, parts[0], Tone.activity, paint),
    paintText("", Tone.activity, parts[0], Tone.activity, paint),
  );
}

function ccswitchSegment(
  footerData: ReadonlyFooterDataProvider,
  glyphs: GlyphPack,
  paint: boolean,
  icons: boolean,
  glyphSet: GlyphSet,
): FitItem | undefined {
  const view = parseCcSwitchStatus(footerData.getExtensionStatuses().get("ccswitch-ha"));
  if (!view) return undefined;
  const tone = view.phase === "exhausted" ? Tone.crit : view.cooling || view.disabled ? Tone.warn : Tone.ok;
  const text = formatCcSwitch(view, icons ? {
    health: glyphs.ccswitchHealth,
    cooling: glyphs.ccswitchCooling,
    disabled: glyphs.ccswitchDisabled,
    switches: glyphs.ccswitchSwitches,
  } : {}, glyphSet === "ascii");
  return item(
    "ccswitch",
    paintText(icons ? glyphs.ccswitch : "", tone, text.full, tone, paint),
    paintText(icons ? glyphs.ccswitch : "", tone, text.compact, tone, paint),
    paintText("", tone, formatCcSwitch(view, {}, glyphSet === "ascii").compact, tone, paint),
    tone === Tone.crit ? "critical" : tone === Tone.warn ? "warning" : "normal",
  );
}

function timeSegment(icon: string, paint: boolean): FitItem {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const text = `${hh}:${mm}`;
  return item("time", paintText(icon, Tone.muted, text, Tone.muted, paint), paintText("", 0, text, Tone.muted, paint));
}

function paintText(
  icon: string,
  iconColor: number,
  text: string,
  textColor: number,
  paint: boolean,
  bold = false,
): string {
  const safe = sanitizeTerminalText(text);
  if (!paint) return icon ? `${icon} ${safe}` : safe;
  return labeled(icon, iconColor, safe, textColor, bold);
}

function formatExtensionStatuses(
  footerData: ReadonlyFooterDataProvider,
  width: number,
  paint: boolean,
  ellipsis: string,
): string | undefined {
  const statuses = footerData.getExtensionStatuses();
  if (statuses.size === 0) return undefined;
  const text = [...statuses.entries()]
    .filter(([key]) => key !== "ccswitch-ha")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => sanitizeTerminalText(value, paint).replace(/ +/g, " ").trim())
    .filter(Boolean)
    .join(" ");
  if (!text) return undefined;
  return truncateToWidth(paint ? fg(Tone.muted, text) : text, width, ellipsis);
}

function item(name: SegmentName, full: string, compact: string, minimal = compact, severity: Severity = "normal"): FitItem {
  return { name, full, compact, minimal, severity, priority: DROP_PRIORITY[name] };
}
