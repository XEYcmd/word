/**
 * 小批量场景调试：把每日新词调到 5，确认能正常开出一批词并进入选择题。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/debug-small-batch.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5178/word/'
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
  await send('Page.enable')
  await send('Runtime.enable')

  // 1. 写入小批量设置
  await send('Page.navigate', { url: BASE + '#/home' })
  await sleep(1500)
  await ev(`(() => {
    localStorage.setItem('word-memory-v1', JSON.stringify({
      version: 1,
      progress: {},
      daily: {},
      settings: { theme: 'auto', dailyNew: 5, dailyReview: 10, autoSpeak: false, accent: 'us', rate: 0.9, quizSize: 20, ignoreCase: true },
      lastGroup: 'all',
    }));
    localStorage.removeItem('word-session-v1');
    return 'ok';
  })()`)

  // 2. 进入学习页
  await send('Page.navigate', { url: BASE + '#/study' })
  await sleep(2000)

  console.log('当前设置:', await ev(`localStorage.getItem('word-memory-v1')`))
  console.log('入口按钮存在:', await ev(`!!document.querySelector('[data-action="start-batch"]')`))
  console.log('入口页提示:', String(await ev(`document.body.innerText`)).replace(/\s+/g, ' ').slice(0, 160))

  // 3. 开始学习
  console.log('\n点击开始学习:', await ev(`(() => { const b = document.querySelector('[data-action="start-batch"]'); if (!b) return 'not found'; b.click(); return 'ok' })()`))
  await sleep(1500)

  const session = await ev(`localStorage.getItem('word-session-v1')`)
  console.log('会话:', String(session).slice(0, 220))
  console.log('本批词数:', await ev(`document.querySelectorAll('.word-main').length ? '有卡片' : '无卡片'`))
  console.log('页面头部:', await ev(`document.querySelector('.study-wrap .row span')?.textContent || ''`))

  // 4. 进入第二关
  console.log('\n点击第二关:', await ev(`(() => { const s = [...document.querySelectorAll('.step')]; if (!s[1]) return 'no step'; s[1].click(); return 'ok' })()`))
  await sleep(1200)
  console.log('选项数:', await ev(`document.querySelectorAll('.option').length`))
  console.log('题干:', await ev(`document.querySelector('.quiz-prompt')?.textContent || '(无)'`))
  console.log('副标题:', await ev(`document.querySelector('.quiz-prompt-sub')?.textContent || '(无)'`))

  ws.close()
}

main().catch((e) => {
  console.error('调试失败:', e.message)
  process.exit(1)
})
