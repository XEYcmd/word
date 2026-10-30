import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Word } from '../types'
import { allWords } from './bank'
import { filterStudyWorthy } from './worth'
import { seededShuffle } from './groups'
import { dateKey } from './storage'
import type { AppState } from './storage'

/**
 * 每日学习会话：把「背单词 → 选择题 → 拼写」串成一条流程。
 * 三关共用同一批词（sessionWords），保证背完就测、测完就写。
 *
 * 流程状态存 localStorage，关掉页面再回来能接着做。
 */

export type Stage = 'study' | 'choice' | 'spell' | 'done'
export type Scope = 'all' | 'core' | 'extended' | 'letter' | 'unit'

export interface SessionState {
  /** 日期，跨天自动开新会话 */
  date: string
  scope: Scope
  letter: string
  unit: string
  /** 本批词 id（三关共用） */
  ids: string[]
  /** 当前阶段 */
  stage: Stage
  /** 本批里已经背过的词 id（背单词关的进度） */
  studied: string[]
  /** 选择题正确 / 错误数 */
  choiceRight: number
  choiceWrong: number
  /** 拼写正确 / 错误数 */
  spellRight: number
  spellWrong: number
}

const KEY = 'word-session-v1'

export function emptySession(): SessionState {
  return {
    date: dateKey(),
    scope: 'all',
    letter: 'A',
    unit: '',
    ids: [],
    stage: 'study',
    studied: [],
    choiceRight: 0,
    choiceWrong: 0,
    spellRight: 0,
    spellWrong: 0,
  }
}

export function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptySession()
    const s = JSON.parse(raw) as SessionState
    if (s.date !== dateKey()) {
      // 新的一天：保留范围设置，重置进度
      const fresh = emptySession()
      fresh.scope = s.scope ?? 'all'
      fresh.letter = s.letter ?? 'A'
      fresh.unit = s.unit ?? ''
      return fresh
    }
    return { ...emptySession(), ...s }
  } catch {
    return emptySession()
  }
}

export function saveSession(s: SessionState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* 忽略 */
  }
}

/** 按范围取候选词（已过滤功能词，按词频排序） */
export function candidateWords(
  scope: Scope,
  opts: { letter?: string; unit?: string } = {},
): Word[] {
  let pool: Word[]
  switch (scope) {
    case 'core':
      pool = allWords.filter((w) => w.level === 'core')
      break
    case 'extended':
      pool = allWords.filter((w) => w.level === 'extended')
      break
    case 'letter':
      pool = allWords.filter((w) => w.word[0]?.toUpperCase() === (opts.letter ?? 'A'))
      break
    case 'unit':
      pool = allWords.filter((w) => w.unit === opts.unit)
      break
    default:
      pool = allWords
  }
  return filterStudyWorthy(pool).sort((a, b) => a.rank - b.rank)
}

/**
 * 生成本次学习的词单：
 *  - 优先收录到期的复习词
 *  - 再用未学过的核心词补足
 */
export function buildBatch(
  state: AppState,
  scope: Scope,
  opts: { letter?: string; unit?: string; newCount?: number },
): Word[] {
  const now = Date.now()
  const pool = candidateWords(scope, opts)
  const due = pool.filter((w) => {
    const p = state.progress[w.id]
    return !!p && p.last > 0 && p.due <= now && !p.mastered
  })
  const fresh = pool.filter((w) => {
    const p = state.progress[w.id]
    return !p || p.last === 0
  })
  const limit = opts.newCount ?? state.settings.dailyNew
  return [...due.slice(0, state.settings.dailyReview), ...fresh.slice(0, limit)]
}

export const STAGE_ORDER: Stage[] = ['study', 'choice', 'spell', 'done']

export const STAGE_META: Record<Stage, { label: string; short: string; icon: string; desc: string }> = {
  study: { label: '第一关 · 背单词', short: '背单词', icon: '🃏', desc: '卡片过一遍，先认识这些词' },
  choice: { label: '第二关 · 选择题', short: '选择题', icon: '✍️', desc: '四选一，检验记没记住' },
  spell: { label: '第三关 · 拼写', short: '拼写', icon: '⌨️', desc: '看中文写出英文，真正掌握' },
  done: { label: '今日完成', short: '完成', icon: '🎉', desc: '三关都过了，明天见' },
}

/** 会话状态 hook（组件内使用） */
export function useSession() {
  const [session, setSession] = useState<SessionState>(() => loadSession())

  useEffect(() => {
    saveSession(session)
  }, [session])

  const words = useMemo<Word[]>(() => {
    const map = new Map(allWords.map((w) => [w.id, w]))
    return session.ids.map((id) => map.get(id)).filter((w): w is Word => !!w)
  }, [session.ids])

  const startBatch = useCallback(
    (state: AppState, scope: Scope, opts: { letter?: string; unit?: string } = {}) => {
      const batch = buildBatch(state, scope, opts)
      setSession((s) => ({
        ...emptySession(),
        scope,
        letter: opts.letter ?? s.letter,
        unit: opts.unit ?? s.unit,
        ids: batch.map((w) => w.id),
        stage: 'study',
      }))
      return batch
    },
    [],
  )

  const markStudied = useCallback((id: string) => {
    setSession((s) => (s.studied.includes(id) ? s : { ...s, studied: [...s.studied, id] }))
  }, [])

  const setStage = useCallback((stage: Stage) => {
    setSession((s) => ({ ...s, stage }))
  }, [])

  const recordChoice = useCallback((ok: boolean) => {
    setSession((s) => ({
      ...s,
      choiceRight: s.choiceRight + (ok ? 1 : 0),
      choiceWrong: s.choiceWrong + (ok ? 0 : 1),
    }))
  }, [])

  const recordSpell = useCallback((ok: boolean) => {
    setSession((s) => ({
      ...s,
      spellRight: s.spellRight + (ok ? 1 : 0),
      spellWrong: s.spellWrong + (ok ? 0 : 1),
    }))
  }, [])

  const reset = useCallback(() => setSession(emptySession()), [])

  const progress = useMemo(() => {
    const total = session.ids.length
    const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)
    return {
      study: pct(session.studied.length),
      choice: pct(session.choiceRight + session.choiceWrong),
      spell: pct(session.spellRight + session.spellWrong),
    }
  }, [session])

  return {
    session,
    words,
    progress,
    startBatch,
    markStudied,
    setStage,
    recordChoice,
    recordSpell,
    reset,
    setSession,
  }
}

export type SessionApi = ReturnType<typeof useSession>

/** 打乱但可复现（按日期做种子） */
export function shuffleForToday<T>(arr: T[], salt = 0): T[] {
  return seededShuffle(arr, Number(dateKey().replace(/-/g, '')) + salt)
}
