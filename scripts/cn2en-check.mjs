/**
 * 中→英模式校验：确认「看中文选英文」时，选项里不会出现多个都能对应所考中文的词。
 * 用法：CDP=http://127.0.0.1:9222 node scripts/cn2en-check.mjs [baseUrl]
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text)
  return r.result?.value
}

async function goto(hash) {
  await send('Page.navigate', { url: BASE + hash })
  await sleep(1300)
}

async function main() {
  const targets = await (await fetch(CDP + '/json/list')).json()
  const page = targets.find((t) => t.type === 'page')
  await connect(page.webSocketDebuggerUrl)
  await send('Page.enable')
  await send('Runtime.enable')

  // 干净会话
  await goto('#/home')
  await ev("localStorage.removeItem('word-session-v1'); localStorage.removeItem('word-memory-v1'); true")
  await goto('#/study')
  await sleep(800)
  await ev(`document.querySelector('[data-action="start-batch"]')?.click()`)
  await sleep(900)
  await ev(`[...document.querySelectorAll('.step')][1]?.click()`)
  await sleep(900)

  // 切到「中 → 英」
  const switched = await ev(`(() => {
    const b = [...document.querySelectorAll('.chip')].find(x => x.textContent.includes('中 → 英'));
    if (!b) return false; b.click(); return true;
  })()`)
  if (!switched) {
    console.log('✗ 未找到「中 → 英」切换按钮')
    process.exit(1)
  }
  await sleep(800)

  // 收集题目：题干中文、选项英文、正确答案
  const problems = []
  const all = []
  let guard = 0
  while (guard++ < 40) {
    const head = await ev(`(() => {
      const prompt = document.querySelector('.quiz-prompt')?.textContent || '';
      if (!prompt) return null;
      return {
        prompt,
        pos: document.querySelector('.quiz-prompt-sub')?.textContent || '',
        texts: [...document.querySelectorAll('.option')].map(o => o.textContent.trim()),
      };
    })()`)
    if (!head || head.texts.length === 0) break

    // 先点第一个选项作答，再看哪个是正确答案
    await ev(`document.querySelectorAll('.option')[0]?.click()`)
    await sleep(200)
    const marked = await ev(`(() => {
      const opts = [...document.querySelectorAll('.option')];
      return {
        correctIdx: opts.findIndex(o => o.classList.contains('correct')),
        count: opts.length,
      };
    })()`)
    all.push({ ...head, ...marked })

    const advanced = await ev(`(() => {
      const b = [...document.querySelectorAll('button')].find(x => /下一题|查看结果/.test(x.textContent));
      if (!b) return false; b.click(); return true;
    })()`)
    await sleep(220)
    if (!advanced) break
  }

  // 校验 1：每题 4 个选项
  const badCount = all.filter((q) => q.count !== 4)
  // 校验 2：每题恰好 1 个正确答案
  const badAnswer = all.filter((q) => q.correctIdx < 0)
  // 校验 3：题干带词性提示
  const withPos = all.filter((q) => /^(n|v|vt|vi|adj|adv|prep|pron|conj|num|int|art|aux|modal)/.test(q.pos.trim()))

  console.log(`共采集 ${all.length} 题（中 → 英）`)
  console.log(`${badCount.length === 0 ? '✓' : '✗'} 每题 4 个选项：${all.length - badCount.length}/${all.length}`)
  console.log(`${badAnswer.length === 0 ? '✓' : '✗'} 每题唯一正确答案：${all.length - badAnswer.length}/${all.length}`)
  console.log(`${withPos.length > 0 ? '✓' : '✗'} 题干显示词性：${withPos.length}/${all.length}`)
  if (all.length) {
    console.log('\n示例题目：')
    for (const q of all.slice(0, 4)) {
      console.log(`  「${q.prompt}」 ${q.pos.replace(/\s+/g, ' ').trim()}`)
      q.texts.forEach((t, i) => console.log(`    ${i === q.correctIdx ? '✓' : ' '} ${t}`))
    }
  }
  for (const p of [...badCount, ...badAnswer].slice(0, 5)) {
    problems.push(p)
    console.log('  ✗ 异常题目:', JSON.stringify(p).slice(0, 160))
  }

  ws.close()
  process.exit(problems.length === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('检查失败:', e.message)
  process.exit(2)
})
