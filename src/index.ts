import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { gitSummariesEqual, readGitStatus } from "./git.ts";
import { renderFooter } from "./render.ts";
import { formatLayoutReport } from "./layout.ts";
import { loadSettings, saveSettings, settingsPath } from "./settings.ts";
import { GLYPH_SETS, PRESET_LAYOUTS, PRESETS, type RuntimeState, type StatuslineSettings } from "./types.ts";

const GIT_REFRESH_MS = 20_000;
const GIT_DEBOUNCE_MS = 250;
const CLOCK_MS = 1_000;

function needsClock(runtime: RuntimeState, settings: StatuslineSettings): boolean {
  const names = PRESET_LAYOUTS[settings.preset].lines.flat();
  return (runtime.turnStartedAt != null && (names.includes("duration") || names.includes("tps"))) ||
    names.some((name) => name === "time" || name === "session" || name === "cost.rate");
}

export default function cometixStatusline(pi: ExtensionAPI) {
  const runtime: RuntimeState = {
    thinkingLevel: "off",
    isStreaming: false,
    activeTools: new Map(),
  };
  let settings: StatuslineSettings = loadSettings();
  let activeSession: ExtensionContext["sessionManager"] | undefined;
  let latestCtx: ExtensionContext | undefined;
  let gitTimer: ReturnType<typeof setInterval> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let gitDebounce: ReturnType<typeof setTimeout> | undefined;
  let gitAbort: AbortController | undefined;
  let gitRequestId = 0;
  let gitPending: { ctx: ExtensionContext; id: number; generation: number; cwd: string } | undefined;
  let footerGeneration = 0;
  let menuRequestId = 0;
  let liveRefresh = true;

  const owns = (ctx: ExtensionContext) => ctx.sessionManager === activeSession;
  const refresh = () => runtime.requestRender?.();

  const setGit = (summary: typeof runtime.git) => {
    if (gitSummariesEqual(runtime.git, summary)) return;
    runtime.git = summary;
    refresh();
  };

  const clearGitDebounce = () => {
    if (gitDebounce) clearTimeout(gitDebounce);
    gitDebounce = undefined;
  };

  const runGit = (ctx: ExtensionContext, id: number, generation: number, cwd: string) => {
    const isCurrent = () => owns(ctx) && generation === footerGeneration &&
      id === gitRequestId && cwd === latestCtx?.cwd;
    if (!isCurrent()) return;
    if (gitAbort) {
      gitPending = { ctx, id, generation, cwd };
      return;
    }
    const abort = new AbortController();
    gitAbort = abort;
    void readGitStatus(pi, cwd, abort.signal)
      .then((summary) => {
        if (isCurrent() && !abort.signal.aborted) setGit(summary);
      })
      .catch(() => {
        if (isCurrent() && !abort.signal.aborted) setGit(undefined);
      })
      .finally(() => {
        if (gitAbort !== abort) return;
        gitAbort = undefined;
        const pending = gitPending;
        gitPending = undefined;
        if (pending) runGit(pending.ctx, pending.id, pending.generation, pending.cwd);
      });
  };

  const refreshGit = (ctx: ExtensionContext) => {
    if (!owns(ctx)) return;
    clearGitDebounce();
    runGit(ctx, ++gitRequestId, footerGeneration, ctx.cwd);
  };

  const scheduleGit = (ctx: ExtensionContext) => {
    if (!owns(ctx)) return;
    clearGitDebounce();
    const id = ++gitRequestId;
    const generation = footerGeneration;
    const cwd = ctx.cwd;
    gitDebounce = setTimeout(() => {
      gitDebounce = undefined;
      runGit(ctx, id, generation, cwd);
    }, GIT_DEBOUNCE_MS);
    gitDebounce.unref?.();
  };

  const stopTimers = () => {
    if (gitTimer) clearInterval(gitTimer);
    if (clockTimer) clearInterval(clockTimer);
    gitTimer = undefined;
    clockTimer = undefined;
    clearGitDebounce();
    gitRequestId++;
    gitAbort?.abort();
    gitAbort = undefined;
    gitPending = undefined;
  };

  const startClock = () => {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = undefined;
    if (!liveRefresh) return;
    clockTimer = setInterval(() => {
      if (needsClock(runtime, settings)) refresh();
    }, CLOCK_MS);
    clockTimer.unref?.();
  };

  const installFooter = (ctx: ExtensionContext) => {
    if (ctx.mode !== "tui") return;
    const generation = ++footerGeneration;
    stopTimers();
    runtime.requestRender = undefined;
    runtime.git = undefined;
    runtime.layout = undefined;
    latestCtx = ctx;
    activeSession = ctx.sessionManager;
    runtime.thinkingLevel = ctx.thinkingLevel ?? pi.getThinkingLevel();
    ctx.ui.setFooter((tui, theme, footerData) => {
      let disposed = false;
      const isCurrent = () => !disposed && generation === footerGeneration;
      runtime.requestRender = () => {
        if (isCurrent()) tui.requestRender();
      };
      const unsub = footerData.onBranchChange(() => {
        if (!isCurrent()) return;
        setGit(undefined);
        gitAbort?.abort();
        if (latestCtx) refreshGit(latestCtx);
        tui.requestRender();
      });
      return {
        dispose() {
          if (disposed) return;
          disposed = true;
          unsub();
          if (generation !== footerGeneration) return;
          stopTimers();
          runtime.requestRender = undefined;
          runtime.layout = undefined;
          activeSession = undefined;
          latestCtx = undefined;
        },
        invalidate() {},
        render(width: number) {
          return renderFooter(width, latestCtx ?? ctx, theme, footerData, runtime, settings);
        },
      };
    });
    gitTimer = setInterval(() => {
      if (latestCtx) refreshGit(latestCtx);
    }, GIT_REFRESH_MS);
    gitTimer.unref?.();
    startClock();
    refreshGit(ctx);
  };

  const applySettings = (next: StatuslineSettings, ctx: ExtensionContext): boolean => {
    try {
      saveSettings(next);
    } catch (error) {
      ctx.ui.notify(`状态栏配置保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
      return false;
    }
    settings = next;
    refresh();
    return true;
  };

  pi.registerCommand("statusline", {
    description: "Switch cometix-style statusline preset (footer only)",
    handler: async (args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("statusline requires interactive mode", "error");
        return;
      }
      const [action, value] = args.trim().split(/\s+/);
      if (action === "status") {
        const status = `preset ${settings.preset} · glyphs ${settings.glyphs} · refresh ${liveRefresh ? "live" : "events"} · ${settingsPath()}`;
        ctx.ui.notify([status, ...formatLayoutReport(runtime.layout)].join("\n"), "info");
        return;
      }
      if (!owns(ctx)) return;
      if (action === "refresh") {
        if (value !== "live" && value !== "events") {
          ctx.ui.notify("用法：/statusline refresh live 或 /statusline refresh events", "info");
          return;
        }
        liveRefresh = value === "live";
        startClock();
        refresh();
        ctx.ui.notify(`refresh ${value}（重载后恢复 live）`, "info");
        return;
      }
      const generation = footerGeneration;
      const menuId = ++menuRequestId;
      const isCurrent = () => owns(ctx) && generation === footerGeneration && menuId === menuRequestId;
      if (action === "glyphs") {
        const picked = await ctx.ui.select("Statusline glyphs", [...GLYPH_SETS]);
        if (!picked || !isCurrent() || !GLYPH_SETS.some((glyphs) => glyphs === picked)) return;
        if (applySettings({ ...settings, glyphs: picked as StatuslineSettings["glyphs"] }, ctx)) ctx.ui.notify(`glyphs ${picked}`, "info");
        return;
      }
      const options = PRESETS.map((name) => {
        const preset = PRESET_LAYOUTS[name];
        return `${name}  (${preset.lines.length} line${preset.lines.length > 1 ? "s" : ""})`;
      });
      const picked = await ctx.ui.select("Statusline preset", options);
      if (!picked || !isCurrent()) return;
      const name = picked.split(/\s+/)[0] as (typeof PRESETS)[number];
      const layout = PRESET_LAYOUTS[name];
      if (!layout) return;
      if (applySettings({ ...settings, preset: name }, ctx)) {
        ctx.ui.notify(`${name} · ${layout.lines.length} line${layout.lines.length > 1 ? "s" : ""}`, "info");
      }
    },
  });

  pi.on("session_start", (_event, ctx) => {
    runtime.activeTools.clear();
    runtime.isStreaming = false;
    runtime.turnStartedAt = undefined;
    runtime.lastTurnMs = undefined;
    settings = loadSettings((message) => ctx.ui.notify(message, "warning"));
    installFooter(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    runtime.turnStartedAt = undefined;
    runtime.lastTurnMs = undefined;
    installFooter(ctx);
    refresh();
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!owns(ctx)) return;
    stopTimers();
    activeSession = undefined;
    latestCtx = undefined;
    runtime.git = undefined;
    runtime.activeTools.clear();
    runtime.isStreaming = false;
    runtime.turnStartedAt = undefined;
    runtime.lastTurnMs = undefined;
    runtime.requestRender = undefined;
    ctx.ui.setFooter(undefined);
  });

  pi.on("model_select", (_event, ctx) => {
    if (!owns(ctx)) return;
    latestCtx = ctx;
    refresh();
  });

  pi.on("thinking_level_select", (event, ctx) => {
    if (!owns(ctx)) return;
    runtime.thinkingLevel = event.level;
    refresh();
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!owns(ctx)) return;
    runtime.isStreaming = true;
    if (runtime.turnStartedAt == null) runtime.turnStartedAt = Date.now();
    refresh();
  });

  pi.on("agent_end", (_event, ctx) => {
    if (!owns(ctx)) return;
    scheduleGit(ctx);
    refresh();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!owns(ctx)) return;
    runtime.isStreaming = false;
    runtime.activeTools.clear();
    if (runtime.turnStartedAt != null) {
      runtime.lastTurnMs = Date.now() - runtime.turnStartedAt;
      runtime.turnStartedAt = undefined;
    }
    refresh();
  });

  pi.on("turn_start", (_event, ctx) => {
    if (!owns(ctx)) return;
    runtime.isStreaming = true;
    if (runtime.turnStartedAt == null) runtime.turnStartedAt = Date.now();
    refresh();
  });

  pi.on("turn_end", (_event, ctx) => {
    if (!owns(ctx)) return;
    scheduleGit(ctx);
    refresh();
  });

  pi.on("tool_execution_start", (event, ctx) => {
    if (!owns(ctx)) return;
    runtime.activeTools.set(event.toolName, (runtime.activeTools.get(event.toolName) ?? 0) + 1);
    refresh();
  });

  pi.on("tool_execution_end", (event, ctx) => {
    if (!owns(ctx)) return;
    const count = runtime.activeTools.get(event.toolName) ?? 0;
    if (count <= 1) runtime.activeTools.delete(event.toolName);
    else runtime.activeTools.set(event.toolName, count - 1);
    scheduleGit(ctx);
    refresh();
  });
}
