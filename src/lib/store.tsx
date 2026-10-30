import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Word } from '../types'
import {
  dateKey,
  emptyState,
  loadState,
  saveState,
  type AppState,
  type Grade,
  type Settings,
  type WordProgress,
} from './storage'
import { newProgress, schedule, gradeQuiz, removeFromWrongBook } from './srs'

interface Ctx {
  state: AppState
  /** 记录一次作答（卡片/测试共用） */
  answer: (word: Word, grade: Grade, opts?: { countedAs?: 'learn' | 'review' }) => void
  /** 测试模式对错 */
  answerQuiz: (word: Word, ok: boolean, opts?: { countedAs?: 'learn' | 'review' }) => void
  toggleStar: (id: string) => void
  removeWrong: (id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  resetAll: () => void
  addSeconds: (n: number) => void
  setLastGroup: (key: string) => void
  /** 今日统计 */
  today: () => { learned: number; reviewed: number; correct: number; wrong: number; seconds: number }
  /** 连续打卡天数 */
  streak: () => number
}

const AppCtx = createContext<Ctx | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    saveState(state)
  }, [state])

  const bump = useCallback((fn: (draft: AppState) => void) => {
    setState((prev) => {
      const draft: AppState = {
        ...prev,
        progress: { ...prev.progress },
        daily: { ...prev.daily },
      }
      fn(draft)
      return draft
    })
  }, [])

  const ensureToday = (draft: AppState) => {
    const k = dateKey()
    if (!draft.daily[k]) {
      draft.daily[k] = { learned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0 }
    }
    return draft.daily[k]
  }

  const record = useCallback(
    (word: Word, next: WordProgress, countedAs: 'learn' | 'review', ok: boolean) => {
      bump((draft) => {
        const prev = draft.progress[word.id]
        const isFirst = !prev || prev.last === 0
        draft.progress[word.id] = next
        const d = ensureToday(draft)
        if (isFirst) d.learned += 1
        else if (countedAs === 'review') d.reviewed += 1
        if (ok) d.correct += 1
        else d.wrong += 1
      })
    },
    [bump],
  )

  const answer = useCallback(
    (word: Word, grade: Grade, opts?: { countedAs?: 'learn' | 'review' }) => {
      const prev = stateRef.current.progress[word.id] ?? newProgress(word.id)
      const next = schedule(prev, grade)
      if (grade !== 'again') next.wrongBook = prev.wrongBook && next.step < 4
      record(word, next, opts?.countedAs ?? 'learn', grade !== 'again')
    },
    [record],
  )

  const answerQuiz = useCallback(
    (word: Word, ok: boolean, opts?: { countedAs?: 'learn' | 'review' }) => {
      const prev = stateRef.current.progress[word.id] ?? newProgress(word.id)
      const next = gradeQuiz(prev, ok)
      if (ok) next.wrongBook = prev.wrongBook && next.step < 4
      record(word, next, opts?.countedAs ?? 'learn', ok)
    },
    [record],
  )

  const toggleStar = useCallback(
    (id: string) => {
      bump((draft) => {
        const p = draft.progress[id] ?? newProgress(id)
        draft.progress[id] = { ...p, starred: !p.starred }
      })
    },
    [bump],
  )

  const removeWrong = useCallback(
    (id: string) => {
      bump((draft) => {
        const p = draft.progress[id]
        if (p) draft.progress[id] = removeFromWrongBook(p)
      })
    },
    [bump],
  )

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      bump((draft) => {
        draft.settings = { ...draft.settings, ...patch }
      })
    },
    [bump],
  )

  const resetAll = useCallback(() => {
    const fresh = emptyState()
    fresh.settings = stateRef.current.settings
    setState(fresh)
    localStorage.removeItem('word-memory-v1')
  }, [])

  const addSeconds = useCallback(
    (n: number) => {
      if (n <= 0) return
      bump((draft) => {
        const d = ensureToday(draft)
        d.seconds += n
      })
    },
    [bump],
  )

  const setLastGroup = useCallback(
    (key: string) => {
      setState((prev) => ({ ...prev, lastGroup: key }))
    },
    [],
  )

  const today = useCallback(() => {
    const d = stateRef.current.daily[dateKey()]
    return d ?? { learned: 0, reviewed: 0, correct: 0, wrong: 0, seconds: 0 }
  }, [])

  const streak = useCallback(() => {
    const daily = stateRef.current.daily
    let n = 0
    const d = new Date()
    // 今天没学也允许从昨天开始算（今天还没学不算断）
    const hasToday = daily[dateKey(d)] && (daily[dateKey(d)].learned + daily[dateKey(d)].reviewed) > 0
    if (!hasToday) d.setDate(d.getDate() - 1)
    for (;;) {
      const k = dateKey(d)
      const s = daily[k]
      if (!s || s.learned + s.reviewed === 0) break
      n += 1
      d.setDate(d.getDate() - 1)
    }
    return n
  }, [])

  const value = useMemo<Ctx>(
    () => ({
      state,
      answer,
      answerQuiz,
      toggleStar,
      removeWrong,
      updateSettings,
      resetAll,
      addSeconds,
      setLastGroup,
      today,
      streak,
    }),
    [state, answer, answerQuiz, toggleStar, removeWrong, updateSettings, resetAll, addSeconds, setLastGroup, today, streak],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}
