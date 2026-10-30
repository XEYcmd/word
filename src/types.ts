export type Level = 'core' | 'extended'

export interface Word {
  /** 稳定 id（小写归一） */
  id: string
  /** 展示词形 */
  word: string
  /** 音标（美式优先） */
  phonetic: string
  /** 英式音标 */
  ukphone: string
  /** 词性 */
  pos: string
  /** 中文释义 */
  trans: string
  /** 词形变化（如 arose arisen） */
  forms: string
  /** phrase | variant | '' */
  tag: string
  /** 词频序号，越小越常用 */
  rank: number
  /** 难度等级 */
  level: Level
  /** 教材单元（人教版） */
  unit?: string
}

export interface WordMeta {
  name: string
  count: number
  core: number
  extended: number
  source: string
  version: number
}

export interface WordBank {
  meta: WordMeta
  words: Word[]
}
