/**
 * 移动端布局诊断：找出宽度超过视口的元素。
 * 用法：CDP=http://127.0.0.1:9228 node scripts/layout-check.mjs <url>
 */
const URL_ = process.argv[2] || 'http://127.0.0.1:4179/word/#/home'
const CDP = process.env.CDP || 'http://127.0.0.1:9228'

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
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result.value
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')

  // 真正的移动端模拟：390x844 @3x
  const W = Number(process.env.VW || 390)
  const H = Number(process.env.VH || 844)
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 3,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })

  await send('Page.navigate', { url: URL_ })
  await sleep(2500)

  const report = await evaluate(`(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') continue;
        offenders.push({
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60),
          left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width),
        });
      }
    }
    return { vw, sw, overflow: sw - vw, count: offenders.length, top: offenders.slice(0, 12) };
  })()`)

  console.log(`视口宽 ${report.vw}，文档宽 ${report.sw}，溢出 ${report.overflow}px`)
  if (report.count) {
    console.log(`溢出元素 ${report.count} 个，前几个：`)
    for (const o of report.top) {
      console.log(`  <${o.tag} class="${o.cls}"> left=${o.left} right=${o.right} w=${o.width}`)
    }
  } else {
    console.log('✓ 没有元素超出视口')
  }

  // 顺便截一张真实移动端尺寸的图
  if (process.env.SHOT) {
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const fs = await import('node:fs')
    fs.writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'))
    console.log('截图:', process.env.SHOT)
  }

  ws.close()
  process.exit(report.overflow > 1 ? 1 : 0)
}

main().catch((e) => {
  console.error('诊断失败:', e.message)
  process.exit(2)
})
