/**
 * 检查统计页柱状图：是否在容器内滚动（而不是撑破页面）。
 */
const CDP = process.env.CDP || 'http://127.0.0.1:9222'
const URL_ = process.argv[2] || 'http://127.0.0.1:5178/word/#/stats'

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
  return r.result?.value
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  })
  await send('Page.navigate', { url: URL_ })
  await sleep(2600)

  const info = await ev(`(() => {
    const chart = document.querySelector('.bar-chart');
    return {
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      chartScrollW: chart ? chart.scrollWidth : null,
      chartClientW: chart ? chart.clientWidth : null,
      chartOverflowX: chart ? getComputedStyle(chart).overflowX : null,
      bars: document.querySelectorAll('.bar-col').length,
    };
  })()`)

  console.log(JSON.stringify(info, null, 2))
  const pageOk = info.docScrollW <= info.docClientW + 1
  const chartScrolls = info.chartScrollW > info.chartClientW
  console.log(pageOk ? '✓ 页面没有横向溢出' : `✗ 页面溢出 ${info.docScrollW - info.docClientW}px`)
  console.log(
    chartScrolls
      ? `✓ 柱状图在容器内滚动（内容 ${info.chartScrollW} > 容器 ${info.chartClientW}）`
      : '· 柱状图未超出容器',
  )
  ws.close()
  process.exit(pageOk ? 0 : 1)
}

main().catch((e) => {
  console.error('失败:', e.message)
  process.exit(2)
})
