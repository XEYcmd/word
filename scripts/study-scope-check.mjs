/**
 * 学习范围校验：错词本 / 收藏 / 到期复习 可单独开一批，且词单只包含对应词。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/study-scope-check.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:5178/word/'
const TEST_BASE = BASE + (BASE.includes('?') ? '&' : '?') + 'scope-check=1'
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
  await send('Page.navigate', { url: TEST_BASE + hash })
  await sleep(1300)
}

async function reload() {
  await send('Page.reload')
  await sleep(1500)
}

async function clickChip(label) {
  const ok = await ev(`(() => {
    const b = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes(${JSON.stringify(label)}));
    if (!b) return false;
    b.click();
    return true;
  })()`)
  await sleep(300)
  return ok
}

async function startBatch() {
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(900)
  const s = await ev(`JSON.parse(localStorage.getItem('word-session-v1') || '{}')`)
  return s
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

  const now = Date.now()
  const HOUR = 60 * 60 * 1000
  const progress = {
    abandon: {
      id: 'abandon', step: 1, due: now - HOUR, last: now - 24 * HOUR,
      correct: 0, wrong: 1, mastered: false, wrongBook: true, starred: true,
    },
    ability: {
      id: 'ability', step: 2, due: now + 24 * HOUR, last: now - HOUR,
      correct: 2, wrong: 1, mastered: false, wrongBook: true, starred: false,
    },
    about: {
      id: 'about', step: 1, due: now - HOUR, last: now - 24 * HOUR,
      correct: 1, wrong: 0, mastered: false, wrongBook: false, starred: true,
    },
    above: {
      id: 'above', step: 1, due: now - HOUR, last: now - 24 * HOUR,
      correct: 1, wrong: 0, mastered: false, wrongBook: false, starred: false,
    },
    able: {
      id: 'able', step: 7, due: now - HOUR, last: now - 24 * HOUR,
      correct: 9, wrong: 0, mastered: true, wrongBook: false, starred: false,
    },
  }

  // 在每次新文档加载前注入测试进度；这样不会被上一个页面的 pagehide 落盘覆盖
  const injected = JSON.stringify({ version: 1, progress, daily: {}, settings: {}, lastGroup: 'all' })
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try {
      localStorage.setItem('word-memory-v1', ${JSON.stringify(injected)});
      localStorage.removeItem('word-session-v1');
    } catch (e) {}`,
  })

  await goto('#/study')
  await sleep(600)

  const chips = await ev(`[...document.querySelectorAll('.chip')].map(b => b.textContent.trim())`)
  check(
    '入口显示错词本 / 收藏 / 到期复习',
    chips.some((c) => c.includes('错词本 2')) &&
      chips.some((c) => c.includes('收藏 2')) &&
      chips.some((c) => c.includes('到期复习 3')),
    chips.join(' | '),
  )

  // 错词本
  check('点击错词本范围', await clickChip('错词本'))
  const wrongAvailable = await ev(`[...document.querySelectorAll('.dim')].find(e => e.textContent.includes('当前范围'))?.textContent || ''`)
  check('错词本数量正确', wrongAvailable.includes('2 个可学单词'), wrongAvailable)
  const wrongSession = await startBatch()
  check(
    '错词本只生成错词',
    wrongSession.scope === 'wrong' &&
      wrongSession.ids?.length === 2 &&
      wrongSession.ids.includes('abandon') &&
      wrongSession.ids.includes('ability'),
    JSON.stringify(wrongSession.ids),
  )
  check('测试题量不超过本批词数', wrongSession.testCount === 2, `${wrongSession.testCount}`)

  // 收藏
  await ev(`localStorage.removeItem('word-session-v1'); true`)
  await reload()
  check('点击收藏范围', await clickChip('收藏'))
  const starSession = await startBatch()
  check(
    '收藏只生成收藏词',
    starSession.scope === 'star' &&
      starSession.ids?.length === 2 &&
      starSession.ids.includes('abandon') &&
      starSession.ids.includes('about'),
    JSON.stringify(starSession.ids),
  )

  // 到期复习（mastered 的 able 不应进入）
  await ev(`localStorage.removeItem('word-session-v1'); true`)
  await reload()
  check('点击到期复习范围', await clickChip('到期复习'))
  const reviewSession = await startBatch()
  check(
    '到期复习只生成到期且未掌握的词',
    reviewSession.scope === 'review' &&
      reviewSession.ids?.length === 3 &&
      reviewSession.ids.includes('abandon') &&
      reviewSession.ids.includes('about') &&
      reviewSession.ids.includes('above') &&
      !reviewSession.ids.includes('able'),
    JSON.stringify(reviewSession.ids),
  )

  // 普通范围仍可用
  await ev(`localStorage.removeItem('word-session-v1'); true`)
  await reload()
  const allAvailable = await ev(`[...document.querySelectorAll('.dim')].find(e => e.textContent.includes('当前范围'))?.textContent || ''`)
  check('全部词库范围仍可用', /当前范围 \d{3,} 个可学单词/.test(allAvailable), allAvailable)

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '))

  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })

  const passed = results.filter((r) => r.ok).length
  console.log(`\n通过 ${passed}/${results.length}`)
  ws.close()
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('学习范围检查失败:', e.message)
  process.exit(2)
})
