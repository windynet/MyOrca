/**
 * Shape of a single launcher-bar item, matching the JSON config schema.
 *
 * Two blockdef layouts are accepted so configs written for either form
 * load unchanged:
 *   - `{ "blockdef": { "view": "term", "meta": { ... } } }` — legacy/default items
 *   - `{ "blockdef": { "meta": { "view": "web", "url": "..." } } }` — view lives
 *     inside `meta` (the widgets.json / yazi style)
 */

export type LauncherView = "term" | "web"

export type LauncherTermConfig = {
  /** Absolute path or resolvable name of the shell executable, e.g. `"C:\\Windows\\System32\\cmd.exe"`. */
  term?: {
    localshellpath: string
  }
  /** Force a specific controller for terminal spawns; `"shell"` is the default. */
  controller?: string
}

export type LauncherWebConfig = {
  /** Default URL to navigate to when the item is activated. */
  url?: string
  /** URL pinned in the browser tab after creation; same as `url` when omitted. */
  pinnedurl?: string
  /** Specifies which browser to use — `"orca"` (default), `"google"`, `"edge"`. */
  browertype?: 'orca' | 'google' | 'edge'
}

/** Blockdef with `view` at the top level (legacy default layout). */
export type BlockdefTopLevelView = {
  view: LauncherView
  meta: Record<string, unknown>
}

/** Blockdef with `view` inside `meta` (widgets.json / yazi style). */
export type BlockdefMetaView = {
  meta: {
    view: LauncherView
    [key: string]: unknown
  }
}

export type LauncherBlockdef = BlockdefTopLevelView | BlockdefMetaView

export type LauncherItem = {
  /** Stable unique key for the item. Used as the store key and aria-label prefix. */
  id: string
  /** Display label shown below the icon. */
  label: string
  /** Six-digit hex colour (no leading `#`) used as the button background tint, e.g. `"1a73e8"`. */
  color?: string
  /** Icon identifier. Plain lucide-react names (`"terminal"`, `"github"`) are supported natively.
   *  For brand icons use the `brands@` prefix (e.g. `"brands@gitHub"` → `BrandsGithub`).
   */
  icon: string
  blockdef: LauncherBlockdef
  /** Optional secondary action config (reserved for future use). */
  action?: Record<string, unknown>
}

/** Returns the view string for an item regardless of which blockdef layout it uses. */
function getView(item: LauncherItem): LauncherView | null {
  const bd = item.blockdef
  if ("view" in bd) {
    const top = bd.view
    if (typeof top === "string" && (top === "term" || top === "web")) {
      return top
    }
  }
  if (
    bd.meta !== null &&
    typeof bd.meta === "object" &&
    typeof bd.meta.view === "string" &&
    (bd.meta.view === "term" || bd.meta.view === "web")
  ) {
    return bd.meta.view
  }
  return null
}

/** Returns the meta record for an item regardless of layout. */
function getMeta(item: LauncherItem): Record<string, unknown> {
  const bd = item.blockdef
  if (bd.meta === null || typeof bd.meta !== "object") {
    return {}
  }
  return bd.meta
}

/** Returns true when the item's blockdef is a terminal view. */
export function isTermItem(item: LauncherItem): boolean {
  return getView(item) === "term"
}

/** Returns the shell path from a term-config item, or null for web items. */
export function getLauncherShell(item: LauncherItem): string | null {
  if (isTermItem(item) === false) {
    return null
  }
  const meta = getMeta(item)
  const term = meta.term
  if (typeof term !== "object" || term === null || Array.isArray(term)) {
    return null
  }
  if ("localshellpath" in term === false) {
    return null
  }
  const path = term["localshellpath"]
  return typeof path === "string" ? path : null
}

/** Returns the URL to open for a web-config item, or empty string if not found. */
export function getLauncherUrl(item: LauncherItem): string {
  if (isTermItem(item)) {
    return ""
  }
  const meta = getMeta(item)
  const url = meta.url
  const pinnedurl = meta.pinnedurl
  if (typeof url === "string" && url.length > 0) {
    return url
  }
  if (typeof pinnedurl === "string" && pinnedurl.length > 0) {
    return pinnedurl
  }
  return ""
}

/** Returns the browser type preference from a web-config item, or null if it is unset or unknown. */
export function getLauncherBrowserType(item: LauncherItem): LauncherWebConfig["browertype"] | null {
  if (isTermItem(item)) {
    return null
  }
  const browertype = getMeta(item).browertype
  return browertype === "orca" || browertype === "google" || browertype === "edge"
    ? browertype
    : null
}