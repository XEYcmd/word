import type { Word } from '../types'
import { allWords, firstLetter } from './bank'
import { areSynonyms } from './synonyms'

export type GroupMode = 'all' | 'core' | 'extended' | 'letter' | 'unit' | 'wrong' | 'star' | 'review' | 'shuffle'

export interface GroupOption {
  key: string
  label: string
  mode: GroupMode
  /** letter 模式的字母 / unit 模式的单元名 */
  value?: string
}

export const MODE_LABEL: Record<GroupMode, string> = {
  all: '全部词库',
  core: '核心高频',
  extended: '拓展词汇',
  letter: '按字母',
  unit: '按教材单元',
  wrong: '错词本',
  star: '我的收藏',
  review: '今日复习',
  shuffle: '乱序模式',
}

export function buildGroupOptions(): GroupOption[] {
  const opts: GroupOption[] = [
    { key: 'all', label: '全部词库', mode: 'all' },
    { key: 'shuffle', label: '乱序模式', mode: 'shuffle' },
    { key: 'core', label: '核心高频', mode: 'core' },
    { key: 'extended', label: '拓展词汇', mode: 'extended' },
    { key: 'review', label: '今日复习', mode: 'review' },
    { key: 'wrong', label: '错词本', mode: 'wrong' },
    { key: 'star', label: '我的收藏', mode: 'star' },
  ]
  return opts
}

/** 稳定伪随机：同一个 seed 得到同一个顺序 */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice()
  let s = seed >>> 0 || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 按分组 key 取词 */
export function getGroupWords(
  key: string,
  opts: {
    letter?: string
    unit?: string
    shuffleSeed?: number
    starred?: Set<string>
    wrong?: Set<string>
    due?: Set<string>
  } = {},
): Word[] {
  switch (key) {
    case 'all':
      return allWords
    case 'core':
      return allWords.filter((w) => w.level === 'core')
    case 'extended':
      return allWords.filter((w) => w.level === 'extended')
    case 'letter': {
      const L = opts.letter ?? 'A'
      return allWords.filter((w) => firstLetter(w.word) === L)
    }
    case 'unit': {
      const U = opts.unit ?? ''
      return allWords.filter((w) => w.unit === U)
    }
    case 'wrong':
      return allWords.filter((w) => opts.wrong?.has(w.id))
    case 'star':
      return allWords.filter((w) => opts.starred?.has(w.id))
    case 'review':
      return allWords.filter((w) => opts.due?.has(w.id))
    case 'shuffle':
      return seededShuffle(allWords, opts.shuffleSeed ?? 20260101)
    default:
      return allWords
  }
}

/** 生成干扰项：优先同长度、同首字母，其次随机 */
export function pickDistractors(target: Word, pool: Word[], n: number, rng: () => number): Word[] {
  const others = pool.filter((w) => w.id !== target.id && w.trans && w.trans !== target.trans)
  const scored = others.map((w) => {
    let score = rng() * 3
    if (w.trans.length > 0 && Math.abs(w.trans.length - target.trans.length) <= 3) score += 2
    if (w.pos === target.pos) score += 1.5
    if (w.word[0]?.toLowerCase() === target.word[0]?.toLowerCase()) score += 1
    if (Math.abs(w.rank - target.rank) < 1500) score += 1
    return { w, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, n).map((s) => s.w)
}

// ---------------------------------------------------------------- 释义重合判断
/**
 * 把中文释义切成义项片段：'音乐，乐曲；唱片' -> ['音乐','乐曲','唱片']
 * 去掉括号注释、虚词等噪音。
 */
export function glossTokens(trans: string): string[] {
  if (!trans) return []
  const cleaned = trans
    .replace(/（[^）]*）/g, ' ') // 全角括号注释
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
  return cleaned
    .split(/[；;，,、/／。.\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

/**
 * 两个词的中文释义是否「意思相近」——即可能出现多个选项都对。
 * 判据（从严）：
 *   1) 存在完全相同的义项片段
 *   2) 一个义项被另一个包含（长度≥2）
 *   3) 任一对义项共享 ≥2 个汉字（如「信息」vs「新闻，消息」共享「信」）
 */
export function glossOverlaps(a: string, b: string): boolean {
  const ta = glossTokens(a)
  const tb = glossTokens(b)
  if (ta.length === 0 || tb.length === 0) return false

  const setB = new Set(tb)
  for (const t of ta) {
    if (setB.has(t)) return true
  }

  for (const x of ta) {
    const charsX = new Set([...x])
    for (const y of tb) {
      // 包含关系：'帮助' vs '帮助，协助'
      if (x.length >= 2 && y.includes(x)) return true
      if (y.length >= 2 && x.includes(y)) return true
      // 共享 ≥2 个不同汉字
      let shared = 0
      const seen = new Set<string>()
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

/**
 * 生成一道题的完整选项（含正确答案）。
 * - 干扰项的释义不得与正确答案重合（否则会出现多个选项都对）
 * - 干扰项与正确答案不能是近义词（news / information 这种）
 * - 干扰项彼此释义也不重合、也不能互为近义词
 * - 主词池不够时自动回退到 fallbackPool（通常是全词库），保证凑满 n 个选项
 */
export function buildOptions(
  target: Word,
  pool: Word[],
  n: number,
  rng: () => number,
  fallbackPool?: Word[],
): Word[] {
  const need = Math.max(0, n - 1)
  const seenTrans = [target.trans]
  const seenIds = new Set<string>([target.id])
  const seenWords = [target.word]
  const picked: Word[] = []

  const acceptable = (d: Word): boolean => {
    if (seenIds.has(d.id)) return false
    // 近义词：中→英时两个英文选项都说得通
    for (const w of seenWords) {
      if (areSynonyms(d.word, w)) return false
    }
    // 同义/近义释义：英→中时两个中文选项都说得通
    for (const t of seenTrans) {
      if (glossOverlaps(d.trans, t)) return false
    }
    return true
  }

  const collect = (from: Word[]) => {
    if (picked.length >= need) return
    for (const d of pickDistractors(target, from, from.length, rng)) {
      if (picked.length >= need) break
      if (!acceptable(d)) continue
      seenIds.add(d.id)
      seenWords.push(d.word)
      seenTrans.push(d.trans)
      picked.push(d)
    }
  }

  collect(pool)
  if (picked.length < need && fallbackPool && fallbackPool !== pool) {
    collect(fallbackPool)
  }

  return [target, ...picked]
}

/** 简易可复现随机数 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
