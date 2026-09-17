import React from "react"
import { useShallow } from "zustand/react/shallow"
import { useAppStore } from "@/store"
import { translate } from "@/i18n/i18n"
import type { LauncherItem } from "../../../../shared/launcher-item-types"
import { getLauncherShell, getLauncherUrl, getLauncherBrowserType, isTermItem } from "../../../../shared/launcher-item-types"
import { useLauncherIcon, resolveLauncherIcon } from "./resolve-launcher-icon"
import { useLauncherStore } from "./launcher-store"
import LauncherSettingsDialog from "./LauncherSettingsDialog"
import { useEffect } from "react"

/** Type guard: an entry is a valid launcher item shape. */
function isLauncherItem(entry: unknown): entry is LauncherItem {
  if (entry === null || typeof entry !== "object") {
    return false
  }
  return (
    typeof Reflect.get(entry, "id") === "string" &&
    typeof Reflect.get(entry, "label") === "string" &&
    typeof Reflect.get(entry, "icon") === "string"
  )
}

/** Re-read launcher items from localStorage periodically so that changes made
 *  while the app is running (e.g. via CDP or Settings dialog) are picked up
 *  without requiring a full page reload. */
function useLauncherItemsSync(): void {
  const setItems = useLauncherStore((s) => s.setItems)
  useEffect(() => {
    let rafId: number
    const tick = (): void => {
      try {
        const raw = localStorage.getItem("orca.launcher.items")
        if (raw === null) {
          rafId = requestAnimationFrame(tick)
          return
        }
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed) || parsed.length === 0) {
          rafId = requestAnimationFrame(tick)
          return
        }
        const loaded = parsed.filter(isLauncherItem)
        if (loaded.length === 0) {
          rafId = requestAnimationFrame(tick)
          return
        }
        // Always read fresh items from the store — a stale closure value would
        // miss items added after mount (e.g. when localStorage is written by
        // CDP while the app is already running).
        const current = useLauncherStore.getState().items
        const currentIds = current.map((it) => it.id).sort().join(",")
        const loadedIds = loaded.map((it) => it.id).sort().join(",")
        if (currentIds !== loadedIds) {
          setItems(loaded)
        }
      } catch {
        // ignore corrupt data
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [setItems])
}

// ---------------------------------------------------------------------------
// Launch handlers
// ---------------------------------------------------------------------------

type LauncherBrowserType = "google" | "edge"

function isLauncherBrowserType(value: string): value is LauncherBrowserType {
  return value === "google" || value === "edge"
}

/**
 * Opens a web item's URL. Non-Orca browsers (google/edge) launch in their own
 * window; Orca items try to dock as a tab in the active workspace.
 */
async function openUrl(url: string, browserType: LauncherBrowserType | "orca"): Promise<void> {
  if (url === "") {
    return
  }
  // Non-Orca browsers: open in their own window directly.
  if (isLauncherBrowserType(browserType)) {
    try {
      await window.api.shell.openUrlInBrowser(
        url,
        browserType === "google" ? "chrome" : "edge"
      )
      return
    } catch {
      // fall through to the system default
    }
  }
  // Orca browser: try to dock as a tab in the active workspace.
  try {
    const opened = await useAppStore
      .getState()
      .openBrowserProfileTabInActiveWorkspace(url, null, "orca")
    if (opened) {
      return
    }
  } catch {
    // A paired runtime can refuse the tab; fall through to opening externally.
  }
  // Best-effort fallback: open in system default browser.
  try {
    await window.api.shell.openUrl(url)
  } catch {
    // don't crash the bar
  }
}

function spawnTerminal(item: LauncherItem): void {
  const worktreeId = useAppStore.getState().activeWorktreeId
  if (worktreeId === null) {
    return
  }
  const shellPath = getLauncherShell(item)
  const store = useAppStore.getState()
  store.createTab(worktreeId, undefined, shellPath ?? undefined)
}

// ---------------------------------------------------------------------------
// Bar item
// ---------------------------------------------------------------------------

function LauncherBarItem({ item }: { item: LauncherItem }): React.JSX.Element | null {
  // Trigger async load on first render; the hook will re-render once loaded.
  resolveLauncherIcon(item.icon)
  const IconComponent = useLauncherIcon(item.icon)
  const bgColor = item.color !== undefined ? `#${item.color}` : undefined

  const handleClick = (): void => {
    if (isTermItem(item)) {
      spawnTerminal(item)
    } else {
      void openUrl(getLauncherUrl(item), getLauncherBrowserType(item) ?? "orca")
    }
  }

  const iconEl =
    IconComponent !== null
      ? React.createElement(IconComponent, { className: "size-5 shrink-0" })
      : React.createElement("span", { className: "text-lg" }, "?")

  return (
    <button
      type="button"
      title={item.label}
      aria-label={translate(`auto.launcher.bar.${item.id}`, item.label)}
      onClick={handleClick}
      style={
        bgColor !== undefined
          ? {
              backgroundColor: `${bgColor}22`,
              borderColor: `${bgColor}44`
            }
          : undefined
      }
      className="flex w-full flex-col items-center gap-1 rounded-lg border border-transparent px-1 py-2 text-[10px] transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {iconEl}
      <span className="truncate max-w-full text-[10px] opacity-80">{item.label}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main bar component
// ---------------------------------------------------------------------------

export default function LauncherBar(): React.JSX.Element | null {
  const items = useLauncherStore(useShallow((s) => s.items))
  const setOpen = useLauncherStore((s) => s.setOpen)
  useLauncherItemsSync()

  if (items.length === 0) {
    return null
  }

  return (
    <nav
      aria-label={translate("auto.launcher.bar.label", "Launcher")}
      className="flex h-full w-[56px] shrink-0 flex-col items-center border-l border-border bg-muted/30"
    >
      {/* Why: the bar spans the full window height, so the item column must
          start below the titlebar band or the first item lands under the
          window-controls overlay. */}
      <div className="launcher-bar-header" aria-hidden="true" />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-1 scrollbar-sleek">
        {items.map((item) => (
          <LauncherBarItem key={item.id} item={item} />
        ))}
        <div className="flex-1" />
        <button
          type="button"
          title={translate("auto.launcher.bar.settings", "Launcher settings")}
          aria-label={translate("auto.launcher.bar.settings", "Launcher settings")}
          onClick={() => setOpen(true)}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-transparent px-1 py-2 text-[10px] transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 shrink-0"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0.73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15-.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          <span className="truncate text-[10px] opacity-80">settings</span>
        </button>
      </div>
      <LauncherSettingsDialog />
    </nav>
  )
}
