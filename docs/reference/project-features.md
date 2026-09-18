# Orca 项目功能全景

> 版本：v1.4.205
> 适用对象：新加入项目的开发者、需要快速了解项目能力边界的维护者。

---

## 核心定位

Orca 是一个 Electron 桌面应用，用于**编排多个 AI CLI Agent**（Claude Code、Codex、OpenCode、Pi 等），每个 agent 在独立的 git worktree 中并行执行，统一在一个界面内追踪、对比和合并结果。

---

## 多端协同

| 功能 | 说明 |
|------|------|
| **Mobile Companion** | iOS（App Store）/ Android（APK）手机 companion app，远程监控 agent 状态、接收完成通知、发送后续指令；与桌面端通过 relay 服务跨区连接 |
| **Account Switcher** | 无需重新登录即可热切换 Claude/Codex 等账户，查看用量和 rate-limit 重置时间 |

---

## Worktree 编排

| 功能 | 说明 |
|------|------|
| **Parallel Worktrees** | 一条 prompt 扇出到多个 agent，各自在隔离的 git worktree 中执行，对比结果后合并最优方案 |
| **SSH Worktrees** | 在远程服务器（SSH）上跑 agent，支持完整文件编辑、git 操作、终端，具备自动重连和端口转发 |
| **Worktree Lineage** | worktree 之间可建立父子关系（lineage），支持折叠/展开层级视图 |
| **Smart Sorting** | 按 agent 注意力（permission → working → done → active → inactive）自动排序，或手动拖拽 |
| **Sleeping Sweep** | 可隐藏无活跃终端的睡眠 worktree，保留默认分支作为入口 |

---

## 终端与编辑

| 功能 | 说明 |
|------|------|
| **Terminal Splits** | WebGPU 渲染终端（类 Ghostty），支持无限分屏、持久化 scrollback |
| **MSYS/Job Object 防护** | Windows 上 Git Bash / MSYS2 / Cygwin 进程不会逃逸 PTY job 对象，防止工作目录被孤立进程占用（node-pty patch #19068） |
| **Drag Files to Agents** | 拖拽文件或图片直接放入 agent prompt，类似 VS Code 体验 |
| **Rich Preview** | 工作区内预览 Markdown、图片、PDF、仓库文档 |
| **Quick Open** | 跨 worktree 搜索文件、agent、命令、仓库上下文，不中断当前流程 |

---

## Agent 集成

| 功能 | 说明 |
|------|------|
| **多 Agent 支持** | 支持 30+ 种 CLI agent：Claude Code、Codex、Grok、Cursor、GitHub Copilot、OpenCode、Pi、Devin、Goose、Cline、Auggie、Kimi、Qwen Code 等 |
| **Agent Hooks** | 主进程 hook server 接收 agent OSC 状态事件，提供统一的 agent-status store，sidebar / CLI / mobile / dashboard 均订阅该 store |
| **Usage Tracking** | 实时查看各 agent 的 API 用量和速率限制 |
| **Skills 系统** | 可安装技能包（561 个 closure 文件），CLI 直接驱动 Orca（`orca worktree create`、`snapshot`、`click`、`fill` 等） |

---

## 浏览器 & Design Mode

| 功能 | 说明 |
|------|------|
| **内置 Chromium** | 应用内嵌浏览器，可直接打开网页 |
| **Design Mode** | 点击任意 Chromium 页面元素，自动抓取 HTML、CSS 和截图，注入 agent prompt，让 agent 直接改 UI |
| **Computer Use** | 让 agent 操控桌面原生应用：macOS 原生 provider（`MacOSNativeProviderClient`）、Windows PowerShell 脚本桥接（`DesktopScriptProviderClient`） |

---

## 代码审查 & 协作

| 功能 | 说明 |
|------|------|
| **GitHub Native** | 应用内浏览 PR、issues，从任何 task 一键打开 worktree 并 review |
| **Linear Native** | 应用内浏览项目 board、issue，关联 worktree |
| **Annotate AI Diffs** | 在 AI 生成的 diff 任意行加注评论，直接回传给 agent 修改，在 Orca 内完成 review 闭环 |

---

## 通知 & 状态

| 功能 | 说明 |
|------|------|
| **Notifications** | agent 完成 / 需要权限时推送系统通知，支持标记 unread 以便稍后回顾 |
| **Unread State** | session / thread 级未读标记，mobile 端同步展示 |

---

## Launcher Bar（v1.4.205 新增）

| 功能 | 说明 |
|------|------|
| **右侧工具栏** | 可固定常用终端会话和 URL 为图标快捷方式，一键打开；支持外部浏览器 |

---

## 工程能力

| 功能 | 说明 |
|------|------|
| **Orca CLI** | 独立 `orca` 二进制（`out/cli/`），支持 `worktree create`、`snapshot`、`click`、`fill` 等脚本化操作 |
| **Headless Daemon（orcad）** | 无头 Linux 服务器部署模式，通过 relay 接受桌面/mobile 远程控制；详见 [`headless-linux-server.md`](./headless-linux-server.md) |
| **Plugin System** | 内置插件（launch、skills 等），运行时从 `resources/plugins/` 加载 |
| **Relay 服务** | 跨 region 代理 desktop ↔ headless daemon 的连接，支持多 cell 池；源码在 `cloud/apps/relay/` |

---

## 平台支持

- **Desktop**：macOS（arm64 / x64）/ Windows（x64）/ Linux（AppImage）
- **Mobile**：iOS（App Store）/ Android（APK）
- **Headless**：Linux 服务器（orcad daemon）

---

## 技术栈速览

| 层面 | 技术 |
|------|------|
| 运行时 | Electron 43.7.0 |
| 渲染层 | React 19 + Tailwind v4 + shadcn 组件 |
| 构建 | electron-vite（主进程 + preload）；rolldown-vite（渲染进程） |
| 包管理 | pnpm 12，Node 24 |
| 测试 | vitest（单测）；Playwright（e2e） |
| 代码签名 | SignPath.io（Windows） |
| 打包 | electron-builder + NSIS（Windows）；dmg/appimage（macOS/Linux） |

---

## 相关文档

- [Windows 本地打包流程](./windows-build-pipeline.md)
- [Agent Status Store](./agent-status-store.md)
- [SSH 执行边界](./ssh-execution-boundary.md)
- [Remote Wire 兼容性](./remote-wire-compatibility.md)
- [Git 兼容性基线](./git-compatibility.md)
- [WSL 命令执行](./wsl-command-execution.md)
- [Headless Linux 服务器部署](./headless-linux-server.md)
- [Windows 进程枚举](./windows-process-enumeration.md)
- [Windows EDR 策略](./windows-edr-posture.md)
- [MSYS Job Object 泄漏防护](./windows-msys-job-breakaway.md)
