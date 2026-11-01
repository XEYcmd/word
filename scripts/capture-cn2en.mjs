/**
 * 截取「中 → 英」选择题界面。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/capture-cn2en.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const CDP = process.env.CDP || 'http://127.0.0.1:9222'
const OUT = process.env.OUT || 'data/shots'

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
        const { resolve: res } = pending.get(m.id)
        pending.delete(m.id)
        res(m.result)
      }
    }
  })
}

function send(method, params = {}) {
  const id = ++msgId
  return new Promise((resolve) => {
    pending.set(id, { resolve })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ev(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (r.exceptionDetails) console.warn('  异常:', r.exceptionDetails.exception?.description?.split('\n')[0])
  return r.result?.value
}

async function shot(name) {
  fs.mkdirSync(OUT, { recursive: true })
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const p = path.join(OUT, `${name}.png`)
  fs.writeFileSync(p, Buffer.from(s.data, 'base64'))
  console.log('  截图:', p)
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')

  // 干净开始
  await send('Page.navigate', { url: 'http://127.0.0.1:5178/word/#/home' })
  await sleep(1500)
  await ev("localStorage.removeItem('word-session-v1'); localStorage.removeItem('word-memory-v1'); true")
  await send('Page.navigate', { url: 'http://127.0.0.1:5178/word/#/study' })
  await sleep(1800)
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(1000)
  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(1200)

  // 切到中→英
  await ev(`(() => {
    const b = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes('中 → 英'));
    b?.click();
  })()`)
  await sleep(900)
  await shot('cn2en-1-question')

  // 答一题看反馈
  await ev(`document.querySelectorAll('.option')[1]?.click()`)
  await sleep(600)
  await shot('cn2en-2-answered')

  // 回到英→中对比
  await ev(`(() => {
    const b = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes('英 → 中'));
    b?.click();
  })()`)
  await sleep(800)
  await shot('cn2en-3-en2cn')

  ws.close()
}

main().catch((e) => {
  console.error('截图失败:', e.message)
  process.exit(1)
})
