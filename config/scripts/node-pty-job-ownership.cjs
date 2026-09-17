'use strict'

const NODE_PTY_JOB_EXPORTS = ['listJobProcessIds', 'terminateJob', 'assignCurrentProcessToJob']

function assertNodePtyJobOwnership({ nativeName, native, platform = process.platform }) {
  if (platform !== 'win32' || nativeName !== 'conpty') {
    return
  }
  const exported = native?.module ?? native
  const missing = NODE_PTY_JOB_EXPORTS.filter((name) => typeof exported?.[name] !== 'function')
  if (missing.length === 0) {
    return
  }
  // Why warn instead of throw: the runtime already feature-detects these
  // exports (windows-pty-job.ts::loadConptyNative) and degrades to PID-based
  // teardown when they are absent. A missing build/Release that fell back to
  // prebuilds is therefore not a hard failure — it just means job-object
  // ownership is unavailable and pane teardown guesses by PID ancestry.
  console.warn(
    [
      `node-pty's conpty native is missing ${missing.join(', ')}.`,
      `Resolved from: ${native?.dir ?? 'unknown'}`,
      'That build cannot own a PTY tree, so terminatePtyJob degrades to "unavailable"',
      'and pane teardown falls back to guessing by PID ancestry.'
    ].join(' ')
  )
}

module.exports = { assertNodePtyJobOwnership }
