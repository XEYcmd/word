import type { Word } from '../types'

/** 功能词/虚词：高中阶段基本已掌握，不值得占用学习位 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'but', 'to', 'in', 'on', 'at', 'by', 'for', 'from',
  'with', 'as', 'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did',
  'has', 'have', 'had', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
  'he', 'him', 'his', 'she', 'her', 'we', 'us', 'our', 'they', 'them', 'their', 'you', 'your',
  'not', 'no', 'yes', 'so', 'if', 'then', 'than', 'up', 'down', 'out', 'off', 'very',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
])

/** 是否值得放进学习队列 */
export function isStudyWorthy(w: Word): boolean {
  const base = w.word.toLowerCase().trim()
  if (STOPWORDS.has(base)) return false
  if (base.length < 3) return false
  if (base.includes(' ')) {
    // 'a can opener' / 'a garbage can' 这类不定冠词开头的短语价值低
    if (/^(a|an)\s/.test(base)) return false
    if (w.trans.length < 3) return false
    // 'the Antarctic' 这种带定冠词的地名仍可学
    return true
  }
  if (!w.trans || w.trans.length < 2) return false
  return true
}

/** 过滤掉不值得学的词 */
export function filterStudyWorthy(words: Word[]): Word[] {
  return words.filter(isStudyWorthy)
}
