/**
 * 手机端逐页体检：在真实移动视口下截图并检测布局问题。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/mobile-audit.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:5178/word/'
const CDP = process.env.CDP || 'http://127.0.0.1:9222'
const OUT = process.env.OUT || 'data/shots/mobile'
const W = Number(process.env.VW || 390)
const H = Number(process.env.VH || 844)

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

async function shot(name) {
  fs.mkdirSync(OUT, { recursive: true })
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(s.data, 'base64'))
}

async function metrics(label) {
  const m = await ev(`(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    const sh = document.documentElement.scrollHeight;
    const vh = window.innerHeight;
    const offenders = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') continue;
      if (r.right > vw + 1 || r.left < -1) {
        offenders.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0,40),
          left: Math.round(r.left), right: Math.round(r.right) });
      }
    }
    // 可点击元素尺寸检查（触控目标建议 >= 40px）
    const small = [];
    for (const el of document.querySelectorAll('button, .chip, .option, .grade-btn, .nav-item')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.height < 36) small.push({ text: (el.textContent||'').trim().slice(0,14), h: Math.round(r.height) });
    }
    // 字号过小
    const tinyText = [];
    for (const el of document.querySelectorAll('div,span,p,button,small')) {
      if (!el.textContent || !el.textContent.trim()) continue;
      if (el.children.length) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs > 0 && fs < 12) tinyText.push({ text: el.textContent.trim().slice(0,14), fs });
    }
    return { vw, sw, sh, vh, overflow: sw - vw, offenders: offenders.slice(0,6),
             smallTargets: small.slice(0,8), tinyText: tinyText.slice(0,6),
             fixedBottomOverlap: (() => {
               const nav = document.querySelector('.mobile-nav');
               if (!nav) return null;
               const nr = nav.getBoundingClientRect();
               return Math.round(nr.height);
             })() };
  })()`)
  const ok = m.overflow <= 1 && m.offenders.length === 0
  console.log(`${ok ? '✓' : '✗'} ${label}: 视口${m.vw} 文档${m.sw} 溢出${m.overflow}px 高度${m.sh}`)
  if (m.offenders.length) {
    for (const o of m.offenders) console.log(`    溢出 <${o.tag} class="${o.cls}"> ${o.left}~${o.right}`)
  }
  if (m.smallTargets.length) {
    console.log(`    触控目标偏小 ${m.smallTargets.length} 个: ${m.smallTargets.map(t=>`"${t.text}"(${t.h}px)`).join(', ')}`)
  }
  if (m.tinyText.length) {
    console.log(`    字号<12px: ${m.tinyText.map(t=>`"${t.text}"(${t.fs})`).join(', ')}`)
  }
  if (m.fixedBottomOverlap) console.log(`    底部导航高 ${m.fixedBottomOverlap}px`)
  return m
}

async function goto(hash) {
  await send('Page.navigate', { url: BASE + hash })
  await sleep(1400)
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 3,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })

  // 干净状态
  await goto('#/home')
  await ev("localStorage.removeItem('word-session-v1'); localStorage.removeItem('word-memory-v1'); true")

  await goto('#/home')
  await shot('1-home')
  await metrics('首页')

  await goto('#/study')
  await shot('2-study-start')
  await metrics('学习入口')

  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(1000)
  await shot('3-study-card')
  await metrics('背单词卡片')

  await ev(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('显示释义'))?.click()`)
  await sleep(400)
  await shot('4-study-revealed')
  await metrics('显示释义后')

  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(900)
  await shot('5-choice')
  await metrics('选择题')

  await ev(`document.querySelectorAll('.option')[0]?.click()`)
  await sleep(500)
  await shot('6-choice-answered')
  await metrics('选择题作答后')

  await ev(`[...document.querySelectorAll('.step')][2]?.click()`)
  await sleep(900)
  await shot('7-spell')
  await metrics('拼写')

  await goto('#/list')
  await shot('8-list')
  await metrics('词库')

  await goto('#/stats')
  await shot('9-stats')
  await metrics('统计')

  await goto('#/settings')
  await shot('10-settings')
  await metrics('设置')

  ws.close()
}

main().catch((e) => {
  console.error('体检失败:', e.message)
  process.exit(1)
})
