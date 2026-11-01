/**
 * 选择题选项数校验：逐题检查每道题都恰好有 4 个选项、且答案在其中。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/quiz-options-check.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5178/word/'
const CDP = process.env.CDP || 'http://127.0.0.1:9222'
const IS_FILE = BASE.startsWith('file:')

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
    throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  }
  return r.result?.value
}

async function goto(hash) {
  await send('Page.navigate', { url: IS_FILE ? BASE + hash : BASE + hash })
  await sleep(1300)
}

/** 走完一整轮选择题，逐题记录选项数量 */
async function walkChoiceStage(label) {
  const counts = []
  let guard = 0
  while (guard++ < 60) {
    const n = await ev(`document.querySelectorAll('.option').length`)
    const prompt = await ev(`document.querySelector('.quiz-prompt')?.textContent || ''`)
    if (n === 0) break // 已到结果页
    counts.push({ n, prompt })

    // 点击正确答案，快速推进
    await ev(`(() => {
      const opts = [...document.querySelectorAll('.option')];
      const idx = opts.findIndex(o => o.classList.contains('correct'));
      (idx >= 0 ? opts[idx] : opts[0]).click();
    })()`)
    await sleep(180)
    const nextBtn = await ev(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /下一题|查看结果/.test(x.textContent));
      if (!b) return false; b.click(); return true;
    })()`)
    await sleep(220)
    if (!nextBtn) break
  }
  return counts
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')

  const failures = []
  const report = (label, counts) => {
    const bad = counts.filter((c) => c.n !== 4)
    const status = bad.length === 0 ? '✓' : '✗'
    console.log(
      `${status} ${label}：共 ${counts.length} 题，` +
        `选项数分布 ${JSON.stringify(
          counts.reduce((acc, c) => ((acc[c.n] = (acc[c.n] || 0) + 1), acc), {}),
        )}`,
    )
    if (bad.length) {
      for (const b of bad.slice(0, 5)) {
        console.log(`    ✗ "${b.prompt}" 只有 ${b.n} 个选项`)
        failures.push({ label, ...b })
      }
    }
  }

  // ---------- 场景 1：默认全部词库（30 词）
  await goto('#/home')
  await ev("localStorage.removeItem('word-session-v1'); localStorage.removeItem('word-memory-v1'); true")
  await goto('#/study')
  await sleep(900)
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(900)
  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(900)
  report('全部词库（30 词）', await walkChoiceStage('all'))

  // ---------- 场景 2：按字母 A（通常词很多）
  await ev("localStorage.removeItem('word-session-v1'); true")
  await goto('#/home')
  await goto('#/study')
  await sleep(900)
  await ev(`(() => {
    const b = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes('按字母'));
    b?.click();
  })()`)
  await sleep(400)
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(900)
  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(900)
  report('按字母 A', await walkChoiceStage('letterA'))

  // ---------- 场景 3：小批量（通过设置页把每日新词调到最小 5，复习上限 10）
  await goto('#/home')
  await ev("localStorage.removeItem('word-session-v1'); localStorage.removeItem('word-memory-v1'); true")
  await goto('#/settings')
  await sleep(1000)
  // 走界面修改，确保 React 状态同步
  await ev(`(() => {
    const inputs = [...document.querySelectorAll('.number-input')];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const setVal = (el, v) => { setter.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    if (inputs[0]) setVal(inputs[0], 5);   // 每日新词
    if (inputs[1]) setVal(inputs[1], 10);  // 每日复习上限
    return inputs.length;
  })()`)
  await sleep(600)
  await goto('#/study')
  await sleep(1000)
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(1000)
  const batchSize = await ev(`(JSON.parse(localStorage.getItem('word-session-v1')||'{}').ids||[]).length`)
  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(900)
  report(`小批量（本批 ${batchSize} 词）`, await walkChoiceStage('small'))

  console.log(`\n${failures.length === 0 ? '全部通过' : `发现 ${failures.length} 处异常`}`)
  ws.close()
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('检查失败:', e.message)
  process.exit(2)
})
