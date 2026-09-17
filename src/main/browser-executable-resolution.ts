import { constants, accessSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { runProcess } from '../shared/child-process/run-process'
import { windowsSystem32Binary } from '../shared/child-process/windows-system-binary'

/**
 * Resolve an installed browser to a concrete executable path.
 *
 * Why not a bare name: a bare `chrome.exe` is resolved against the child's
 * PATH, and Orca's PATH under Electron is not the user's — Windows does not put
 * browsers on PATH at all, so the spawn always failed with ENOENT. The failure
 * was also invisible: `spawn` reports a missing binary through an asynchronous
 * `error` event, not a throw, so the caller's try/catch never saw it.
 *
 * Why not the `@orca/windows-registry` addon: it enumerates *values* under one
 * key, and browsers are registered as *subkeys* of `App Paths` (and under a
 * machine-specific suffixed name in `StartMenuInternet`). `reg.exe` reads the
 * subkey by its known name without needing a native build.
 */

export type BrowserExecutableKind = 'chrome' | 'edge' | 'firefox'

const BROWSER_KINDS: readonly BrowserExecutableKind[] = ['chrome', 'edge', 'firefox']

export function isBrowserExecutableKind(value: unknown): value is BrowserExecutableKind {
  if (typeof value !== 'string') {
    return false
  }
  return BROWSER_KINDS.some((kind) => kind === value)
}

/** `App Paths` registers each program under its own executable file name. */
const WINDOWS_APP_PATH_NAMES: Record<BrowserExecutableKind, string> = {
  chrome: 'chrome.exe',
  edge: 'msedge.exe',
  firefox: 'firefox.exe'
}

/**
 * Machine-wide registrations come first: a per-user install is the exception,
 * and an HKCU entry left behind by an uninstalled browser is common enough that
 * trusting it first would pick a path that no longer exists.
 */
const WINDOWS_APP_PATH_ROOTS = ['HKLM', 'HKCU'] as const

const WINDOWS_APP_PATHS_KEY = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths'

/** Standard per-machine and per-user install locations, relative to an env root. */
const WINDOWS_INSTALL_ROOTS = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA'] as const

const WINDOWS_INSTALL_SUFFIXES: Record<BrowserExecutableKind, readonly string[]> = {
  chrome: ['Google\\Chrome\\Application\\chrome.exe'],
  edge: ['Microsoft\\Edge\\Application\\msedge.exe'],
  firefox: ['Mozilla Firefox\\firefox.exe']
}

const MACOS_APP_PATHS: Record<BrowserExecutableKind, readonly string[]> = {
  chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  firefox: ['/Applications/Firefox.app/Contents/MacOS/firefox']
}

const POSIX_COMMANDS: Record<BrowserExecutableKind, readonly string[]> = {
  chrome: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  edge: ['microsoft-edge', 'microsoft-edge-stable', 'msedge'],
  firefox: ['firefox']
}

const REG_QUERY_TIMEOUT_MS = 5_000

/**
 * Read the value out of `reg query` output.
 *
 * The line is `<value name>  <type>  <data>`, and the value name is localised
 * (a Chinese Windows prints a multi-byte "default" marker that arrives here as
 * mojibake), so the type token is the only stable anchor. Everything after it
 * is the data, including spaces in the path.
 */
export function parseRegQueryData(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const match = /\bREG_(?:EXPAND_)?SZ\b/.exec(line)
    if (!match) {
      continue
    }
    let data = line.slice(match.index + match[0].length).trim()
    if (data.length > 1 && data.startsWith('"') && data.endsWith('"')) {
      data = data.slice(1, -1)
    }
    if (data !== '') {
      return data
    }
  }
  return null
}

async function queryWindowsAppPaths(kind: BrowserExecutableKind): Promise<string | null> {
  const name = WINDOWS_APP_PATH_NAMES[kind]
  for (const root of WINDOWS_APP_PATH_ROOTS) {
    const key = `${root}\\${WINDOWS_APP_PATHS_KEY}\\${name}`
    const result = await runProcess({
      program: windowsSystem32Binary('reg.exe'),
      args: ['query', key, '/ve'],
      timeoutMs: REG_QUERY_TIMEOUT_MS
    })
    if (result.code !== 0) {
      continue
    }
    const data = parseRegQueryData(result.stdout)
    // Why the existence check: stale `App Paths` entries outlive uninstalls.
    if (data !== null && existsSync(data)) {
      return data
    }
  }
  return null
}

function findWindowsInstall(kind: BrowserExecutableKind): string | null {
  for (const rootName of WINDOWS_INSTALL_ROOTS) {
    const root = process.env[rootName]
    if (root === undefined || root === '') {
      continue
    }
    for (const suffix of WINDOWS_INSTALL_SUFFIXES[kind]) {
      const candidate = join(root, suffix)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  return null
}

/** First executable named one of `names` on PATH, POSIX-style. */
function findOnPath(names: readonly string[]): string | null {
  const searchPath = process.env.PATH ?? ''
  for (const directory of searchPath.split(':')) {
    if (directory === '') {
      continue
    }
    for (const name of names) {
      const candidate = join(directory, name)
      try {
        accessSync(candidate, constants.X_OK)
        return candidate
      } catch {
        continue
      }
    }
  }
  return null
}

/**
 * Concrete executable for `kind`, or null when it is not installed — the caller
 * then falls back to the system default browser rather than failing silently.
 */
export async function resolveBrowserExecutable(
  kind: BrowserExecutableKind
): Promise<string | null> {
  if (process.platform === 'win32') {
    return (await queryWindowsAppPaths(kind)) ?? findWindowsInstall(kind)
  }
  if (process.platform === 'darwin') {
    return MACOS_APP_PATHS[kind].find((candidate) => existsSync(candidate)) ?? null
  }
  return findOnPath(POSIX_COMMANDS[kind])
}
