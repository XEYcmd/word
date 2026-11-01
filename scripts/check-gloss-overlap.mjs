/**
 * 词库层面的「选项互斥」校验（纯 Node，不需要浏览器）。
 * 直接读 data/words.json，对每个词模拟生成 4 个选项，
 * 检查干扰项释义是否与正确答案或其他干扰项重合。
 *
 * 用法：node scripts/check-gloss-overlap.mjs [样本数]
 */
import fs from 'node:fs'

const SAMPLE = Number(process.argv[2] || 0) // 0 = 全量

const bank = JSON.parse(fs.readFileSync('data/words.json', 'utf8'))
const words = bank.words

// ---- 与 src/lib/groups.ts 保持一致的分词/重合判断 ----
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
  if (ta.length === 0 || tb.length === 0) return false
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

// 与 groups.ts 的 mulberry32 一致
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- 近义词组（从 src/lib/synonyms.ts 读取，保持单一来源） ----
function loadSynonymGroups() {
  const src = fs.readFileSync('src/lib/synonyms.ts', 'utf8')
  const body = src.slice(src.indexOf('SYNONYM_GROUPS'))
  const groups = []
  for (const m of body.matchAll(/\[([^\[\]]*)\]/g)) {
    const items = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1].toLowerCase().trim())
    if (items.length >= 2) groups.push(items)
  }
  return groups
}

const SYN_GROUPS = loadSynonymGroups()
const GROUP_OF = new Map()
SYN_GROUPS.forEach((g, i) => {
  for (const w of g) {
    const list = GROUP_OF.get(w) ?? []
    list.push(i)
    GROUP_OF.set(w, list)
  }
})

function areSynonyms(a, b) {
  const ka = String(a).toLowerCase().trim()
  const kb = String(b).toLowerCase().trim()
  if (ka === kb) return true
  const ga = GROUP_OF.get(ka)
  const gb = GROUP_OF.get(kb)
  if (!ga || !gb) return false
  return ga.some((g) => gb.includes(g))
}

function pickDistractors(target, pool, n, rng) {
  const others = pool.filter((w) => w.id !== target.id && w.trans && w.trans !== target.trans)
  const scored = others.map((w) => {
    let score = rng() * 3
    if (Math.abs(w.trans.length - target.trans.length) <= 3) score += 2
    if (w.pos === target.pos) score += 1.5
    if (w.word[0]?.toLowerCase() === target.word[0]?.toLowerCase()) score += 1
    if (Math.abs(w.rank - target.rank) < 1500) score += 1
    return { w, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, n).map((s) => s.w)
}

function buildOptions(target, pool, n, rng, fallback) {
  const need = Math.max(0, n - 1)
  const seenTrans = [target.trans]
  const seenIds = new Set([target.id])
  const seenWords = [target.word]
  const picked = []
  const ok = (d) => {
    if (seenIds.has(d.id)) return false
    if (seenWords.some((w) => areSynonyms(d.word, w))) return false
    return !seenTrans.some((t) => glossOverlaps(d.trans, t))
  }
  const collect = (from) => {
    if (picked.length >= need) return
    for (const d of pickDistractors(target, from, from.length, rng)) {
      if (picked.length >= need) break
      if (!ok(d)) continue
      seenIds.add(d.id)
      seenWords.push(d.word)
      seenTrans.push(d.trans)
      picked.push(d)
    }
  }
  collect(pool)
  if (picked.length < need && fallback && fallback !== pool) collect(fallback)
  return [target, ...picked]
}

const sample = SAMPLE > 0 ? words.slice(0, SAMPLE) : words
const rng = mulberry32(20261101)

let shortOptions = 0
let overlaps = 0
let synonymHits = 0
const problems = []

for (const w of sample) {
  const opts = buildOptions(w, words, 4, rng, words)
  if (opts.length !== 4) {
    shortOptions++
    problems.push({ type: '选项不足', word: w.word, got: opts.length })
    continue
  }
  for (const d of opts.slice(1)) {
    if (glossOverlaps(d.trans, w.trans)) {
      overlaps++
      problems.push({
        type: '释义重合',
        word: w.word,
        trans: w.trans,
        distractor: d.word,
        dtrans: d.trans,
      })
    }
    if (areSynonyms(d.word, w.word)) {
      synonymHits++
      problems.push({
        type: '近义词',
        word: w.word,
        trans: w.trans,
        distractor: d.word,
        dtrans: d.trans,
      })
    }
  }
}

console.log(`样本 ${sample.length} 词（近义词组 ${SYN_GROUPS.length} 组）`)
console.log(`  选项不足 4 个：${shortOptions}`)
console.log(`  干扰项与答案释义重合：${overlaps}`)
console.log(`  干扰项与答案近义：${synonymHits}`)
if (problems.length) {
  console.log('\n示例问题：')
  for (const p of problems.slice(0, 10)) {
    if (p.type === '释义重合') {
      console.log(`  [${p.type}] ${p.word}（${p.trans}） vs ${p.distractor}（${p.dtrans}）`)
    } else {
      console.log(`  [${p.type}] ${p.word} 只有 ${p.got} 个选项`)
    }
  }
}
process.exit(problems.length === 0 ? 0 : 1)
