/** Persisted launcher bar items — Zustand store + localStorage. */

import { create } from "zustand"
import { isWindowsRendererRuntime } from "../../store/terminals/terminal-workspace-routing"
import type { LauncherItem } from "../../../../shared/launcher-item-types"

type LauncherStoreState = {
  items: LauncherItem[]
  open: boolean
}

type LauncherStore = LauncherStoreState & {
  setItems: (items: LauncherItem[]) => void
  setOpen: (open: boolean) => void
}

const LAUNCHER_STORAGE_KEY = "orca.launcher.items"

/** Default launcher items shown when the user has never configured any. */
export const DEFAULT_LAUNCHER_ITEMS: LauncherItem[] = [
  {
    id: "terminal",
    label: "terminal",
    icon: "terminal",
    blockdef: {
      view: "term",
      meta: {
        term: {
          localshellpath: isWindowsRendererRuntime() ? "pwsh.exe" : "bash"
        }
      }
    }
  },
  {
    id: "web",
    label: "web",
    icon: "globe",
    blockdef: {
      view: "web",
      meta: { url: "https://github.com", pinnedurl: "https://github.com", browertype: "orca" }
    }
  },
  {
    id: "qa-yazi",
    label: "qa-yazi",
    icon: "brands@question",
    color: "4abc39",
    blockdef: {
      meta: {
        view: "web",
        url: "https://quickref.cn/docs/yazi.html",
        pinnedurl: "https://google.com",
        browertype: "orca"
      }
    }
  }
]

function loadLauncherItems(): LauncherItem[] {
  try {
    const raw = localStorage.getItem(LAUNCHER_STORAGE_KEY)
    if (raw === null) {
      return DEFAULT_LAUNCHER_ITEMS
    }
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
    }
  } catch {
    // corrupt data — fall through to defaults
  }
  return DEFAULT_LAUNCHER_ITEMS
}

function saveLauncherItems(items: LauncherItem[]): void {
  try {
    localStorage.setItem(LAUNCHER_STORAGE_KEY, JSON.stringify(items))
  } catch {
    // quota errors are non-fatal
  }
}

export const useLauncherStore = create<LauncherStore>((set) => ({
  items: loadLauncherItems(),
  open: false,
  setItems: (items) => {
    set({ items })
    saveLauncherItems(items)
  },
  setOpen: (open) => set({ open })
}))
