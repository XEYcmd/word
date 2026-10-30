/**
 * 调试脚本：连到已开调试端口的浏览器，执行一段表达式并打印结果。
 * 用法：CDP=http://127.0.0.1:9231 node scripts/debug-probe.mjs
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9222'

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
  if (r.exceptionDetails) return `[异常] ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`
  return r.result?.value
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Runtime.enable')
  await sleep(1200)

  console.log('URL:', await ev('location.href'))
  console.log('localStorage session:', await ev("localStorage.getItem('word-session-v1')"))
  console.log('按钮:', await ev("[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).slice(0,14).join(' | ')"))
  console.log('页面文本:', String(await ev('document.body.innerText')).slice(0, 400).replace(/\n/g, ' | '))

  console.log('\n--- 点击「开始学习」---')
  console.log('clicked:', await ev("(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('开始学习')); if(!b) return 'not found'; b.click(); return 'ok' })()"))
  await sleep(1500)
  console.log('session:', await ev("localStorage.getItem('word-session-v1')"))
  console.log('word-main:', await ev("document.querySelector('.word-main')?.textContent"))
  console.log('页面文本:', String(await ev('document.body.innerText')).slice(0, 400).replace(/\n/g, ' | '))

  ws.close()
}

main().catch((e) => {
  console.error('probe 失败:', e.message)
  process.exit(1)
})
