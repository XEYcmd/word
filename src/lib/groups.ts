import type { Word } from '../types'
import { allWords, firstLetter } from './bank'

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
