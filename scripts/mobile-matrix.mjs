/**
 * 多机型适配检查：在多种手机视口下逐页检测横向溢出。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/mobile-matrix.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5178/word/'
const CDP = process.env.CDP || 'http://127.0.0.1:9222'

const DEVICES = [
  { name: 'iPhone SE', w: 375, h: 667 },
  { name: 'iPhone 13/14', w: 390, h: 844 },
  { name: 'iPhone 14 Pro Max', w: 430, h: 932 },
  { name: 'Pixel 5', w: 393, h: 851 },
  { name: 'Galaxy S20', w: 360, h: 800 },
  { name: '小屏极限', w: 320, h: 568 },
]

const PAGES = [
  ['#/home', '首页'],
  ['#/study', '学习'],
  ['#/list', '词库'],
  ['#/stats', '统计'],
  ['#/settings', '设置'],
]

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
        pending.get(m.id)(m.result)
        pending.delete(m.id)
      }
    }
  })
}

function send(method, params = {}) {
  const id = ++msgId
  return new Promise((resolve) => {
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ev(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return `[异常] ${r.exceptionDetails.exception?.description}`
  return r.result?.value
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')

  let failures = 0
  for (const dev of DEVICES) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: dev.w,
      height: dev.h,
      deviceScaleFactor: 3,
      mobile: true,
    })
    const row = []
    for (const [hash, label] of PAGES) {
      await send('Page.navigate', { url: BASE + hash })
      await sleep(1100)
      const m = await ev(`(() => {
        const vw = document.documentElement.clientWidth;
        const sw = document.documentElement.scrollWidth;
        return { vw, sw, overflow: sw - vw };
      })()`)
      const ok = m.overflow <= 1
      if (!ok) failures++
      row.push(`${ok ? '✓' : '✗'}${label}`)
    }
    console.log(`${dev.name.padEnd(18)} ${dev.w}x${dev.h}  ${row.join(' ')}`)
  }

  console.log(failures === 0 ? '\n所有机型 × 页面均无横向溢出' : `\n发现 ${failures} 处溢出`)
  ws.close()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('检查失败:', e.message)
  process.exit(2)
})
