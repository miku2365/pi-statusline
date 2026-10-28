import { stripVTControlCharacters } from "node:util";

/** CCometixLine `palette = "terminal"` ANSI-16 indexes. */
export const Tone = {
  ok: 2,
  warn: 3,
  crit: 1,
  accent: 14,
  muted: 8,
  separator: 7,
  identity: 14,
  workspace: 10,
  dirIcon: 11,
  vcs: 12,
  context: 13,
  cost: 3,
  cache: 4,
  activity: 11,
  timing: 5,
  quota: 6,
} as const;

export function stripAnsi(text: string): string {
  return stripVTControlCharacters(text);
}

/** 普通文本移除终端指令；外部状态只允许保留 SGR 样式。 */
export function sanitizeTerminalText(text: string, preserveStyles = false): string {
  const clean = (value: string) => stripVTControlCharacters(value)
    .replace(/[\r\n\t\u2028\u2029]/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
  if (!preserveStyles) return clean(text);
  return text.split(/(\u001b\[[0-9;:]*m)/g)
    .map((part) => /^\u001b\[[0-9;:]*m$/.test(part) ? part : clean(part)).join("");
}

export function fg(index: number, text: string, bold = false): string {
  if (!text) return "";
  const params = bold ? `1;38;5;${index}` : `38;5;${index}`;
  return `\x1b[${params}m${text}\x1b[0m`;
}

export function labeled(
  icon: string,
  iconColor: number,
  text: string,
  textColor: number,
  bold = false,
): string {
  if (!text) return "";
  const head = icon ? `${fg(iconColor, icon)} ` : "";
  return `${head}${fg(textColor, text, bold)}`;
}
