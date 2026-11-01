/**
 * 检查：中→英模式下，干扰项英文词本身是否会「也能对应题干中文」。
 * 这里用词库自身的释义做反查：若某干扰项的释义与题干释义重合，则不合格。
 * 用法：node scripts/check-cn2en-semantics.mjs
 */
import fs from 'node:fs'

const bank = JSON.parse(fs.readFileSync('data/words.json', 'utf8'))
const words = bank.words
const byId = new Map(words.map((w) => [w.id, w]))

function glossTokens(trans) {
  if (!trans) return []
  const cleaned = trans
    .replace(/（[^）]*）/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
  return cleaned
    .split(/[；;，,、/／。.\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

function glossOverlaps(a, b) {
  const ta = glossTokens(a)
  const tb = glossTokens(b)
  if (!ta.length || !tb.length) return false
  const setB = new Set(tb)
  for (const t of ta) if (setB.has(t)) return true
  for (const x of ta) {
    const charsX = new Set([...x])
    for (const y of tb) {
      if (x.length >= 2 && y.includes(x)) return true
      if (y.length >= 2 && x.includes(y)) return true
      let shared = 0
      const seen = new Set()
      for (const ch of y) {
        if (charsX.has(ch) && !seen.has(ch)) {
          seen.add(ch)
          shared += 1
          if (shared >= 2) return true
        }
      }
    }
  }
  return false
}

// 已知的「跨语言近义」补充表：中文释义相近但字面不同的常见对
// 用于评估当前规则的漏网率，不作为运行时依赖
const KNOWN_SYNONYMS = [
  ['information', 'news'],
  ['information', 'message'],
  ['help', 'assist'],
  ['big', 'large'],
  ['small', 'little'],
  ['begin', 'start'],
  ['end', 'finish'],
  ['buy', 'purchase'],
  ['fast', 'quick'],
  ['happy', 'glad'],
  ['difficult', 'hard'],
  ['job', 'work'],
  ['road', 'street'],
  ['answer', 'reply'],
  ['look', 'see'],
  ['say', 'speak'],
  ['home', 'house'],
  ['photo', 'picture'],
  ['exam', 'test'],
  ['doctor', 'physician'],
  ['car', 'automobile'],
  ['film', 'movie'],
  ['store', 'shop'],
  ['ill', 'sick'],
  ['whole', 'entire'],
  ['often', 'frequently'],
]

let leaks = 0
const examples = []
for (const [a, b] of KNOWN_SYNONYMS) {
  const wa = words.find((w) => w.id === a)
  const wb = words.find((w) => w.id === b)
  if (!wa || !wb) continue
  const caught = glossOverlaps(wa.trans, wb.trans)
  if (!caught) {
    leaks++
    examples.push(`  ${a}（${wa.trans}） vs ${b}（${wb.trans}）`)
  }
}

console.log(`已知近义词对：${KNOWN_SYNONYMS.length} 组`)
console.log(`规则能拦下的：${KNOWN_SYNONYMS.length - leaks} 组`)
console.log(`漏网的：${leaks} 组`)
if (examples.length) {
  console.log('\n漏网示例（中文释义字面不重合，但英文近义）：')
  for (const e of examples.slice(0, 15)) console.log(e)
}

// 统计：若把近义表并入排除规则，能覆盖多少
console.log('\n建议：把常见近义词对作为补充规则加入，可显著减少「两个选项都说得通」。')
