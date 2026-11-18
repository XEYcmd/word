/**
 * 今日学习量 / 防误触校验：
 *  - 同一个词在背单词、选择题、拼写三个阶段只计 1 次
 *  - 卡片只有「认识 / 不认识」，不认识需二次确认
 *  - 选择题第一次选错不计数，拼写第一次拼错不计数
 *  - 旧数据里膨胀的今日学习量会在加载时自动修正
 *
 * 用法：CDP=http://127.0.0.1:9222 node scripts/daily-count-check.mjs [baseUrl]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  await sleep(1800)
}

function session() {
  return ev(`JSON.parse(localStorage.getItem('word-session-v1') || '{}')`)
}

function todayStat() {
  return ev(`(() => {
    const s = JSON.parse(localStorage.getItem('word-memory-v1') || '{}');
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return (s.daily || {})[key] || null;
  })()`)
}

async function clickText(re) {
  return ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => ${re}.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  })()`)
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

/** 从本地词库源文件读取词条，用于确定选择题的正确答案 */
function loadBank() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const file = path.join(here, '..', 'src', 'data', 'words.ts')
  const src = fs.readFileSync(file, 'utf8')
  const start = src.indexOf('{', src.indexOf('WORD_BANK'))
  const end = src.lastIndexOf('}')
  const json = src.slice(start, end + 1)
  return JSON.parse(json)
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

  const bank = loadBank()
  const byWord = new Map(bank.words.map((w) => [w.word, w]))

  // ---------- 小批量：5 个新词，测试题量 5
  // 先加载页面，再用一次性脚本在重载前清空存储（否则 pagehide 会把旧状态写回来）
  await goto('#/home')
  const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.removeItem('word-session-v1'); localStorage.removeItem('word-memory-v1'); } catch (e) {}`,
  })
  await reload()
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
  await goto('#/settings')
  await sleep(900)
  await ev(`(() => {
    const inputs = [...document.querySelectorAll('.number-input')];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const setVal = (el, v) => { setter.call(el, String(v)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    if (inputs[0]) setVal(inputs[0], 5);
    if (inputs[1]) setVal(inputs[1], 10);
    if (inputs[2]) setVal(inputs[2], 5);
    return inputs.length;
  })()`)
  await sleep(400)

  await goto('#/study')
  await sleep(700)
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(900)
  const batch = await session()
  check('生成 5 词小批量', batch.ids?.length === 5 && batch.testCount === 5, `${batch.ids?.length} 词 / ${batch.testCount} 题`)

  // ---------- 第一关：卡片只有两档，不认识需二次确认
  await clickText(/显示释义/)
  await sleep(250)
  const gradeInfo = await ev(`(() => ({
    count: document.querySelectorAll('.grade-btn').length,
    texts: [...document.querySelectorAll('.grade-btn')].map(b => b.textContent.trim()),
  }))()`)
  check(
    '卡片只有认识 / 不认识',
    gradeInfo.count === 2 &&
      gradeInfo.texts.some((t) => t.includes('认识')) &&
      gradeInfo.texts.some((t) => t.includes('不认识')),
    gradeInfo.texts.join(' | '),
  )

  const word1 = await ev(`document.querySelector('.word-main')?.textContent || ''`)
  await ev(`document.querySelector('.grade-again')?.click()`)
  await sleep(250)
  let s = await session()
  let d = await todayStat()
  const confirmText = await ev(`document.querySelector('.grade-again')?.textContent || ''`)
  check(
    '第一次不认识只确认、不记录',
    s.studied?.length === 0 && (!d || d.learned + d.reviewed === 0) && confirmText.includes('确认不认识'),
    `studied=${s.studied?.length}, daily=${d ? d.learned + d.reviewed : 0}, btn=${confirmText.trim()}`,
  )
  check('仍停留在同一张卡片', (await ev(`document.querySelector('.word-main')?.textContent || ''`)) === word1)

  await ev(`document.querySelector('.grade-again')?.click()`)
  await sleep(300)
  s = await session()
  d = await todayStat()
  check(
    '第二次不认识才记录',
    s.studied?.length === 1 && d?.learned === 1 && d?.reviewed === 0,
    `studied=${s.studied?.length}, learned=${d?.learned}, reviewed=${d?.reviewed}`,
  )

  // 其余 4 个词点「认识」
  for (let i = 0; i < 4; i++) {
    await clickText(/显示释义/)
    await sleep(120)
    await ev(`document.querySelector('.grade-good')?.click()`)
    await sleep(220)
  }
  s = await session()
  d = await todayStat()
  check(
    '5 个词只记 5 次学习量',
    s.studied?.length === 5 && d?.learned === 5 && d?.reviewed === 0,
    `studied=${s.studied?.length}, learned=${d?.learned}, reviewed=${d?.reviewed}, total=${(d?.learned || 0) + (d?.reviewed || 0)}`,
  )

  // ---------- 第二关：第一次选错不计数，重选正确后仍只算 5 个词
  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(900)
  const prompt = await ev(`document.querySelector('.quiz-prompt')?.textContent || ''`)
  const bankWord = byWord.get(prompt.trim())
  const correctIdx = await ev(`(() => {
    const trans = ${JSON.stringify(bankWord?.trans || '')};
    return [...document.querySelectorAll('.option')].findIndex(o => o.textContent.includes(trans));
  })()`)
  check('定位选择题正确答案', !!bankWord && correctIdx >= 0, `${prompt} → ${correctIdx}`)

  const wrongIdx = correctIdx === 0 ? 1 : 0
  await ev(`document.querySelectorAll('.option')[${wrongIdx}]?.click()`)
  await sleep(350)
  s = await session()
  d = await todayStat()
  check(
    '选择题第一次选错不计数',
    s.choiceFirstWrong === wrongIdx && s.choicePicked === null && s.choiceRight + s.choiceWrong === 0,
    `firstWrong=${s.choiceFirstWrong}, picked=${s.choicePicked}, right/wrong=${s.choiceRight}/${s.choiceWrong}`,
  )
  check(
    '选择题首错后今日学习量不变',
    (d?.learned || 0) + (d?.reviewed || 0) === 5,
    `total=${(d?.learned || 0) + (d?.reviewed || 0)}`,
  )
  check(
    '选错选项已排除',
    (await ev(`document.querySelectorAll('.option.missed').length`)) === 1 &&
      (await ev(`document.querySelectorAll('.option')[${wrongIdx}]?.disabled ?? false`)) === true,
  )

  await ev(`document.querySelectorAll('.option')[${correctIdx}]?.click()`)
  await sleep(350)
  s = await session()
  d = await todayStat()
  check(
    '重选正确后正常记录',
    s.choicePicked === correctIdx && s.choiceOk === true && s.choiceRight === 1 && s.choiceWrong === 0,
    `picked=${s.choicePicked}, ok=${s.choiceOk}, right/wrong=${s.choiceRight}/${s.choiceWrong}`,
  )
  check(
    '选择题答对不重复增加学习量',
    d?.learned === 5 && d?.reviewed === 0,
    `learned=${d?.learned}, reviewed=${d?.reviewed}, total=${(d?.learned || 0) + (d?.reviewed || 0)}`,
  )

  // ---------- 第三关：第一次拼错不计数，第二次才记录
  await ev(`[...document.querySelectorAll('.step')][2]?.click()`)
  await sleep(900)
  await typeSpell('zzzz')
  await clickText(/提交/)
  await sleep(350)
  s = await session()
  d = await todayStat()
  const sameDisabled = await ev(
    `[...document.querySelectorAll('button')].find(b => /提交/.test(b.textContent))?.disabled ?? false`,
  )
  check(
    '拼写第一次拼错不计数',
    s.spellOk === null && s.spellFirstTyped === 'zzzz' && s.spellRight + s.spellWrong === 0,
    `ok=${s.spellOk}, first=${s.spellFirstTyped}, right/wrong=${s.spellRight}/${s.spellWrong}`,
  )
  check('拼写同一错误不能重复提交', sameDisabled === true)
  check(
    '拼写首错后今日学习量不变',
    (d?.learned || 0) + (d?.reviewed || 0) === 5,
    `total=${(d?.learned || 0) + (d?.reviewed || 0)}`,
  )

  await typeSpell('qqqq')
  await clickText(/提交/)
  await sleep(350)
  s = await session()
  d = await todayStat()
  check(
    '拼写第二次拼错才记录',
    s.spellOk === false && s.spellTyped === 'qqqq' && s.spellWrong === 1,
    `ok=${s.spellOk}, typed=${s.spellTyped}, right/wrong=${s.spellRight}/${s.spellWrong}`,
  )
  check(
    '拼写答错不重复增加学习量',
    d?.learned === 5 && d?.reviewed === 0,
    `learned=${d?.learned}, reviewed=${d?.reviewed}, total=${(d?.learned || 0) + (d?.reviewed || 0)}`,
  )

  // ---------- 旧数据修正：把 today.reviewed 改成膨胀值，刷新后应回到 5
  await ev(`(() => {
    const raw = JSON.parse(localStorage.getItem('word-memory-v1') || '{}');
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    raw.daily = raw.daily || {};
    raw.daily[key] = { ...(raw.daily[key] || {}), learned: 5, reviewed: 10, correct: 0, wrong: 0, seconds: 0 };
    localStorage.setItem('word-memory-v1', JSON.stringify(raw));
    return true;
  })()`)
  await reload()
  d = await todayStat()
  check(
    '加载时自动修正膨胀的今日学习量',
    d?.learned === 5 && d?.reviewed === 0,
    `learned=${d?.learned}, reviewed=${d?.reviewed}, total=${(d?.learned || 0) + (d?.reviewed || 0)}`,
  )

  await goto('#/home')
  await sleep(500)
  const homeToday = await ev(`document.querySelector('.chip.active')?.textContent || ''`)
  check('首页显示今日 5', homeToday.includes('今日 5'), homeToday)

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '))

  const passed = results.filter((r) => r.ok).length
  console.log(`\n通过 ${passed}/${results.length}`)
  ws.close()
  process.exit(passed === results.length ? 0 : 1)
}

main().catch((e) => {
  console.error('今日学习量检查失败:', e.message)
  process.exit(2)
})
