# Windows 本地打包流程

> 适用场景：在 Windows 本机（非 CI）执行 `pnpm build:win`，产出可上传 GitHub Releases 的 `.exe` 安装包。

---

## 一、前置要求

### 系统依赖

| 依赖 | 用途 | 验证方式 |
|------|------|----------|
| Node.js ≥ 20（项目用 Node 24） | 运行 pnpm/scripts | `node --version` |
| pnpm 12 | 包管理器 | `pnpm --version` |
| VS 2022 / VS 2026 Build Tools | node-gyp 编译 C++ 原生模块 | `node-gyp` 自动探测 VS 版本 |
| Windows SDK | C++ 头文件/库 | node-gyp 自动使用 |
| C++ 核心桌面功能（VS 组件） | MSBuild 工具链 | VS Installer 确认 |

### 代码依赖

```bash
pnpm install
```

**注意**：`pnpm install` 仅安装当前平台/CPU 的依赖。若需跨架构打包（如 macOS x64+arm64），先执行：

```bash
pnpm install:release   # --cpu=current,x64,arm64
```

Windows 只需当前平台，普通 `pnpm install` 即可。

---

## 二、完整构建命令链

```
pnpm build:win
  │
  ├─ pnpm run build:desktop          # TypeScript 编译 + 资源准备
  │    ├─ typecheck                   # 全量类型检查（node + cli + web）
  │    ├─ build:relay                 # 编译 relay 服务
  │    ├─ build:cli                   # 编译 CLI 二进制 → out/cli/
  │    ├─ build:electron-vite         # Electron 主进程 + preload 打包（vite/rolldown）
  │    ├─ verify:built-skills-cli     # 验证 skills CLI 运行时（561 closure files）
  │    └─ build:web-from-renderer     # 编译 web 客户端 → out/renderer/
  │
  ├─ pnpm run ensure:electron-runtime  # 原生模块验证 + 按需重建
  │    └─ config/scripts/ensure-native-runtime.mjs --runtime=electron
  │
  └─ electron-builder --config config/electron-builder.config.cjs --win
       ├─ beforeBuild hook            # 调用 rebuild-native-deps.mjs（可选重建）
       ├─ packaging                   # 打包到 dist/win-unpacked/
       ├─ afterPack hook              # 验证 + 清理 + 签名
       └─ building target=nsis        # 生成 NSIS 安装程序 → dist/orca-windows-setup.exe
```

---

## 三、各阶段详解

### 3.1 `build:desktop` — TypeScript 编译阶段

**入口**：`package.json` → `"build:desktop"`

编译三个 TypeScript 子项目（project references）：

| tsconfig | 产物目录 | 说明 |
|----------|----------|------|
| `tsconfig.node.json` | `out/main/` | Electron 主进程 |
| `tsconfig.cli.json` | `out/cli/` | 独立 CLI 二进制 |
| `tsconfig.web.json` | `out/renderer/` | Vite 渲染进程 |

`src/shared/` 同时被三个目标编译，保持与 Electron API 无关。

**Vite 渲染构建**：使用 rolldown-vite fork，React 19 + Tailwind v4，产物约 8.5 MB 压缩后。

**关键验证**：`verify:built-skills-cli` 检查 561 个 closure 文件和 5 个命令是否正确编译。

---

### 3.2 `ensure:electron-runtime` — 原生模块验证与重建

**脚本**：`config/scripts/ensure-native-runtime.mjs`

这是整个构建中最关键的一步，负责确保所有 C++ 原生模块正确编译并加载到 Electron 中。

#### 工作流程

```
1. 启动独立的 Electron 子进程（ELECTRON_RUN_AS_NODE=1）
2. 子进程加载每个 native module，报告成功/失败
3. 主进程分析结果，决定是否重建
```

#### 检测的原生模块（Windows）

| 模块 | 用途 | 为什么需要重建 |
|------|------|---------------|
| `node-pty` | 终端 PTY 模拟 | Orca 有自定义 patch（job object 泄漏防护），prebuilt 不含这些 patch |
| `@vscode/windows-process-tree` | Windows 进程枚举 | security patch：移除 `ReadProcessMemory`，改用 `NtQueryInformationProcess` |
| `@orca/windows-registry` | Windows 注册表访问 | 本地封装的 C++ addon |

#### 检测逻辑

```js
// 探针阶段：逐个尝试加载模块
const probes = onlyModules.map(moduleName => ({
  moduleName,
  result: probeElectronNativeModules([moduleName])
}))

// 过滤出无法加载的模块
modulesToRebuild = probes.filter(({ result }) => !result.ok)

if (modulesToRebuild.length === 0) {
  console.log('[rebuild] Native modules already load; skipping.')
  process.exit(0)  // 一切正常，跳过重建
}
```

#### Windows 特殊处理

**node-pty ConPTY 恢复**：
```js
// 确保 build/Release/conpty/ 下有 conpty.dll 和 OpenConsole.exe
restoreNodePtyWindowsConptyRuntime()
```
这两个 DLL 来自 `node_modules/node-pty/third_party/conpty/<version>/win10-x64/`，由 `post-install.js` 放置，但可能因清理脚本丢失。

**windows-process-tree patch**：
- 补丁文件：`config/patches/@vscode__windows-process-tree@0.8.0.patch`
- 主要改动：
  1. `binding.gyp`：移除动态 `node-addon-api` 查找，添加 `"include_dirs": ["deps/node-addon-api"]`
  2. `src/process_commandline.cc`：移除 PEB 读取（需 `ReadProcessMemory`，有隐私风险），改用 `NtQueryInformationProcess` class 60
  3. `lib/index.js`：导出 `supportedProcessDataFlags` 和 `CreationTime = 4`
  4. `src/process.h` / `src/process.cc`：新增 CreationTime 字段支持

- patch 应用由 `windows-process-tree-gyp-rebuild.mjs` 管理：
  - `stageWindowsProcessTreeNodeAddonApiHeaders()`：从 pnpm store 复制 `napi.h` 等头文件到 `deps/node-addon-api/`
  - `ensureWindowsProcessTreeCommandLinePatch()`：应用 git patch 并删除旧的 unpatched 二进制

#### 重建触发条件

| 条件 | 行为 |
|------|------|
| 任何模块加载失败 | 对失败模块执行 `node-gyp rebuild` |
| `ORCA_FORCE_NATIVE_REBUILD=1` 环境变量 | 强制重建所有模块 |
| `--force` CLI 参数 | 同上 |
| 跨架构构建 | 自动强制重建 |
| 模块加载成功 + 无需 patch | 跳过（`process.exit(0)`） |

#### 已知坑：探针误判

如果 prebuilt 二进制恰好能加载（ABI 兼容且未损坏），探针会认为一切正常并跳过重建——即使二进制**没有 Orca 的安全 patch**（仍调用 `ReadProcessMemory`）。

**识别方法**：查看日志是否有 `[rebuild] Native modules already load in Electron; skipping rebuild.` 但同时 `inspectWindowsProcessTreeAddon()` 返回 `'unpatched'`。

**解决方法**：手动删除预编译二进制后重建：
```powershell
# 1. 备份
Copy-Item 'node_modules/@vscode/windows-process-tree/build/Release/windows_process_tree.node' '_backup-native-modules/'

# 2. 删除 prebuilt
Remove-Item 'node_modules/@vscode/windows-process-tree/build/Release/windows_process_tree.node'

# 3. 强制重建
pnpm run rebuild:electron
```

---

### 3.3 `electron-builder` — 打包阶段

**配置**：`config/electron-builder.config.cjs`

#### beforeBuild 钩子

```js
beforeBuild: (context) => {
  // 1. 调用 rebuild-native-deps.mjs（带 --platform 和 --arch 参数）
  // 2. Windows 额外构建 CLI launcher
  // 3. 返回 false 阻止 electron-builder 重复重建
  return false
}
```

`rebuild-native-deps.mjs` 内部调用 `@electron/rebuild`，但通过 `onlyModules` 列表精确控制只重建指定模块，跳过 `cpu-features`（ssh2 的可选依赖，常见环境问题）。

#### 文件过滤（files 配置）

排除大量非运行时内容，防止打包体积膨胀：

```js
files: [
  '!src{,/**/*}',       // 源码
  '!config{,/**/*}',    // 构建配置
  '!docs{,/**/*}',      // 文档
  '!tests{,/**/*}',     // 测试
  '!node_modules/**/*.map', // 所有 source map
  '!out/**/*.test.js',  // 测试文件
  '!resources/onboarding/feature-wall/**', // feature-wall 通过 extraResources 单独处理
]
```

#### ASAR unpack 配置

以下路径**不打包进 app.asar**，保持为磁盘上的真实目录：

| 路径 | 原因 |
|------|------|
| `out/cli/**` | CLI 以独立 Node 进程运行，需要 `require()` 解析 |
| `out/shared/**` | CLI 和 main 共享，ASAR 内 require 不可见 |
| `out/main/daemon-entry.js` | 被 `child_process.fork()` 启动，必须能在磁盘定位 |
| `resources/**` | 运行时读写二进制文件（音频、语音模型等） |
| `node_modules/ws/yaml/zod/tweetnacl` | CLI 在 ELECTRON_RUN_AS_NODE 模式下运行，ASAR 不可见 |

#### extraResources（Windows）

通过 `extraResources` 映射到 `dist/win-unpacked/resources/`，运行时通过 `process.resourcesPath` 访问：

```js
extraResources: [
  { from: 'out/relay', to: 'relay' },                    // SSH 中继服务
  { from: 'resources/plugins/launch', to: 'plugins/launch' }, // 内置插件
  { from: 'resources/skills', to: 'skills' },             // 技能包
  { from: 'resources/win32/bin/orca.cmd', to: 'bin/orca.cmd' }, // CLI shell 入口
  { from: 'native/windows-cli-launcher/.build/orca.exe', to: 'bin/orca.exe' }, // CLI 二进制
  { from: 'node_modules/agent-browser/bin/agent-browser-win32-x64.exe', to: '...' },
  { from: 'native/computer-use-windows/runtime.ps1', to: 'computer-use-windows/runtime.ps1' },
  { from: 'resources/onboarding/feature-wall', to: 'onboarding/feature-wall' },
  ...windowsRuntimeNodeModules,  // 动态生成的 node_modules 副本
]
```

**为什么需要 `createPackagedRuntimeNodeModuleResources`**：app.asar 内不包含 `node_modules`，所以运行时 `require()` 必须从 `resources/node_modules/` 解析。该函数从顶层依赖（`node-pty`、`ssh2`、`ws` 等）出发，递归遍历其依赖树，收集完整闭包后拷贝到打包目录。

#### afterPack 钩子

在 asar 打包完成后、NSIS 构建前执行一系列验证和清理：

```js
afterPack: async (context) => {
  // 1. 清理 node_modules（删除非目标架构的二进制、类型声明、source maps）
  prunePackagedRuntimeNodeModules(resourcesDir, platform, arch)

  // 2. 验证打包后的节点模块完整性
  verifyPackagedMainRuntimeDeps(resourcesDir)  // 扫描 JS 中的 require()，确认对应包存在

  // 3. Windows 专用验证
  verifyPackagedWindowsNodePty(resourcesDir, arch)  // 确认 conpty.node 防 MSYS job 逃逸

  // 4. 验证 CLI skills 运行时
  verifySkillsCliRuntime(...)  // 执行 5 个 CLI 命令，确认 561 个 closure 文件可用

  // 5. 验证 daemon-entry.js 可启动
  verifyPackagedDaemonEntryBoots(resourcesDir)

  // 6. 验证内置插件资源
  verifyPackagedPluginResources(resourcesDir)
}
```

**`prunePackagedRuntimeNodeModules` 清理逻辑**：

| 清理项 | 规则 |
|--------|------|
| `node-pty` prebuilds | 只保留目标平台/架构版本，删除其他 |
| `node-pty` prebuilds/win32-x64/conpty.node | 删除（确保使用源构建的 `build/Release/conpty.node`，包含 Orca patch） |
| `@parcel/watcher` 平台变体 | 只保留目标平台变体 |
| `zod/src` | 全删（TypeScript 源码，运行时不需要） |
| `.d.ts` / `.map` 文件 | 全删（仅编译期使用） |
| `sherpa-onnx` 多余 dylib | macOS 上删除未版本化的 `libonnxruntime.dylib` |

#### 代码签名（Windows）

使用 [SignPath.io](https://signpath.io) 证书签署：

```
signing with signtool.exe  path=dist\win-unpacked\Orca.exe
signing with signtool.exe  path=dist\orca-windows-setup.exe
signing with signtool.exe  path=dist\orca-windows-setup.__uninstaller.exe
...
```

签署对象包括：主程序 exe、NSIS 安装程序、NSIS 卸载程序、conpty OpenConsole.exe、winpty-agent.exe、pagent.exe 等所有二进制。

#### NSIS 安装程序配置

```js
nsis: {
  artifactName: 'orca-windows-setup.${ext}',  // 输出文件名
  include: 'config/nsis/orca-installer-hooks.nsh',  // 自定义 NSIS 脚本
  createDesktopShortcut: 'always',
}
```

**NSIS 钩子脚本**（`config/nsis/orca-installer-hooks.nsh`）：

- `customInstall`：注册 Markdown 文件关联（`.md`/`.markdown`/`.mdx`），添加到 Explorer "Open with" 列表（不覆盖默认编辑器）
- `customUnInstall`：清理 `daemons-host` 重定向目录（`%LOCALAPPDATA%\Orca\daemon-host`），终止残留进程，撤销文件关联

---

## 四、产物输出

```
dist/
├── orca-windows-setup.exe          # NSIS 安装包（约 301 MB）
├── orca-windows-setup.exe.blockmap # 增量更新块映射（308 KB）
├── latest.yml                      # 更新元数据（343 B）
└── win-unpacked/                   # 解压版（调试用，不上传）
```

---

## 五、常见问题

### Q1: 构建在 electron-builder 下载阶段失败（SSL/TLS 错误）

**症状**：`got` 模块报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 或类似 TLS 错误。

**原因**：`got@11.8.6`（electron-builder 的 HTTP 客户端）不识别 `NODE_EXTRA_CA_CERTS` 环境变量。

**解决**：
```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = "0"
pnpm run build:win
```

> 注意：这只是绕过公司代理/内网 CA 的临时方案，生产 CI 不受影响（CI 机器网络环境正常）。

### Q2: `windows_process_tree.node` 是 unpatched 版本

**症状**：日志显示 `[rebuild] Native modules already load in Electron; skipping rebuild.` 但 `supportedProcessDataFlags` 为 0（应为 4），或二进制仍导入 `ReadProcessMemory`。

**原因**：prebuilt tarball 中包含未打 patch 的二进制，且 ABI 与当前 Electron 兼容，探针误判为"已就绪"。

**解决**：
```powershell
# 1. 备份现有二进制
Copy-Item 'node_modules/@vscode/windows-process-tree/build/Release/windows_process_tree.node' '_backup-native-modules/'

# 2. 删除 prebuilt
Remove-Item 'node_modules/@vscode/windows-process-tree/build/Release/windows_process_tree.node'

# 3. 强制重建
pnpm run rebuild:electron
```

验证：重建后日志应显示 `[rebuild] Rebuilding failed native modules: @vscode/windows-process-tree`，且产物二进制应包含 `NtQueryInformationProcess`（不含 `ReadProcessMemory`）。

### Q3: node-gyp 找不到 Visual Studio

**症状**：`node-gyp rebuild` 报 `Could not find a suitable Visual Studio installation`。

**解决**：
1. 确认 VS 2022 或 VS 2026 已安装 "C++ 核心桌面功能" 工作负载
2. 确认已安装对应版本的 Windows SDK
3. `node-gyp` 支持 VS 2019/2022/2026（版本号 17/18 → 年份映射在 `node-gyp/lib/find-visualstudio.js`）

### Q4: `deps/node-addon-api/` 头文件缺失

**症状**：`node-gyp rebuild` 报 `napi.h: No such file or directory`。

**原因**：patched `binding.gyp` 引用了 `deps/node-addon-api`，但 tarball prebuilt 不包含这些头文件。

**解决**：`ensure-native-runtime.mjs` 会自动调用 `stageWindowsProcessTreeNodeAddonApiHeaders()`，从 pnpm store 复制 `napi.h`、`napi-inl.h`、`napi-inl.deprecated.h` 到正确位置。如果手动执行 node-gyp，需先运行此步骤。

### Q5: 交叉架构构建失败（如 Windows 上打 macOS）

**症状**：`assertPackagedNativeVariantsInstalled` 报错，提示缺少 `sherpa-onnx-darwin-arm64` 等包。

**原因**：`pnpm install` 只安装当前平台的 native 依赖。

**解决**：
```bash
pnpm install:release   # 安装 current + x64 + arm64 全部 CPU 变体
```

---

## 六、与 CI 的区别

| 方面 | 本地构建 | CI 构建 |
|------|----------|---------|
| SSL/TLS | 可能需要 `NODE_TLS_REJECT_UNAUTHORIZED=0` | 正常（直连 GitHub） |
| 代码签名 | SignPath CI 代理，本地跳过实际签名 | 通过 SignPath API 自动签名 |
| 开发渠道包 | 无（除非设 `ORCA_WIN_HOURLY=1`） | 自动生成 hourly/daily 包 |
| 版本来源 | `package.json` 中的版本号 | CI 注入 `ORCA_BUILD_VERSION` |
| 自动推送 | 不自动推送 | 推送到 GitHub Releases |

---

## 七、关键文件速查

| 文件 | 职责 |
|------|------|
| `package.json` → `scripts.build:win` | 构建入口脚本定义 |
| `config/electron-builder.config.cjs` | electron-builder 完整配置（打包规则、签名、NSIS） |
| `config/scripts/ensure-native-runtime.mjs` | 原生模块探针 + 重建编排 |
| `config/scripts/rebuild-native-deps.mjs` | `@electron/rebuild` 封装，精确模块列表 |
| `config/scripts/windows-process-tree-gyp-rebuild.mjs` | windows-process-tree patch 应用 + node-gyp 构建 |
| `config/packaged-runtime-node-modules.cjs` | 打包后 node_modules 清理 + 验证逻辑 |
| `config/nsis/orca-installer-hooks.nsh` | NSIS 安装/卸载自定义逻辑 |
| `config/patches/@vscode__windows-process-tree@0.8.0.patch` | 安全 patch（移除 ReadProcessMemory） |
| `config/patches/node-pty@1.1.0.patch` | PTY patch（job object 泄漏防护） |
