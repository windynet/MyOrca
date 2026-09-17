import { describe, expect, it } from 'vitest'
import { isBrowserExecutableKind, parseRegQueryData } from './browser-executable-resolution'

// Samples are verbatim `reg query <...>\App Paths\<exe> /ve` output from Windows.
// The value-name column is localised, so on a Chinese Windows the default marker
// arrives as mojibake — the parser must anchor on the type token instead.
const HKLM_MSEDGE = [
  '',
  'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe',
  '    (Default)    REG_SZ    C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ''
].join('\r\n')

const HKCU_CHROME = [
  '',
  'HKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe',
  '    (Ĭ��)    REG_SZ    C:\\Users\\32972\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  '    Path    REG_SZ    C:\\Users\\32972\\AppData\\Local\\Google\\Chrome\\Application',
  ''
].join('\r\n')

describe('parseRegQueryData', () => {
  it('reads the default value out of a machine-wide App Paths entry', () => {
    expect(parseRegQueryData(HKLM_MSEDGE)).toBe(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    )
  })

  it('reads a path with spaces after a localised value-name column', () => {
    expect(parseRegQueryData(HKCU_CHROME)).toBe(
      'C:\\Users\\32972\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
    )
  })

  it('strips the surrounding quotes of a shell\\open\\command value', () => {
    const stdout = [
      '',
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet\\Microsoft Edge\\shell\\open\\command',
      '    (Default)    REG_SZ    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"',
      ''
    ].join('\r\n')
    expect(parseRegQueryData(stdout)).toBe(
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    )
  })

  it('accepts an expandable string', () => {
    const stdout =
      '    (Default)    REG_EXPAND_SZ    %ProgramFiles%\\Mozilla Firefox\\firefox.exe\r\n'
    expect(parseRegQueryData(stdout)).toBe('%ProgramFiles%\\Mozilla Firefox\\firefox.exe')
  })

  it('returns null for a key that exists but holds no values', () => {
    const stdout =
      '\r\nHKEY_CURRENT_USER\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe\r\n\r\n'
    expect(parseRegQueryData(stdout)).toBeNull()
  })

  it('returns null when reg.exe reported a missing key', () => {
    expect(parseRegQueryData('')).toBeNull()
    expect(
      parseRegQueryData('ERROR: The system was unable to find the specified registry key')
    ).toBeNull()
  })
})

describe('isBrowserExecutableKind', () => {
  it('accepts only the browsers the handler can launch', () => {
    expect(isBrowserExecutableKind('chrome')).toBe(true)
    expect(isBrowserExecutableKind('edge')).toBe(true)
    expect(isBrowserExecutableKind('firefox')).toBe(true)
  })

  it('rejects anything else, including values that would name another program', () => {
    for (const value of ['orca', 'google', 'CHROME', 'cmd.exe', '', undefined, null, 7]) {
      expect(isBrowserExecutableKind(value)).toBe(false)
    }
  })
})
