# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Orca is an Electron desktop app for orchestrating coding agents (Codex, ClaudeCode, OpenCode, Pi) in parallel git worktrees. It ships as a macOS/Windows/Linux Electron app, a headless `orcad` daemon (plain Node), and a mobile companion app (`mobile/`).

All UI work must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md) and use the design-system lint gate: `pnpm run check:code-quality:changed`. The canonical token source is `src/renderer/src/assets/main.css`.

Read [`AGENTS.md`](./AGENTS.md) for project-specific rules (ssh execution boundary, agent status store, remote wire compatibility, Windows daemon relocation, etc.).

## Tooling

- Package manager: **pnpm** 12. Node 24 required.
- Linter: **oxlint** (fast), **oxlint --type-aware** (slower, more precise). Format: **oxfmt**.
- Test runner: **vitest** (unit), **Playwright** (e2e).
- TypeScript: 7.x, compiled per-subsystem with project references.
- Renderer: **vite** (rolldown-vite fork), React 19, Tailwind v4, shadcn primitives.
- Build: **electron-vite** for Electron targets; separate **vite** config for web build.

## Common Commands

```bash
# Install (host only) — normal dev
pnpm install

# Install for cross-arch packaging (macOS builds x64+arm64)
pnpm install:release

# Type-check — pick the subsys you're touching
pnpm tc              # all three (node + cli + web)
pnpm tc:node         # main process + shared + preload
pnpm tc:cli          # CLI binary
pnpm tc:web          # renderer

# Lint changed files (CI gate)
pnpm run check:code-quality:changed

# Full lint (slow)
pnpm lint

# Run unit tests
pnpm test
pnpm test src/path/to/file.test.ts   # single file

# Run e2e tests (headless)
pnpm test:e2e

# Local dev (Electron)
pnpm dev

# Local dev (web)
pnpm dev:web

# Build desktop release (TypeScript + Electron bundle)
pnpm build:desktop

# Full packaging build (includes relay + native addons + web)
pnpm build

# Build for a specific platform
pnpm build:win
pnpm build:mac
pnpm build:linux

# CLI build only
pnpm build:cli
```

## Architecture

### Three compile targets (project references)

| tsconfig            | subsystem     | entry point convention                                    |
| ------------------- | ------------- | --------------------------------------------------------- |
| `tsconfig.node.json`| main process  | `src/main/index.ts`                                       |
| `tsconfig.cli.json` | CLI           | `src/cli/index.ts` → `out/cli/index.js`                   |
| `tsconfig.web.json` | renderer      | `src/renderer/src/app-shell/` → React root                |

`src/shared/` is compiled into **all three** targets — keep it free of Electron APIs.
`src/relay/` is its own Node package consumed by both main and `orcad`.

### Main-process subsystems

- `src/main/startup/` — lifecycle: preflight, main-window open, IPC bootstrap, quit handlers.
- `src/main/ipc/` — every `ipcMain.handle`/`on` registration lives here. Files are named `<topic>.ts`.
- `src/main/host/` — Electron-runtime bridges (secret store, speech, browser commands).
- `src/main/pty/` — terminal environment setup and shell preflights per provider (codex, ghostty, etc.).
- `src/main/orcad/` — headless daemon mode: RPC server, worktree management, git, persistence.
- `src/main/runtime/relay/` — relay integration for remote worktrees.
- `src/main/agent-hooks/` — hook server HTTP receiver, OSC status parser, pane authority.
- `src/main/daemon/` — local terminal daemon orchestration (separate process from orcad).

### Renderer

- `src/renderer/src/app-shell/` — top-level shell, workspace reconciliation, shutdown checkpoint.
- `src/renderer/src/components/` — UI components (use shadcn primitives from `components/ui/`).
- `src/renderer/src/store/` — zustand selectors and identity utilities; no stores live here directly.
- `src/renderer/src/runtime/` — runtime-environment operations (agent session create/resume, browser close plans).
- `src/renderer/src/lib/` — shared renderer utilities.

### Shared layer

- `src/shared/child-process/` — cross-platform process spawn/kill with Windows `.cmd` shim resolution, WSL, and SSH support. **Never use `child_process` directly in main.**
- `src/shared/source-scan/` — file-tree walking for source scanning.
- `src/shared/github/` — GitHub API client and types.
- `src/shared/rpc-contract/` — Zod schemas for every IPC/RPC param pair (`*-params.ts`). Always import params from here; never redefine shapes in handlers.
- `src/shared/worktree/` — worktree creation, base-ref tracking, scan preparation.

### CLI

- `src/cli/` — standalone `orca` binary entry, built to `out/cli/`. The CLI is tested against a real built AppImage in CI (`test:linux-cli-contract`).

### Cloud relay

- `cloud/apps/relay/` — the relay service that proxies desktop-client ↔ orcad connections across regions.
- `cloud/apps/push/`, `relay-fence-broker`, `relay-ops` — supporting services.
- `cloud/packages/` — shared Postgres schema, push/relay contracts.

## Key Conventions

**"Reuse before reimplement"** — before writing new IPC, a state store, or a flow, search for an existing implementation that nearly fits. Extend it rather than building a parallel one.

**Child-process spawning**: use `src/shared/child-process/` helpers (`runProcess`, `spawnProcess`). Never import `child_process` directly. This pins `windowsHide`, refuses `shell: true`, and resolves `.cmd` shims so neither `CommandLineToArgvW` nor `cmd.exe` mangles arguments.

**Agent status**: a single canonical store lives in the hook server (`src/main/agent-hooks/server.ts`). Every reader (sidebar, `worktree ps`, mobile, dashboard) subscribes to it. See [`docs/reference/agent-status-store.md`](./docs/reference/agent-status-store.md).

**Remote wire**: clients and hosts update independently; mixed versions are normal. New optional fields on frames are safe; new opcodes must be capability-negotiated. See [`docs/reference/remote-wire-compatibility.md`](./docs/reference/remote-wire-compatibility.md).

**SSH execution boundary**: the execution host owns everything that touches execution. Loss of contact is never evidence of process death — verdict vocabulary is `live` / `unverifiable` / `exited`. See [`docs/reference/ssh-execution-boundary.md`](./docs/reference/ssh-execution-boundary.md).

**Windows**:
- Process enumeration reads `src/main/windows/windows-process-table.ts`, never forks PowerShell.
- Daemon relocation copies the runtime to `%LOCALAPPDATA%`; see [`docs/reference/windows-daemon-host-relocation.md`](./docs/reference/windows-daemon-host-relocation.md).
- EDR signals: do not use `-ExecutionPolicy Bypass`, `-EncodedCommand`, or `cmd.exe /c` with free text without reading [`docs/reference/windows-edr-posture.md`](./docs/reference/windows-edr-posture.md).
- Shells: `--shell` picks what the terminal *is*; `--command` is typed into the host shell. See [`docs/reference/windows-terminal-shell-selection.md`](./docs/reference/windows-terminal-shell-selection.md).

**Native dependency installs**: `pnpm install` covers current OS/CPU only. Before any cross-arch packaging (macOS x64+arm64), run `pnpm install:release`. electron-builder's `beforePack` guard in `config/electron-builder.config.cjs` fails the build if foreign-architecture natives are missing.

**Git**: treat Git 2.25 as the baseline. Use `GitCapabilityCache` with a narrow unsupported-error predicate. Do not enumerate every ref then run `git ls-tree` per ref — prefer `rg` over checked-out files, and bounded named-ref scans for history. See [`docs/reference/git-compatibility.md`](./docs/reference/git-compatibility.md).

**Build-identity gating**: two compile-time constants (`ORCA_BUILD_IDENTITY`, `ORCA_POSTHOG_WRITE_KEY`) control whether telemetry actually transmits. CI injects real values; all other builds get `null`. Do not add runtime env-var fallbacks for these.

## Testing

Unit tests live alongside source (`*.test.ts` / `*.test.tsx`). Run a single test:

```bash
pnpm test src/main/ipc/foo.test.ts
```

Golden e2e tests compare rendered output against baselines. Run them individually by spec path:

```bash
pnpm test:e2e:terminal-rendering-golden
pnpm test:e2e:source-control-golden
```

Performance contracts run under `config/vitest.performance.config.ts`:

```bash
pnpm test:perf:contracts
```

## Docs Worth Reading Before Touching

- [`docs/reference/ssh-execution-boundary.md`](./docs/reference/ssh-execution-boundary.md)
- [`docs/reference/agent-status-store.md`](./docs/reference/agent-status-store.md)
- [`docs/reference/remote-wire-compatibility.md`](./docs/reference/remote-wire-compatibility.md)
- [`docs/reference/pnpm-install-policy.md`](./docs/reference/pnpm-install-policy.md)
- [`docs/reference/windows-daemon-host-relocation.md`](./docs/reference/windows-daemon-host-relocation.md)
- [`docs/reference/windows-edr-posture.md`](./docs/reference/windows-edr-posture.md)
- [`docs/reference/windows-process-enumeration.md`](./docs/reference/windows-process-enumeration.md)
- [`docs/reference/wsl-command-execution.md`](./docs/reference/wsl-command-execution.md)
- [`docs/reference/git-compatibility.md`](./docs/reference/git-compatibility.md)
- [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md)
