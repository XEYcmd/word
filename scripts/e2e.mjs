/**
 * 通过 Chrome DevTools Protocol 驱动无头浏览器做端到端检查。
 * 用法：node scripts/e2e.mjs [baseUrl]
 * 前置：浏览器以 --remote-debugging-port=9222 启动。
 */

const BASE = process.argv[2] || 'http://localhost:5178/word/'
const CDP = process.env.CDP || 'http://127.0.0.1:9222'
/** 离线版用 file:// 打开时 hash 直接拼在文件地址后面 */
const IS_FILE = BASE.startsWith('file:')

let ws
let msgId = 0
const pending = new Map()

function connect(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url)
    ws.onopen = () => resolve()
    ws.onerror = (e) => reject(e)
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(JSON.stringify(msg.error)))
        else res(msg.result)
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
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function goto(hash) {
  const url = IS_FILE ? BASE + hash.replace('#', '#') : BASE + hash
  await send('Page.navigate', { url })
  await sleep(1200)
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  if (!page) throw new Error('找不到页面 target')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')

  const consoleErrors = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails?.exception?.description || 'unknown')
    }
  })

  // --- 1. 首页
  await goto('#/home')
  const homeTitle = await evaluate(`document.querySelector('.hero-title')?.textContent || ''`)
  check('首页渲染', homeTitle.includes('加油'), homeTitle)
  const wordCount = await evaluate(`document.querySelectorAll('.word-row').length`)
  check('推荐词列表', wordCount > 0, `${wordCount} 条`)

  // --- 2. 背单词：显示释义 + 评分
  await goto('#/study')
  const before = await evaluate(`localStorage.getItem('word-memory-v1')`)
  const word1 = await evaluate(`document.querySelector('.word-main')?.textContent || ''`)
  check('学习卡片显示单词', !!word1, word1)

  await evaluate(`document.querySelector('.btn-primary.btn-lg')?.click()`)
  await sleep(300)
  const trans = await evaluate(`document.querySelector('.word-trans')?.textContent || ''`)
  check('显示释义', !!trans, trans.slice(0, 24))

  const gradeBtns = await evaluate(`document.querySelectorAll('.grade-btn').length`)
  check('四个评分按钮', gradeBtns === 4, `${gradeBtns} 个`)

  await evaluate(`document.querySelector('.grade-good')?.click()`)
  await sleep(600)
  const word2 = await evaluate(`document.querySelector('.word-main')?.textContent || ''`)
  check('评分后切到下一个词', word2 && word2 !== word1, `${word1} -> ${word2}`)

  const saved = await evaluate(`localStorage.getItem('word-memory-v1')`)
  const progressCount = await evaluate(
    `Object.keys(JSON.parse(localStorage.getItem('word-memory-v1')).progress).length`,
  )
  check('进度写入 localStorage', progressCount > 0, `${progressCount} 条`)
  check('存储内容变化', saved !== before)

  // --- 3. 选择题
  await goto('#/quiz')
  const q = await evaluate(`document.querySelector('.quiz-prompt')?.textContent || ''`)
  const opts = await evaluate(`document.querySelectorAll('.option').length`)
  check('测试题渲染', !!q && opts === 4, `${q} / ${opts} 选项`)

  // 点正确答案：找到 option.correct 前先随便点一个，验证反馈
  await evaluate(`document.querySelectorAll('.option')[0].click()`)
  await sleep(500)
  const feedback = await evaluate(`document.querySelector('.feedback')?.textContent || ''`)
  check('作答即时反馈', !!feedback, feedback.slice(0, 30))

  // --- 4. 拼写模式
  await goto('#/quiz')
  await evaluate(
    `[...document.querySelectorAll('.chip')].find(c=>c.textContent.includes('拼写'))?.click()`,
  )
  await sleep(600)
  const hasInput = await evaluate(`!!document.querySelector('.spell-input')`)
  check('拼写模式输入框', hasInput)

  if (hasInput) {
    await evaluate(`(() => {
      const inp = document.querySelector('.spell-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, 'wronganswer');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    await sleep(200)
    await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('提交'))?.click()`)
    await sleep(500)
    const spellFb = await evaluate(`document.querySelector('.feedback')?.textContent || ''`)
    check('拼写判错反馈', spellFb.includes('答错'), spellFb.slice(0, 30))
  }

  // --- 5. 词库页搜索
  await goto('#/list')
  const rows0 = await evaluate(`document.querySelectorAll('.word-row').length`)
  await evaluate(`(() => {
    const inp = document.querySelector('input[placeholder*="搜索"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'abandon');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await sleep(500)
  const rows1 = await evaluate(`document.querySelectorAll('.word-row').length`)
  const found = await evaluate(`document.querySelector('.word-row-word')?.textContent || ''`)
  check('词库搜索', rows0 > 0 && found.toLowerCase() === 'abandon', `${rows0} -> ${rows1}, 首个=${found}`)

  // --- 6. 统计页
  await goto('#/stats')
  const heatCells = await evaluate(`document.querySelectorAll('.heat-cell').length`)
  check('热力图渲染', heatCells > 100, `${heatCells} 格`)

  // --- 7. 设置页：主题切换
  await goto('#/settings')
  const themeBefore = await evaluate(`document.documentElement.dataset.theme`)
  await evaluate(
    `[...document.querySelectorAll('.setting-row')].find(r=>r.textContent.includes('主题'))?.querySelector('select')?.dispatchEvent(new Event('change',{bubbles:true}))`,
  )
  const themeSelect = await evaluate(`(() => {
    const row = [...document.querySelectorAll('.setting-row')].find(r=>r.textContent.includes('主题'));
    const sel = row?.querySelector('select');
    if (!sel) return null;
    sel.value = 'dark';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()`)
  await sleep(400)
  const themeAfter = await evaluate(`document.documentElement.dataset.theme`)
  check('主题切换', themeAfter === 'dark', `${themeBefore} -> ${themeAfter} (select=${themeSelect})`)

  // --- 8. 深色模式截图
  await goto('#/home')
  await sleep(500)

  // --- 9. 数据持久化（刷新后仍在）
  await send('Page.reload')
  await sleep(1500)
  const persisted = await evaluate(
    `Object.keys(JSON.parse(localStorage.getItem('word-memory-v1') || '{}').progress || {}).length`,
  )
  check('刷新后进度保留', persisted > 0, `${persisted} 条`)

  // --- 10. 无 JS 报错
  check('无未捕获异常', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  const passed = results.filter((r) => r.ok).length
  console.log(`\n通过 ${passed}/${results.length}`)
  ws.close()
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('E2E 失败:', e.message)
  process.exit(2)
})
