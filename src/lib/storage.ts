/** 学习进度存储：localStorage，按词条 id 记录 SRS 状态 */

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface WordProgress {
  /** 词条 id */
  id: string
  /** 复习阶段（连续答对次数），0 表示新词 */
  step: number
  /** 下次复习时间戳（ms） */
  due: number
  /** 最近一次作答时间 */
  last: number
  /** 累计答对次数 */
  correct: number
  /** 累计答错次数 */
  wrong: number
  /** 是否已掌握（连续答对达到毕业阈值） */
  mastered: boolean
  /** 是否在错词本 */
  wrongBook: boolean
  /** 是否收藏 */
  starred: boolean
}

export interface DailyStat {
  /** 学习词数 */
  learned: number
  /** 复习词数 */
  reviewed: number
  /** 答对次数 */
  correct: number
  /** 答错次数 */
  wrong: number
  /** 学习时长（秒） */
  seconds: number
}

export interface Settings {
  theme: 'light' | 'dark' | 'auto'
  /** 每日新词目标 */
  dailyNew: number
  /** 每日复习上限 */
  dailyReview: number
  /** 自动发音 */
  autoSpeak: boolean
  /** 发音口音 */
  accent: 'us' | 'uk'
  /** 发音语速 */
  rate: number
  /** 每次测试题量 */
  quizSize: number
  /** 拼写测试是否忽略大小写 */
  ignoreCase: boolean
}

export interface AppState {
  version: number
  progress: Record<string, WordProgress>
  daily: Record<string, DailyStat>
  settings: Settings
  /** 上次学习的分组 key */
  lastGroup: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  dailyNew: 30,
  dailyReview: 100,
  autoSpeak: true,
  accent: 'us',
  rate: 0.9,
  quizSize: 20,
  ignoreCase: true,
}

const STORAGE_KEY = 'word-memory-v1'

export function emptyState(): AppState {
  return {
    version: 1,
    progress: {},
    daily: {},
    settings: { ...DEFAULT_SETTINGS },
    lastGroup: 'all',
  }
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      version: 1,
      progress: parsed.progress ?? {},
      daily: parsed.daily ?? {},
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      lastGroup: parsed.lastGroup ?? 'all',
    }
  } catch {
    return emptyState()
  }
}

let saveTimer: number | undefined

export function saveState(state: AppState) {
  // 合并写入，避免高频操作卡顿
  if (saveTimer) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch (e) {
      console.warn('保存进度失败', e)
    }
  }, 200)
}

export function saveStateNow(state: AppState) {
  if (saveTimer) window.clearTimeout(saveTimer)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (e) {
    console.warn('保存进度失败', e)
  }
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY)
}

/** 本地日期键 YYYY-MM-DD */
export function dateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
