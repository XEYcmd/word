/**
 * PWA 能力检查：Service Worker 注册、离线可用、manifest 可解析。
 * 用法：CDP=http://127.0.0.1:9226 node scripts/pwa-check.mjs http://127.0.0.1:4179/word/
 */
const BASE = process.argv[2] || 'http://127.0.0.1:4179/word/'
const CDP = process.env.CDP || 'http://127.0.0.1:9226'

let ws
let msgId = 0
const pending = new Map()

function connect(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url)
    ws.onopen = () => resolve()
    ws.onerror = reject
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const { resolve: res, reject: rej } = pending.get(m.id)
        pending.delete(m.id)
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
      }
    }
  })
}

function send(method, params = {}) {
  const id = ++msgId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')

  await send('Page.navigate', { url: BASE + '#/home' })
  await sleep(3000)

  // manifest
  const manifest = await evaluate(`
    fetch('${BASE}manifest.webmanifest').then(r => r.ok ? r.json() : null).catch(() => null)
  `)
  check('manifest 可解析', !!manifest?.name, manifest?.name)
  check('manifest 图标数量', (manifest?.icons?.length || 0) >= 3, `${manifest?.icons?.length} 个`)

  // SW 注册
  const swReg = await evaluate(`
    navigator.serviceWorker.getRegistrations().then(rs => rs.length)
  `)
  check('Service Worker 已注册', swReg > 0, `${swReg} 个`)

  const swState = await evaluate(`
    navigator.serviceWorker.ready.then(r => r.active ? r.active.state : 'none').catch(() => 'err')
  `)
  check('Service Worker 已激活', swState === 'activated', swState)

  // 离线：断网后重新加载
  await send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  })
  await send('Page.reload')
  await sleep(2500)
  const offlineTitle = await evaluate(`document.querySelector('.hero-title')?.textContent || ''`)
  check('断网后仍可打开', offlineTitle.includes('加油'), offlineTitle || '(空白)')

  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })

  const passed = results.filter(Boolean).length
  console.log(`\n通过 ${passed}/${results.length}`)
  ws.close()
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('PWA 检查失败:', e.message)
  process.exit(2)
})
