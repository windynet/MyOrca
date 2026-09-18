/** Quick smoke test for launcher browser-type feature */
const { _electron: electron } = require('@stablyai/playwright-test')
const path = require('node:path')

async function main() {
  const mainPath = path.join(process.cwd(), 'out', 'main', 'index.js')
  const app = await electron.launch({ args: [mainPath] })
  const page = await app.firstWindow()

  await page.waitForFunction(() => Boolean(window.__store), null, { timeout: 30000 })
  await page.waitForFunction(() => window.__store?.getState().workspaceSessionReady === true, null, { timeout: 30000 })

  // Test 1: check launcher store API exists
  const hasApi = await page.evaluate(() => typeof window.api.shell.openUrlInBrowser === 'function')
  console.log('openUrlInBrowser available:', hasApi)

  // Test 2: check launcher items
  const items = await page.evaluate(() => {
    const store = window.__store
    if (!store) {
      return null
    }
    return store.getState().launcherItems ?? []
  })
  console.log('launcher items:', JSON.stringify(items, null, 2))

  // Test 3: call openUrlInBrowser via IPC
  const result = await page.evaluate(async () => {
    try {
      await window.api.shell.openUrlInBrowser('https://example.com', 'chrome')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  })
  console.log('openUrlInBrowser result:', JSON.stringify(result))

  await app.close()
  console.log('done')
}

main().catch(e => { console.error(e); process.exit(1) })
