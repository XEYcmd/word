/**
 * 实验：不同严格度的「干扰项排除」规则下，是否仍能为每个词凑满 4 个选项。
 * 用法：node scripts/experiment-overlap.mjs
 */
import fs from 'node:fs'

const bank = JSON.parse(fs.readFileSync('data/words.json', 'utf8'))
const words = bank.words

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

/** 规则 A：义项片段相同 / 互相包含 */
function overlapToken(a, b) {
  const ta = glossTokens(a)
  const tb = glossTokens(b)
  if (!ta.length || !tb.length) return false
  const sb = new Set(tb)
  for (const t of ta) if (sb.has(t)) return true
  for (const x of ta) for (const y of tb) {
    if (x.length >= 2 && y.includes(x)) return true
    if (y.length >= 2 && x.includes(y)) return true
  }
  return false
}

/** 规则 B：在 A 基础上，任意义项片段共享 ≥1 个汉字 */
function overlapChar(a, b) {
  if (overlapToken(a, b)) return true
  const ta = glossTokens(a)
  const tb = glossTokens(b)
  for (const x of ta) {
    const sx = new Set([...x])
    for (const y of tb) {
      for (const ch of y) {
        if (sx.has(ch)) return true
      }
    }
  }
  return false
}

/** 规则 C：共享 ≥2 个汉字（更宽松一些） */
function overlapChar2(a, b) {
  if (overlapToken(a, b)) return true
  const ta = glossTokens(a)
  const tb = glossTokens(b)
  for (const x of ta) {
    const sx = new Set([...x])
    for (const y of tb) {
      let shared = 0
      const seen = new Set()
      for (const ch of y) {
        if (sx.has(ch) && !seen.has(ch)) {
          seen.add(ch)
          shared++
        }
      }
      if (shared >= 2) return true
    }
  }
  return false
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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

function fill(target, rng, overlapFn) {
  const need = 3
  const picked = []
  const seenTrans = [target.trans]
  const seenIds = new Set([target.id])
  const ok = (d) =>
    !seenIds.has(d.id) && !seenTrans.some((t) => overlapFn(d.trans, t))
  for (const d of pickDistractors(target, words, words.length, rng)) {
    if (picked.length >= need) break
    if (!ok(d)) continue
    seenIds.add(d.id)
    seenTrans.push(d.trans)
    picked.push(d)
  }
  return picked.length
}

const rules = [
  ['A 义项相同/包含', overlapToken],
  ['B A + 共享任一字', overlapChar],
  ['C A + 共享≥2字', overlapChar2],
]

for (const [name, fn] of rules) {
  const rng = mulberry32(20261101)
  let short = 0
  let minFill = 99
  for (const w of words) {
    const n = fill(w, rng, fn)
    if (n < 3) short++
    minFill = Math.min(minFill, n)
  }
  console.log(`${name}: 凑不满 3 个干扰项的词 = ${short} / ${words.length}（最少 ${minFill} 个）`)
}
