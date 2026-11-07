/**
 * 断点续做校验：选择题 / 拼写答到一半刷新页面，应停在原题、保留反馈，统计不重复。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/resume-check.mjs [baseUrl]
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

async function ev(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (r.exceptionDetails) {
    throw new Error('JS 异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text))
  }
  return r.result.value
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function goto(hash) {
  await send('Page.navigate', { url: BASE + hash })
  await sleep(1300)
}

async function reload() {
  await send('Page.reload')
  await sleep(1500)
}

function session() {
  return ev(`JSON.parse(localStorage.getItem('word-session-v1') || '{}')`)
}

function promptText() {
  return ev(`document.querySelector('.quiz-prompt')?.textContent || ''`)
}

async function clickStep(index) {
  await ev(`[...document.querySelectorAll('.step')][${index}]?.click()`)
  await sleep(800)
}

async function typeSpell(value) {
  await ev(`(() => {
    const inp = document.querySelector('.spell-input');
    if (!inp) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, ${JSON.stringify(value)});
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`)
  await sleep(200)
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('找不到页面 target')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')

  const errors = []
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data)
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails?.exception?.description || 'unknown')
    }
  })

  // 干净状态开始一批
  await goto('#/home')
  await ev(`localStorage.removeItem('word-session-v1'); localStorage.removeItem('word-memory-v1'); true`)
  await goto('#/study')
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(900)
  await clickStep(1)

  // ---------------- 选择题：答一题后刷新
  const q1 = await promptText()
  await ev(`document.querySelectorAll('.option')[0]?.click()`)
  await sleep(500)
  const s1 = await session()
  const fb1 = await ev(`document.querySelector('.feedback')?.textContent || ''`)
  check(
    '选择题答题已记录',
    s1.choiceIndex === 0 && s1.choicePicked !== null && !!fb1,
    `index=${s1.choiceIndex}, picked=${s1.choicePicked}`,
  )

  await reload()
  const q1r = await promptText()
  const s1r = await session()
  const fb1r = await ev(`document.querySelector('.feedback')?.textContent || ''`)
  check(
    '选择题刷新后停在同一题',
    q1r === q1 && !!fb1r,
    `${q1r} / feedback=${!!fb1r}`,
  )
  check(
    '选择题刷新后统计不重复',
    s1r.choiceRight === s1.choiceRight && s1r.choiceWrong === s1.choiceWrong,
    `${s1.choiceRight}/${s1.choiceWrong} → ${s1r.choiceRight}/${s1r.choiceWrong}`,
  )

  // 点下一题，再刷新，应停在第 2 题且没有反馈
  await ev(`[...document.querySelectorAll('button')].find(b => /下一题/.test(b.textContent))?.click()`)
  await sleep(500)
  const q2 = await promptText()
  await reload()
  const q2r = await promptText()
  const s2r = await session()
  const fb2r = await ev(`document.querySelector('.feedback')?.textContent || ''`)
  check(
    '选择题刷新后停在第 2 题',
    q2r === q2 && s2r.choiceIndex === 1 && !fb2r,
    `index=${s2r.choiceIndex}, ${q2r}`,
  )

  // ---------------- 拼写：答一题后刷新
  await clickStep(2)
  const spellPrompt = await promptText()
  await typeSpell('zzzz')
  await ev(`[...document.querySelectorAll('button')].find(b => /提交/.test(b.textContent))?.click()`)
  await sleep(500)
  const sp1 = await session()
  const spellFb = await ev(`document.querySelector('.feedback')?.textContent || ''`)
  check(
    '拼写答题已记录',
    sp1.spellIndex === 0 && sp1.spellOk === false && !!spellFb,
    `index=${sp1.spellIndex}, ok=${sp1.spellOk}`,
  )

  await reload()
  const spellPromptR = await promptText()
  const sp1r = await session()
  const spellFbR = await ev(`document.querySelector('.feedback')?.textContent || ''`)
  const inputDisabled = await ev(`document.querySelector('.spell-input')?.disabled ?? false`)
  check(
    '拼写刷新后保留反馈',
    spellPromptR === spellPrompt && !!spellFbR && inputDisabled,
    `feedback=${!!spellFbR}, disabled=${inputDisabled}`,
  )
  check(
    '拼写刷新后统计不重复',
    sp1r.spellRight === sp1.spellRight && sp1r.spellWrong === sp1.spellWrong,
    `${sp1.spellRight}/${sp1.spellWrong} → ${sp1r.spellRight}/${sp1r.spellWrong}`,
  )

  // 下一题后刷新，应停在第 2 题且输入框可用
  await ev(`[...document.querySelectorAll('button')].find(b => /下一个|查看结果/.test(b.textContent))?.click()`)
  await sleep(500)
  const spellPrompt2 = await promptText()
  await reload()
  const spellPrompt2R = await promptText()
  const sp2r = await session()
  const inputEnabled = await ev(`document.querySelector('.spell-input') ? !document.querySelector('.spell-input').disabled : false`)
  check(
    '拼写刷新后停在第 2 题',
    spellPrompt2R === spellPrompt2 && sp2r.spellIndex === 1 && inputEnabled,
    `index=${sp2r.spellIndex}, ${spellPrompt2R}`,
  )

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '))

  const passed = results.filter((r) => r.ok).length
  console.log(`\n通过 ${passed}/${results.length}`)
  ws.close()
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('断点续做检查失败:', e.message)
  process.exit(2)
})
