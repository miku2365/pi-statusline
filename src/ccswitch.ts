import { stripAnsi } from "./color.ts";

export interface CcSwitchView {
  phase: "ok" | "switching" | "exhausted";
  version?: string;
  healthy?: number;
  total?: number;
  cooling?: number;
  disabled?: number;
  switches?: number;
  attempts?: number;
  model?: string;
}

/** Reads the text `pi-ccswitch-auto-switch` puts in `setStatus("ccswitch-ha")`. */
export function parseCcSwitchStatus(raw: string | undefined): CcSwitchView | undefined {
  if (!raw) return undefined;
  const text = stripAnsi(raw).replace(/\s+/g, " ").trim();
  if (!/^CCS\b/i.test(text)) return undefined;
  const version = text.match(/^CCS\s+v([\w.-]+)/i)?.[1];

  const switching = text.match(/↻(\d+)\s+(\S+)\s*$/);
  const cooling = Number(text.match(/⏳(\d+)/)?.[1] ?? 0);
  const disabled = Number(text.match(/⛔(\d+)/)?.[1] ?? 0);
  const switches = Number(text.match(/🔄(\d+)/)?.[1] ?? 0);

  if (switching) {
    return {
      phase: "switching",
      version,
      attempts: Number(switching[1]),
      model: switching[2],
      cooling,
      disabled,
      switches,
    };
  }
  if (text.includes("切换停止")) {
    const model = text.split("切换停止").pop()?.trim();
    return { phase: "exhausted", version, model: model || undefined, cooling, disabled, switches };
  }

  const healthy = text.match(/✓(\d+)\/(\d+)/);
  const model = text.split("·").pop()?.trim();
  return {
    phase: "ok",
    version,
    healthy: healthy ? Number(healthy[1]) : undefined,
    total: healthy ? Number(healthy[2]) : undefined,
    cooling,
    disabled,
    switches,
    model: model && !model.includes("✓") ? model : undefined,
  };
}

export function ccSwitchProvider(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const slash = model.indexOf("/");
  return slash === -1 ? model : model.slice(0, slash);
}

export interface CcSwitchGlyphs {
  health?: string;
  cooling?: string;
  disabled?: string;
  switches?: string;
}

export function formatCcSwitch(view: CcSwitchView, icons: CcSwitchGlyphs = {}, ascii = false): { full: string; compact: string } {
  const version = view.version ? `CCS v${view.version}` : "CCS";
  const provider = ccSwitchProvider(view.model);
  const left = provider ? `${version}${ascii ? " / " : " · "}${provider}` : version;

  const c = icons.cooling ? `${icons.cooling} ` : "";
  const d = icons.disabled ? `${icons.disabled} ` : "";
  const s = icons.switches ? `${icons.switches} ` : "";
  const stats = `${c}${view.cooling ?? 0}/${d}${view.disabled ?? 0}/${s}${view.switches ?? 0}`;

  const h = icons.health ? `${icons.health} ` : "";
  if (view.phase === "switching") {
    const health = `${h}${ascii ? "retry " : "↻"}${view.attempts ?? 0}`;
    return {
      full: `${left} | ${health} ${stats}`,
      compact: health,
    };
  }
  if (view.phase === "exhausted") {
    const health = `${h}${ascii ? "stopped" : "停止"}`;
    return {
      full: `${left} | ${health} ${stats}`,
      compact: health,
    };
  }
  const ratio = view.healthy != null && view.total != null ? `${view.healthy}/${view.total}` : ascii ? "-" : "—";
  const health = `${h}${ratio}`;
  return {
    full: `${left} | ${health} ${stats}`,
    compact: health,
  };
}
