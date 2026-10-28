export type FitLevel = "full" | "compact" | "minimal";
export type Severity = "normal" | "warning" | "critical";

export interface FitItem {
  name: string;
  full: string;
  compact: string;
  minimal?: string;
  priority: number;
  severity?: Severity;
}

export interface FittedItem extends FitItem {
  text: string;
  level: FitLevel;
}

export interface FitStep {
  name: string;
  from: FitLevel;
  to: FitLevel | "hidden" | "truncated";
}

export interface LineLayoutReport {
  line: number;
  naturalWidth: number;
  renderedWidth: number;
  steps: FitStep[];
}

export interface FooterLayoutReport {
  width: number;
  lines: LineLayoutReport[];
}

export function planFit(
  items: FitItem[],
  width: number,
  separator: string,
  measure: (text: string) => number,
  truncate?: (text: string, maxWidth: number) => string,
  measureRow?: (row: ReadonlyArray<FittedItem>) => number,
): { items: FittedItem[]; naturalWidth: number; steps: FitStep[] } {
  const fitted: FittedItem[] = items.map((item) => ({ ...item, text: item.full, level: "full" }));
  const lineWidth = (row: FittedItem[]) => measureRow ? measureRow(row) :
    row.reduce((sum, item, index) => sum + measure(item.text) + (index > 0 ? measure(separator) : 0), 0);
  const naturalWidth = lineWidth(fitted);
  const steps: FitStep[] = [];
  const levels: FitLevel[] = ["full", "compact", "minimal"];

  while (fitted.length > 0 && lineWidth(fitted) > width) {
    let chosen = 0;
    for (let i = 1; i < fitted.length; i++) {
      if (fitted[i].priority < fitted[chosen].priority) chosen = i;
    }
    const item = fitted[chosen];
    const next = levels.slice(levels.indexOf(item.level) + 1)
      .find((level) => (item[level] ?? item.compact) !== item.text);
    if (next) {
      steps.push({ name: item.name, from: item.level, to: next });
      item.text = item[next] ?? item.compact;
      item.level = next;
    } else if (fitted.length > 1) {
      steps.push({ name: item.name, from: item.level, to: "hidden" });
      fitted.splice(chosen, 1);
    } else {
      if (truncate) {
        const text = truncate(item.text, Math.max(0, width));
        if (text !== item.text) steps.push({ name: item.name, from: item.level, to: "truncated" });
        item.text = text;
      }
      break;
    }
  }
  return { items: fitted, naturalWidth, steps };
}

export function formatLayoutReport(report: FooterLayoutReport | undefined): string[] {
  if (!report) return [];
  const labels = { full: "完整", compact: "紧凑", minimal: "最小", hidden: "隐藏", truncated: "截断" };
  return [`最近一帧可用宽度：${report.width} 列`, ...report.lines.map((line) => {
    const steps = line.steps.map((step) => `${step.name} ${labels[step.from]}→${labels[step.to]}`).join("；");
    return `第 ${line.line} 行：完整 ${line.naturalWidth} 列，实际 ${line.renderedWidth} 列；${steps || "无需收缩"}`;
  })];
}

export function pickFitted(...args: Parameters<typeof planFit>): FittedItem[] {
  return planFit(...args).items;
}
