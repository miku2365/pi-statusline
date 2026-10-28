import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// 隔离宿主 UI 与用户配置，执行真实的事件、查询和定时器逻辑。
const indexUrl = new URL("../src/index.ts", import.meta.url).href;
const settingsSource = `export let failSave = false;
  export const setFailSave = value => { failSave = value; };
  export const saved = [];
  export const loadSettings = () => ({preset:"cometix",glyphs:"nerd"});
  export const saveSettings = value => { if (failSave) throw new Error("只读配置"); saved.push({...value}); };
  export const settingsPath = () => "test-settings.json";`;
const settingsUrl = `data:text/javascript,${encodeURIComponent(settingsSource)}`;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === indexUrl && specifier === "./render.ts") {
      return { shortCircuit: true, url: "data:text/javascript,export const renderFooter = (...args) => [JSON.stringify(args[4].git), JSON.stringify({turnStartedAt:args[4].turnStartedAt,lastTurnMs:args[4].lastTurnMs})];" };
    }
    if (context.parentURL === indexUrl && specifier === "./settings.ts") {
      return { shortCircuit: true, url: settingsUrl };
    }
    return nextResolve(specifier, context);
  },
});
const { default: extension } = await import("../src/index.ts");
const mockSettings = await import(settingsUrl);
hooks.deregister();

const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function harness() {
  mockSettings.saved.length = 0;
  mockSettings.setFailSave(false);
  const handlers = new Map<string, Function>();
  const requests: Array<{ cwd: string; signal: AbortSignal; resolve: (value: unknown) => void }> = [];
  const footers: Array<{ dispose: () => void; render: (width: number) => string[] }> = [];
  const listeners: Function[] = [];
  const notifications: string[] = [];
  let command: Function;
  let renders = 0;
  let unsubscribed = 0;
  let select: () => Promise<string | undefined> = async () => "dashboard  (3 lines)";
  extension({
    getThinkingLevel: () => "off",
    on: (name: string, handler: Function) => handlers.set(name, handler),
    registerCommand: (_name: string, value: { handler: Function }) => { command = value.handler; },
    exec: (_name: string, _args: string[], options: { signal: AbortSignal; cwd: string }) => new Promise((resolve) => {
      requests.push({ cwd: options.cwd, signal: options.signal, resolve });
    }),
  } as never);
  const ui = {
    setFooter(factory: Function | undefined) {
      footers.at(-1)?.dispose();
      if (factory) footers.push(factory({ requestRender: () => { renders++; } }, {}, {
        onBranchChange(listener: Function) {
          listeners.push(listener);
          return () => { unsubscribed++; };
        },
      }));
    },
    select: () => select(),
    notify: (message: string) => { notifications.push(message); },
  };
  const ctx = { mode: "tui", cwd: process.cwd(), sessionManager: {}, ui };
  return {
    ctx, requests, footers, listeners, notifications,
    get renders() { return renders; },
    get unsubscribed() { return unsubscribed; },
    pick(value: string | Promise<string | undefined>) { select = async () => value; },
    emit(name: string, event = {}, context = ctx) { handlers.get(name)!(event, context); },
    command(args = "", context = ctx) { return command!(args, context); },
    async close() {
      footers.at(-1)?.dispose();
      for (const request of requests) request.resolve({ code: 1, stdout: "" });
      await settle();
    },
  };
}

test("外观与刷新模式原地切换，保存失败保留原配置", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const h = harness();
  try {
    h.emit("session_start");
    assert.equal(h.requests[0].signal.aborted, false);
    await h.command();
    assert.equal(h.footers.length, 1);
    assert.equal(h.requests.length, 1);
    assert.equal(h.requests[0].signal.aborted, false);
    const before = h.renders;
    t.mock.timers.tick(1000);
    assert.equal(h.renders, before + 1);
    h.pick("ascii");
    await h.command("glyphs");
    h.pick("cometix  (2 lines)");
    await h.command();
    await h.command("status");
    assert.match(h.notifications.at(-1)!, /preset cometix · glyphs ascii/);
    h.emit("agent_start");
    await h.command("refresh events");
    const eventsBefore = h.renders;
    t.mock.timers.tick(5000);
    assert.equal(h.renders, eventsBefore);
    h.emit("tool_execution_start", { toolName: "read" });
    assert.equal(h.renders, eventsBefore + 1);
    await h.command("refresh live");
    const liveBefore = h.renders;
    t.mock.timers.tick(1000);
    assert.equal(h.renders, liveBefore + 1);
    assert.equal(h.footers.length, 1);
    mockSettings.setFailSave(true);
    h.pick("zen  (1 line)");
    await h.command();
    assert.match(h.notifications.at(-1)!, /保存失败/);
    await h.command("status");
    assert.match(h.notifications.at(-1)!, /preset cometix/);
  } finally { await h.close(); }
});

test("切换会话树清理已完成及进行中的轮次计时缓存", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: 1000 });
  const h = harness();
  try {
    h.emit("session_start");
    h.emit("agent_start");
    t.mock.timers.tick(10_000);
    h.emit("agent_settled");
    assert.deepEqual(JSON.parse(h.footers.at(-1)!.render(80)[1]), { lastTurnMs: 10_000 });
    h.emit("session_tree");
    assert.deepEqual(JSON.parse(h.footers.at(-1)!.render(80)[1]), {});
    h.emit("agent_start");
    assert.deepEqual(JSON.parse(h.footers.at(-1)!.render(80)[1]), { turnStartedAt: 11_000 });
    h.emit("session_tree");
    assert.deepEqual(JSON.parse(h.footers.at(-1)!.render(80)[1]), {});
  } finally { await h.close(); }
});

test("连续 Git 事件防抖，过期结果不应用，分支切换立即失效旧查询", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const h = harness();
  try {
    h.emit("session_start");
    h.emit("tool_execution_end", { toolName: "read" });
    h.emit("turn_end");
    h.emit("agent_end");
    t.mock.timers.tick(249);
    assert.equal(h.requests.length, 1);
    h.requests[0].resolve({ code: 0, stdout: "# branch.head stale\n" });
    await settle();
    assert.equal(h.footers[0].render(80)[0], undefined);
    t.mock.timers.tick(1);
    assert.equal(h.requests.length, 2);
    h.requests[1].resolve({ code: 0, stdout: "# branch.head main\n" });
    await settle();
    assert.match(h.footers[0].render(80)[0], /main/);
    h.emit("tool_execution_end", { toolName: "read" });
    t.mock.timers.tick(250);
    assert.equal(h.requests.length, 3);
    h.listeners[0]();
    assert.equal(h.requests[2].signal.aborted, true);
    assert.equal(h.footers[0].render(80)[0], undefined);
    h.requests[2].resolve({ code: 0, stdout: "# branch.head old\n" });
    await settle();
    assert.equal(h.requests.length, 4);
    h.requests[3].resolve({ code: 0, stdout: "# branch.head new\n" });
    await settle();
    assert.match(h.footers[0].render(80)[0], /new/);
  } finally { await h.close(); }
});

test("会话替换后旧菜单、旧查询和旧销毁不能影响新 footer", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  const h = harness();
  try {
    h.emit("session_start");
    let choose!: (value: string) => void;
    h.pick(new Promise<string>((resolve) => { choose = resolve; }));
    const menu = h.command();
    const next = { ...h.ctx, sessionManager: {} };
    h.emit("session_start", {}, next);
    assert.equal(h.requests[0].signal.aborted, true);
    assert.equal(h.requests[1].signal.aborted, false);
    choose("zen  (1 line)");
    await menu;
    assert.equal(mockSettings.saved.length, 0);
    h.footers[0].dispose();
    h.requests[0].resolve({ code: 0, stdout: "# branch.head stale\n" });
    await settle();
    assert.equal(h.requests[1].signal.aborted, false);
    assert.equal(h.footers[1].render(80)[0], undefined);
    h.requests[1].resolve({ code: 0, stdout: "# branch.head current\n" });
    await settle();
    assert.match(h.footers[1].render(80)[0], /current/);
    h.emit("tool_execution_end", { toolName: "read" }, next);
    const count = h.requests.length;
    h.footers[1].dispose();
    h.footers[1].dispose();
    assert.equal(h.unsubscribed, 2);
    const before = h.renders;
    t.mock.timers.tick(60_000);
    for (const listener of h.listeners) listener();
    assert.equal(h.requests.length, count);
    assert.equal(h.renders, before);
  } finally { await h.close(); }
});
