import { useCallback, useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { translate } from "@/i18n/i18n"
import "@/lib/monaco-setup"
import { useLauncherStore, DEFAULT_LAUNCHER_ITEMS } from "./launcher-store"
import type { LauncherBlockdef, LauncherItem } from "../../../../shared/launcher-item-types"

/**
 * Launcher settings — a single "widgets.json" style editor.
 *
 * The bar's toolbar definition is the whole JSON document: one object keyed
 * by item id, each value an item with `icon`, `label`, `color` and a
 * `blockdef` describing how the button behaves (`view`/`meta`).
 *
 * Editing here is JSON-in / JSON-out: the user edits the document in Monaco,
 * presses Apply, we validate the object schema, convert it to the ordered
 * array the bar renders, and persist it.
 */

/** Serialise the launcher items back into the object-keyed JSON document. */
function itemsToJson(items: LauncherItem[]): string {
  const obj: Record<string, unknown> = {}
  for (const item of items) {
    obj[item.id] = {
      icon: item.icon,
      label: item.label,
      color: item.color,
      blockdef: item.blockdef
    }
  }
  return JSON.stringify(obj, null, 2)
}

/** Narrows an arbitrary JSON value to the plain-object shape items and blockdefs accept. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/** Parse the object-keyed JSON document back into an ordered item array. */
function jsonToItems(raw: string): { ok: true; items: LauncherItem[] } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { ok: false, error: `Invalid JSON: ${String(err)}` }
  }
  if (isRecord(parsed) === false) {
    return { ok: false, error: "Expected a JSON object keyed by item id." }
  }
  const items: LauncherItem[] = []
  for (const [id, value] of Object.entries(parsed)) {
    if (isRecord(value) === false) {
      return { ok: false, error: `Item "${id}" must be a JSON object.` }
    }
    const obj = value
    if (typeof obj.icon !== "string" || typeof obj.label !== "string") {
      return { ok: false, error: `Item "${id}" requires string fields: icon, label.` }
    }
    if (
      obj.color !== undefined &&
      (typeof obj.color !== "string" || /^[0-9a-fA-F]{6}$/.test(obj.color) === false)
    ) {
      return { ok: false, error: `Item "${id}" color must be a six-digit hex like "4abc39".` }
    }
    const color = typeof obj.color === "string" ? obj.color : undefined
    if (isRecord(obj.blockdef) === false) {
      return { ok: false, error: `Item "${id}" requires a blockdef object.` }
    }
    const bd = obj.blockdef
    // Accept both `{ view, meta }` and `{ meta: { view, ... } }` layouts.
    const topView = typeof bd.view === "string" ? bd.view : null
    const meta = isRecord(bd.meta) ? bd.meta : null
    const metaView = meta !== null && typeof meta.view === "string" ? meta.view : null
    const view = topView ?? metaView
    if (view !== "term" && view !== "web") {
      return { ok: false, error: `Item "${id}" blockdef view must be "term" or "web".` }
    }
    // Validate browertype if present on a web item
    if (view === "web" && meta !== null) {
      const browertype = meta.browertype
      if (browertype !== undefined && browertype !== "orca" && browertype !== "google" && browertype !== "edge") {
        return { ok: false, error: `Item "${id}" browertype must be "orca", "google", or "edge".` }
      }
    }
    // Why: rebuild in the layout the config was written in, so applying an
    // unchanged document never rewrites an item's shape.
    const blockdef: LauncherBlockdef =
      topView === null ? { meta: { ...meta, view } } : { view, meta: meta ?? {} }
    items.push({ id, label: obj.label, icon: obj.icon, color, blockdef })
  }
  return { ok: true, items }
}

export default function LauncherSettingsDialog(): React.JSX.Element | null {
  const items = useLauncherStore((s) => s.items)
  const setItems = useLauncherStore((s) => s.setItems)
  const open = useLauncherStore((s) => s.open)
  const setOpen = useLauncherStore((s) => s.setOpen)
  const [draft, setDraft] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches

  // Opening the dialog snapshots the current items into the JSON draft.
  // Editing in Monaco only mutates `draft`; Apply validates + persists.
  useEffect(() => {
    if (open && draft === null) {
      setDraft(itemsToJson(items))
      setImportError(null)
    }
  }, [open, draft, items])

  const handleClose = useCallback((): void => {
    setOpen(false)
    setDraft(null)
    setImportError(null)
  }, [setOpen])

  const handleApply = (): void => {
    if (draft === null) {
      return
    }
    const result = jsonToItems(draft)
    if (!result.ok) {
      setImportError(result.error)
      return
    }
    setItems(result.items)
    handleClose()
  }

  if (!open) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={translate("auto.launcher.settings.title", "Launcher settings")}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose()
        }
      }}
    >
      <div className="w-[720px] max-h-[85vh] overflow-hidden rounded-lg border border-border bg-popover p-4 shadow-lg flex flex-col">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-sm font-semibold">
            {translate("auto.launcher.settings.title", "Launcher settings")}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-xs opacity-60 hover:bg-accent hover:opacity-100"
          >
            ✕
          </button>
        </div>

        <div className="mb-3 text-xs opacity-70">
          {translate(
            "auto.launcher.settings.description",
            "Edit the launcher bar definition. Each key is the item id; the JSON is the full toolbar."
          )}
        </div>

        {/* Live JSON editor */}
        {/* Why: an explicit editor height — `flex-1` inside a max-height dialog collapses to 0,
            and Monaco only renders lines once its container has real pixel height. */}
        <div className="mb-3 h-[320px] overflow-hidden rounded-md border border-border">
          <Editor
            // Why: a fixed height — a percentage height makes Monaco measure the
            // editor before the dialog lays out, so it sticks at ~5px and renders
            // zero view lines.
            height="316px"
            language="json"
            theme={isDark ? "vs-dark" : "vs"}
            value={draft ?? ''}
            onChange={(v) => {
              setDraft(v ?? '')
              setImportError(null)
            }}
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: 'on',
              tabSize: 2,
              wordWrap: 'off'
            }}
          />
        </div>

        {importError !== null ? (
          <div className="mb-2 text-xs text-destructive">{importError}</div>
        ) : null}

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
            onClick={handleApply}
          >
            {translate("auto.launcher.settings.apply", "Apply")}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            onClick={() => {
              // Persist immediately (like Clear-all used to) — no Apply round-trip.
              setItems(DEFAULT_LAUNCHER_ITEMS)
              setDraft(itemsToJson(DEFAULT_LAUNCHER_ITEMS))
              setImportError(null)
            }}
          >
            {translate("auto.launcher.settings.reset", "Reset to defaults")}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            onClick={handleClose}
          >
            {translate("auto.launcher.settings.cancel", "Cancel")}
          </button>
        </div>
      </div>
    </div>
  )
}