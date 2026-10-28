# pi-statusline

[English](README.md) | [简体中文](README.zh.md)

给 [Pi](https://pi.dev) 用的 [CCometixLine](https://github.com/Haleclipse/CCometixLine) 风格底栏。只替换 footer，没有全屏配置器。

![Host:Pi](https://img.shields.io/static/v1?label=Host&message=Pi%201.4&color=6b7280&style=flat-square)
![Language:TypeScript](https://img.shields.io/static/v1?label=Language&message=TypeScript&color=blue&style=flat-square)
![License:MIT](https://img.shields.io/static/v1?label=License&message=MIT&color=blue&style=flat-square)

![cometix 预设](assets/cometix.png)

## 特点

- **一眼看完当前会话**：模型与思考档位、目录、Git、上下文占用、缓存命中、本轮耗时和 `tok/s`。
- **窄窗口逐级收缩**：低优先级段先从完整文案降为紧凑、最小文案，仍放不下再隐藏；不自动增加预设行数。
- **Powerline 告警**：上下文达到 70% 使用警告色，达到 90% 使用严重色；Git 冲突和 CCS 停止也会标红。
- **Nerd Font / Unicode / ASCII**：`/statusline glyphs` 切换。
- **第三方模型费用**：API 返回的 `cost` 优先，否则读 `~/.cc-switch/model-pricing.json`，没有则 `$-.--`。
- **CCSwitch**：若装了 `pi-ccswitch-auto-switch`，其状态并进最后一行，不再单独占一行。
- **只动 footer**：不改 header、editor、widget，也不做全屏 TUI。

## 安装

```powershell
pi install git:github.com/miku2365/pi-statusline
```

安装后重启 Pi，或在当前会话执行 `/reload` 加载。后续更新使用：

```powershell
pi update --extensions
```

## 设置 Pi

默认需要 [Nerd Font](https://www.nerdfonts.com/)。没有就执行 `/statusline glyphs`，选 `unicode` 或 `ascii`。

`/statusline` 切换预设。`/statusline status` 查看当前项。配置写在 `~/.pi/agent/cometix-statusline.json`。

## 预设

`/statusline` 切换。装了 CCSwitch 时，CCS 会出现在每个预设的最后一行。

| 预设 | 行数 | 外观 | 显示内容 |
| --- | --- | --- | --- |
| `cometix`（默认） | 2 | plain，Nerd | 模型、目录、Git、上下文、缓存；耗时与速度 |
| `dashboard` | 3 | plain，Nerd | 身份与 Git；上下文条、趋势、缓存；会话与费用 |
| `budget` | 2 | plain，Nerd | 费用、速率、时钟；上下文与缓存 |
| `cache-aware` | 2 | plain，Nerd | 主行；缓存与花费速率 |
| `focus` | 2 | plain，Unicode | 宽上下文条；模型、趋势、缓存 |
| `powerline` | 2 | powerline，Nerd | 主行色块；耗时与速度 |
| `minimal` | 1 | plain，无图标 | 模型、上下文、缓存、费用 |
| `zen` | 1 | ASCII，无色 | 任意终端可用 |

### cometix

![cometix](assets/cometix.png)

### dashboard

![dashboard](assets/dashboard.png)

### budget

![budget](assets/budget.png)

### cache-aware

![cache-aware](assets/cache-aware.png)

### focus

![focus](assets/focus.png)

### powerline

![powerline](assets/powerline.png)

### minimal

![minimal](assets/minimal.png)

### zen

![zen](assets/zen.png)

## 字段

| 类别 | 字段 |
| --- | --- |
| 身份 | `model`（含思考档位） |
| 工作区 | `dir`，`git`（`✓` / `●` / `⚠`，`↑n` / `↓n`；紧凑为 `main*`，最小为 `main`；detached 为短 oid） |
| 上下文 | `context`（`62% · 124k/200k tokens`），`context.bar`，`context.trend` |
| 缓存 | `cache`（命中率与本会话 R/W） |
| 费用 | `cost`（本会话累计），`cost.rate`（`$/h`，无定价时隐藏） |
| 会话 | `session`，`duration`（发送到本轮空闲），`tps`，`time`，`activity` |
| CCSwitch | `ccswitch`：`CCS v… · provider \| 健康 冷却/禁用/切换`，仅在对方扩展 `setStatus` 时出现 |

费用：先用 API 的 `usage.cost.total`，否则用 `~/.cc-switch/model-pricing.json` 换算。会话中任意一笔 token 消耗无法定价时，累计显示 `$-.--`，费用速率隐藏。

费用和缓存 R/W 按整个会话树累计，包含已离开分支产生的实际消耗。最近请求的缓存命中率、上下文趋势、轮次耗时和速度沿当前分支计算；使用 `/tree` 切换后清理旧计时缓存，并根据所选分支记录估算耗时。

`duration` 从本轮开始计到空闲，包含工具执行与重试。完整文案保留分钟后的秒数（如 `2m5s`），收窄后可显示 `2m`。`tok/s` 为本轮所有助手输出 token 除以整轮墙钟耗时；重载后用会话记录的时间戳估算。空闲时，会话时长和费用速率仍会定时更新。

缓存段在观察到缓存读写后出现。当前分支首次只写入缓存时显示 R/W，暂不显示 `0% hit`，即使此前已有普通请求；后续请求显示命中率。若首次记录已经读取缓存，则直接显示实际命中率。

Git 使用 `git status --porcelain=v2 --branch`。工具和轮次结束触发的检查合并到 250ms 后执行，分支切换立即使旧结果失效；不是仓库时不执行 Git 命令。查询尚未完成或失败时，不将分支误标为干净。

没有内容的段不显示（无 Git、无缓存、空闲无 activity）。

## 配置

```json
{
  "preset": "cometix",
  "glyphs": "nerd"
}
```

路径：`~/.pi/agent/cometix-statusline.json`。`glyphs` 为 `nerd`、`unicode` 或 `ascii`。切换预设保留字形选择；`zen` 固定以 ASCII 文案和无图标方式显示，不修改保存的字形。预设和字形保存成功后直接应用，不重建 footer；保存失败保持原设置。配置损坏或读取失败时会提示并使用默认值。

模型名称、会话名称及其他扩展的状态可能包含非 ASCII 字符。普通文本会清理终端控制指令，外部扩展状态只保留 SGR 颜色样式，链接保留可见文字。

## 命令

| 命令 | 用途 |
| --- | --- |
| `/statusline` | 切换预设 |
| `/statusline status` | 当前预设、字形、刷新模式及最近一帧的布局诊断 |
| `/statusline glyphs` | 切换 nerd / unicode / ascii |
| `/statusline refresh events` | 临时关闭每秒刷新，保留事件刷新与 20 秒 Git 检查 |
| `/statusline refresh live` | 恢复每秒刷新 |

使用 `/statusline status` 可查看每个预设行的完整宽度、实际宽度，以及各段从完整到紧凑、最小、隐藏或截断的过程。报告来自最近一次渲染，不包含其他扩展追加的状态行。

## 环境要求

- Pi 1.4
- [Nerd Font](https://www.nerdfonts.com/)（默认预设）；否则用 unicode 或 ascii
- Git，用于 Git 来源安装和 `git` 段

## 开发与测试

克隆仓库并运行检查：

```powershell
git clone https://github.com/miku2365/pi-statusline.git
cd pi-statusline
npm ci
npm test
npm run typecheck
```

临时试跑当前源码，不登记到配置：

```powershell
pi -e .
```

需要持续开发时，可登记本地目录：

```powershell
pi install .
```

本地安装直接引用当前目录，不复制源码。修改后执行 `/reload`，不必重复安装。测试本地源码前，请先通过 `pi config` 禁用已安装的 Git 版本，避免同一扩展重复加载。

测试使用 Pi 1.4 的真实 TUI 列宽与 ANSI 截断函数，覆盖全部预设、三套字形、窄窗口、中文及 Emoji。固定时间的场景快照覆盖 Git、缓存、混合定价、告警与轮次计时；事件与配置测试隔离用户文件，不修改实际状态栏配置。

## 相关项目与致谢

- [Pi](https://pi.dev)
- [Pi Extensions](https://github.com/narumiruna/pi-extensions)
- [CCometixLine](https://github.com/Haleclipse/CCometixLine)
- [CC Switch](https://github.com/farion1231/cc-switch)
- [pi-ccswitch-auto-switch](https://github.com/JunyWuuuu91/pi-ccswitch-auto-switch)

## 许可证

[MIT](LICENSE)
