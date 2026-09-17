import type { ComponentType } from "react"
import { useState, useRef, useEffect } from "react"

/**
 * Resolves a launcher icon name string to a React component from lucide-react.
 * Handles both plain lucide names and `brands@` prefixed brand icons.
 *
 * Returns null when the icon name is not recognised so the caller can
 * render a fallback glyph.
 */

type IconModule = { default: ComponentType<{ className?: string }> }

// Lazy-import map: name → module specifier → exported component name.
// Only imported on first use to keep the launcher bar tree-shakeable.
const ICON_REGISTRY: Record<string, () => Promise<IconModule>> = {
  // Plain lucide icons
  terminal: () => import("lucide-react").then((m) => ({ default: m.Terminal })),
  folder: () => import("lucide-react").then((m) => ({ default: m.Folder })),
  globe: () => import("lucide-react").then((m) => ({ default: m.Globe })),
  settings: () => import("lucide-react").then((m) => ({ default: m.Settings })),
  github: () => import("lucide-react").then((m) => ({ default: m.Github })),
  search: () => import("lucide-react").then((m) => ({ default: m.Search })),
  plus: () => import("lucide-react").then((m) => ({ default: m.Plus })),
  minus: () => import("lucide-react").then((m) => ({ default: m.Minus })),
  x: () => import("lucide-react").then((m) => ({ default: m.X })),
  chevronDown: () => import("lucide-react").then((m) => ({ default: m.ChevronDown })),
  chevronUp: () => import("lucide-react").then((m) => ({ default: m.ChevronUp })),
  maximize: () => import("lucide-react").then((m) => ({ default: m.Maximize })),
  minimize: () => import("lucide-react").then((m) => ({ default: m.Minimize })),
  panelBottomClose: () =>
    import("lucide-react").then((m) => ({ default: m.PanelBottomClose })),
  split: () => import("lucide-react").then((m) => ({ default: m.Split })),
  command: () => import("lucide-react").then((m) => ({ default: m.Command })),
  cpu: () => import("lucide-react").then((m) => ({ default: m.Cpu })),
  activity: () => import("lucide-react").then((m) => ({ default: m.Activity })),
  terminalSquare: () => import("lucide-react").then((m) => ({ default: m.SquareTerminal })),
  fileText: () => import("lucide-react").then((m) => ({ default: m.FileText })),
  layout: () => import("lucide-react").then((m) => ({ default: m.Layout })),
  layoutGrid: () => import("lucide-react").then((m) => ({ default: m.LayoutGrid })),
  monitor: () => import("lucide-react").then((m) => ({ default: m.Monitor })),
  // Brand-style token used by the reference widgets.json schema. Lucide has no
  // brand glyph for a "question" mark, so route it to the nearest real icon.
  "brands@question": () =>
    import("lucide-react").then((m) => ({ default: m.CircleQuestionMark })),
}

/**
 * Normalises an icon name token into the registry key.
 * - `"terminal"` → `"terminal"`
 * - `"brands@gitHub"` → `"brandsGithub"` (capitalised brand suffix)
 * - `"brands@question"` is a special case — it is a real registry key on its
 *   own (lucide has no brand glyph; it routes to `CircleQuestionMark`).
 */
function normaliseIconName(name: string): string {
  if (name.startsWith("brands@")) {
    if (name === "brands@question") {
      return "brands@question"
    }
    const suffix = name.slice("brands@".length)
    return `brands${suffix.charAt(0).toUpperCase()}${suffix.slice(1)}`
  }
  return name
}

// Per-key promise cache so each key is loaded at most once.
const loadPromises = new Map<string, Promise<IconModule>>()
// Per-key result cache (null = not yet resolved or failed).
const resultCache = new Map<string, ComponentType<{ className?: string }> | null>()
// Subscribers keyed by icon name; each entry is a list of tick fns.
const subscribers = new Map<string, Set<() => void>>()

function notifySubscribers(iconName: string): void {
  const subs = subscribers.get(iconName)
  if (subs === undefined) {
    return
  }
  for (const fn of subs) {
    fn()
  }
}

/**
 * Hook that subscribes the caller to re-renders when a given icon finishes
 * loading. Returns the currently cached component (or null).
 */
export function useLauncherIcon(iconName: string): ComponentType<{ className?: string }> | null {
  const key = normaliseIconName(iconName)
  const [, tick] = useState(0)
  const tickRef = useRef(tick)
  tickRef.current = tick

  useEffect(() => {
    let alive = true
    const fn = (): void => {
      if (alive) {
        tick((t) => t + 1)
      }
    }
    let subs = subscribers.get(key)
    if (subs === undefined) {
      subs = new Set()
      subscribers.set(key, subs)
    }
    subs.add(fn)
    return () => {
      alive = false
      subs.delete(fn)
      if (subs.size === 0) {
        subscribers.delete(key)
      }
    }
  }, [key])

  return resultCache.get(key) ?? null
}

/**
 * Fire-and-forget loader. Call once per icon name to kick off the async load.
 */
export function resolveLauncherIcon(iconName: string): void {
  const key = normaliseIconName(iconName)

  // Already cached — do nothing.
  if (resultCache.has(key)) {
    return
  }

  // Already loading — do nothing.
  if (loadPromises.has(key)) {
    return
  }

  const loader = ICON_REGISTRY[key]
  if (loader === undefined) {
    resultCache.set(key, null)
    return
  }

  const promise = loader()
  loadPromises.set(key, promise)
  promise
    .then((mod) => {
      resultCache.set(key, mod.default ?? null)
      notifySubscribers(key)
    })
    .catch(() => {
      resultCache.set(key, null)
      notifySubscribers(key)
    })
    .finally(() => {
      loadPromises.delete(key)
    })
}
