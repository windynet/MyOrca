import { describe, expect, it } from "vitest"
import {
  getLauncherShell,
  getLauncherUrl,
  isTermItem,
  type LauncherItem
} from "./launcher-item-types"

const TERM_LEGACY: LauncherItem = {
  id: "terminal",
  label: "terminal",
  icon: "terminal",
  blockdef: {
    view: "term",
    meta: {
      term: { localshellpath: "pwsh.exe" }
    }
  }
}

const TERM_META_VIEW: LauncherItem = {
  id: "qa-yazi",
  label: "qa-yazi",
  icon: "brands@question",
  color: "4abc39",
  blockdef: {
    meta: {
      view: "term",
      term: { localshellpath: "bash" }
    }
  }
}

const WEB_LEGACY: LauncherItem = {
  id: "web",
  label: "web",
  icon: "globe",
  blockdef: {
    view: "web",
    meta: { url: "https://github.com", pinnedurl: "https://github.com" }
  }
}

const WEB_META_VIEW: LauncherItem = {
  id: "yazi-web",
  label: "qa-yazi",
  icon: "brands@question",
  color: "4abc39",
  blockdef: {
    meta: {
      view: "web",
      url: "https://quickref.cn/docs/yazi.html",
      pinnedurl: "https://google.com"
    }
  }
}

describe("isTermItem", () => {
  it("recognises the legacy top-level `view: \"term\"` layout", () => {
    expect(isTermItem(TERM_LEGACY)).toBe(true)
  })

  it("recognises the meta.view layout for term items", () => {
    expect(isTermItem(TERM_META_VIEW)).toBe(true)
  })

  it("returns false for web items in either layout", () => {
    expect(isTermItem(WEB_LEGACY)).toBe(false)
    expect(isTermItem(WEB_META_VIEW)).toBe(false)
  })
})

describe("getLauncherShell", () => {
  it("reads localshellpath from a legacy term item", () => {
    expect(getLauncherShell(TERM_LEGACY)).toBe("pwsh.exe")
  })

  it("reads localshellpath from a meta.view term item", () => {
    expect(getLauncherShell(TERM_META_VIEW)).toBe("bash")
  })

  it("returns null for web items", () => {
    expect(getLauncherShell(WEB_LEGACY)).toBeNull()
    expect(getLauncherShell(WEB_META_VIEW)).toBeNull()
  })
})

describe("getLauncherUrl", () => {
  it("returns the url for a legacy web item", () => {
    expect(getLauncherUrl(WEB_LEGACY)).toBe("https://github.com")
  })

  it("returns the url for a meta.view web item", () => {
    expect(getLauncherUrl(WEB_META_VIEW)).toBe("https://quickref.cn/docs/yazi.html")
  })

  it("returns an empty string for term items", () => {
    expect(getLauncherUrl(TERM_LEGACY)).toBe("")
    expect(getLauncherUrl(TERM_META_VIEW)).toBe("")
  })
})