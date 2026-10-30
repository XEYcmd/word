import { WORD_BANK } from '../data/words'
import type { Word, WordMeta } from '../types'

export const meta: WordMeta = WORD_BANK.meta
export const allWords: Word[] = WORD_BANK.words

/** id -> Word */
export const wordById = new Map<string, Word>(allWords.map((w) => [w.id, w]))

/** 字母分组（A-Z，# 表示非字母开头） */
export function firstLetter(word: string): string {
  const c = word.trim().charAt(0).toUpperCase()
  return c >= 'A' && c <= 'Z' ? c : '#'
}

/** 教材单元列表（人教版） */
export const unitList: string[] = (() => {
  const set = new Set<string>()
  for (const w of allWords) if (w.unit) set.add(w.unit)
  const order = ['必修一', '必修二', '必修三', '选必一', '选必二', '选必三', '选必四']
  return [...set].sort((a, b) => {
    const [ba, ua] = a.split(' ')
    const [bb, ub] = b.split(' ')
    const ia = order.indexOf(ba)
    const ib = order.indexOf(bb)
    if (ia !== ib) return ia - ib
    return (parseInt(ua?.replace(/\D/g, '') || '0', 10) || 0) - (parseInt(ub?.replace(/\D/g, '') || '0', 10) || 0)
  })
})()

export const letterList: string[] = (() => {
  const set = new Set<string>()
  for (const w of allWords) set.add(firstLetter(w.word))
  return [...set].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
})()
