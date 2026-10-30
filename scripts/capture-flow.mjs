/**
 * 截图脚本：按流程走一遍并抓图。
 * 用法：CDP=http://127.0.0.1:9232 node scripts/capture-flow.mjs
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
  if (r.exceptionDetails) {
    console.warn('  表达式异常:', r.exceptionDetails.exception?.description?.split('\n')[0])
  }
  return r.result?.value
}

async function shot(name) {
  fs.mkdirSync(OUT, { recursive: true })
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const p = path.join(OUT, `flow-${name}.png`)
  fs.writeFileSync(p, Buffer.from(s.data, 'base64'))
  console.log('  截图:', p)
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')
  await sleep(1500)

  // 清空会话，从入口开始
  await ev("localStorage.removeItem('word-session-v1')")
  await send('Page.reload')
  await sleep(2000)

  await shot('1-start')

  await ev(`document.querySelector('[data-action="start-batch"]').click()`)
  await sleep(1200)
  await shot('2-study')

  // 显示释义后的状态
  await ev(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('显示释义'))?.click()`)
  await sleep(500)
  await shot('3-study-revealed')

  // 第二关
  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(1200)
  await shot('4-choice')

  // 答一题看反馈
  await ev(`document.querySelectorAll('.option')[0]?.click()`)
  await sleep(600)
  await shot('5-choice-answered')

  // 第三关
  await ev(`[...document.querySelectorAll('.step')][2]?.click()`)
  await sleep(1200)
  await shot('6-spell')

  // 完成页
  await ev(`[...document.querySelectorAll('.step')][3]?.click()`)
  await sleep(900)
  await shot('7-done')

  ws.close()
}

main().catch((e) => {
  console.error('截图失败:', e.message)
  process.exit(1)
})
