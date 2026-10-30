/**
 * 端到端测试：覆盖「背单词 → 选择题 → 拼写」完整流程。
 * 用法：
 *   CDP=http://127.0.0.1:9222 node scripts/e2e.mjs [baseUrl]
 * 离线版：CDP=... node scripts/e2e.mjs "file:///.../背单词.html"
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
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
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
  await send('Page.navigate', { url: IS_FILE ? BASE + hash : BASE + hash })
  await sleep(1200)
}

/** 点击文本包含指定内容的按钮 */
async function clickByText(text, selector = 'button') {
  return evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find(b => b.textContent.includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`)
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

  // ============================================================ 1. 首页
  await goto('#/home')
  const homeTitle = await evaluate(`document.querySelector('.hero-title')?.textContent || ''`)
  check('首页渲染', homeTitle.includes('加油'), homeTitle)

  const flowHint = await evaluate(`document.querySelector('.flow-hint')?.textContent || ''`)
  check('首页展示三关流程', flowHint.includes('背单词') && flowHint.includes('选择题') && flowHint.includes('拼写'), flowHint.replace(/\s+/g, ' '))

  const recommendCount = await evaluate(`document.querySelectorAll('.word-row').length`)
  check('推荐词列表', recommendCount > 0, `${recommendCount} 条`)

  // 清空旧会话，保证从干净状态开始
  await evaluate(`localStorage.removeItem('word-session-v1'); true`)
  await goto('#/study')

  // ============================================================ 2. 第一关：背单词
  const hasStart = await evaluate(`!!document.querySelector('[data-action="start-batch"]')`)
  check('学习入口页', hasStart)

  const steps = await evaluate(`document.querySelectorAll('.step').length`)
  check('三关步骤条', steps === 4, `${steps} 步（含完成）`)

  await evaluate(`document.querySelector('[data-action="start-batch"]').click()`)
  await sleep(900)

  const word1 = await evaluate(`document.querySelector('.word-main')?.textContent || ''`)
  check('第一关显示单词', !!word1, word1)

  // 显示释义
  await clickByText('显示释义')
  await sleep(300)
  const trans1 = await evaluate(`document.querySelector('.word-trans')?.textContent || ''`)
  check('第一关显示释义', !!trans1, trans1.slice(0, 22))

  const gradeBtns = await evaluate(`document.querySelectorAll('.grade-btn').length`)
  check('四档评分按钮', gradeBtns === 4, `${gradeBtns} 个`)

  // 评分推进
  await evaluate(`document.querySelector('.grade-good')?.click()`)
  await sleep(500)
  const word2 = await evaluate(`document.querySelector('.word-main')?.textContent || ''`)
  check('评分后进入下一词', word2 && word2 !== word1, `${word1} → ${word2}`)

  const savedProgress = await evaluate(
    `Object.keys(JSON.parse(localStorage.getItem('word-memory-v1') || '{}').progress || {}).length`,
  )
  check('进度写入 localStorage', savedProgress > 0, `${savedProgress} 条`)

  const sessionSaved = await evaluate(
    `(JSON.parse(localStorage.getItem('word-session-v1') || '{}').studied || []).length`,
  )
  check('会话记录已背词', sessionSaved > 0, `${sessionSaved} 个`)

  // 直接跳到第一关结尾：点步骤条进第二关
  await evaluate(`(() => {
    const steps = [...document.querySelectorAll('.step')];
    steps[1]?.click();
  })()`)
  await sleep(800)

  const stageNow = await evaluate(`document.querySelector('.step.active .step-text b')?.textContent || ''`)
  check('进入第二关', stageNow.includes('选择题'), stageNow)

  // ============================================================ 3. 第二关：选择题
  const quizPrompt = await evaluate(`document.querySelector('.quiz-prompt')?.textContent || ''`)
  const options = await evaluate(`document.querySelectorAll('.option').length`)
  check('选择题渲染', !!quizPrompt && options === 4, `${quizPrompt} / ${options} 选项`)

  await evaluate(`document.querySelectorAll('.option')[0].click()`)
  await sleep(500)
  const feedback = await evaluate(`document.querySelector('.feedback')?.textContent || ''`)
  check('选择题即时反馈', !!feedback, feedback.replace(/\s+/g, ' ').slice(0, 34))

  await clickByText('下一题')
  await sleep(400)
  const afterNext = await evaluate(`document.querySelectorAll('.option').length`)
  check('可进入下一题', afterNext === 4)

  // ============================================================ 4. 第三关：拼写
  await evaluate(`(() => {
    const steps = [...document.querySelectorAll('.step')];
    steps[2]?.click();
  })()`)
  await sleep(800)

  const spellStage = await evaluate(`document.querySelector('.step.active .step-text b')?.textContent || ''`)
  check('进入第三关', spellStage.includes('拼写'), spellStage)

  const hasInput = await evaluate(`!!document.querySelector('.spell-input')`)
  check('拼写输入框', hasInput)

  if (hasInput) {
    await evaluate(`(() => {
      const inp = document.querySelector('.spell-input');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, 'definitelywrong');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    })()`)
    await sleep(200)
    await clickByText('提交')
    await sleep(500)
    const spellFb = await evaluate(`document.querySelector('.feedback')?.textContent || ''`)
    check('拼写判错并显示正确答案', spellFb.includes('拼错') && spellFb.includes('正确'), spellFb.replace(/\s+/g, ' ').slice(0, 40))
  }

  // ============================================================ 5. 完成页
  await evaluate(`(() => {
    const steps = [...document.querySelectorAll('.step')];
    steps[3]?.click();
  })()`)
  await sleep(700)
  const doneText = await evaluate(`document.querySelector('.card h2')?.textContent || ''`)
  check('今日总结页', doneText.includes('完成'), doneText)

  // ============================================================ 6. 词库
  await goto('#/list')
  const rows0 = await evaluate(`document.querySelectorAll('.word-row').length`)
  await evaluate(`(() => {
    const inp = document.querySelector('input[placeholder*="搜索"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'abandon');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  })()`)
  await sleep(500)
  const found = await evaluate(`document.querySelector('.word-row-word')?.textContent || ''`)
  check('词库搜索', rows0 > 0 && found.toLowerCase() === 'abandon', `${rows0} 行 → 首个=${found}`)

  // ============================================================ 7. 统计
  await goto('#/stats')
  const heatCells = await evaluate(`document.querySelectorAll('.heat-cell').length`)
  check('热力图渲染', heatCells > 100, `${heatCells} 格`)

  // ============================================================ 8. 主题
  await goto('#/settings')
  const themeBefore = await evaluate(`document.documentElement.dataset.theme`)
  await evaluate(`(() => {
    const row = [...document.querySelectorAll('.setting-row')].find(r => r.textContent.includes('主题'));
    const sel = row?.querySelector('select');
    if (!sel) return null;
    sel.value = 'dark';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return sel.value;
  })()`)
  await sleep(400)
  const themeAfter = await evaluate(`document.documentElement.dataset.theme`)
  check('主题切换', themeAfter === 'dark', `${themeBefore} → ${themeAfter}`)

  // ============================================================ 9. 持久化
  await goto('#/study')
  await sleep(600)
  const persisted = await evaluate(
    `Object.keys(JSON.parse(localStorage.getItem('word-memory-v1') || '{}').progress || {}).length`,
  )
  check('刷新后进度保留', persisted > 0, `${persisted} 条`)

  // 会话恢复：应直接回到第三关（上次所在阶段）
  const restoredStage = await evaluate(`document.querySelector('.step.active .step-text b')?.textContent || ''`)
  check('会话阶段已恢复', !!restoredStage, restoredStage)

  // ============================================================ 10. 无异常
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
