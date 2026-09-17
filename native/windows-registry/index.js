// Stub: no MSVC available, provide HK constants and a no-op getRegistryKey.
'use strict'

const HK = {
  CR: 0x80000000,
  CU: 0x80000001,
  LM: 0x80000002,
  U: 0x80000003,
  PD: 0x80000004,
  CC: 0x80000005,
  DD: 0x80000006
}

function getRegistryKey(_root, _path) {
  // Stub: returns null to signal unavailable registry, callers must handle.
  return null
}

module.exports = { HK, getRegistryKey }
