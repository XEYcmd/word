import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Word } from '../types'
import { allWords, unitList, letterList } from '../lib/bank'
import { useApp } from '../lib/store'
import { speak } from '../lib/speech'
import { getGroupWords, seededShuffle } from '../lib/groups'
import { filterStudyWorthy } from '../lib/worth'
import type { Grade } from '../lib/storage'
import { dateKey } from '../lib/storage'

type Session = 'due' | 'new' | 'mix'

export default function StudyPage() {
  const { state, answer, toggleStar } = useApp()
  const s = state.settings

  const [session, setSession] = useState<Session>('mix')
  const [scope, setScope] = useState<'all' | 'core' | 'extended' | 'letter' | 'unit'>('all')
  const [letter, setLetter] = useState('A')
  const [unit, setUnit] = useState(unitList[0] ?? '')
  const [shuffled, setShuffled] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [index, setIndex] = useState(0)
  const [counted, setCounted] = useState(0)
  const [startTs, setStartTs] = useState(() => Date.now())
  const [finished, setFinished] = useState(false)

  // 建立本次学习的队列（进入时快照，避免边学边变）
  const queue = useMemo<Word[]>(() => {
    const now = Date.now()
    let pool: Word[]
    if (scope === 'letter') pool = getGroupWords('letter', { letter })
    else if (scope === 'unit') pool = getGroupWords('unit', { unit })
    else if (scope === 'core') pool = getGroupWords('core')
    else if (scope === 'extended') pool = getGroupWords('extended')
    else pool = allWords

    if (shuffled) pool = seededShuffle(pool, Number(dateKey().replace(/-/g, '')))
    else pool = pool.slice().sort((a, b) => a.rank - b.rank) // 默认先学高频词

    // 学习队列跳过 a/the/of 这类无学习价值的功能词（词库页仍可查到）
    pool = filterStudyWorthy(pool)

    const isDue = (w: Word) => {
      const p = state.progress[w.id]
      return !!p && p.last > 0 && p.due <= now && !p.mastered
    }
    const isNewWord = (w: Word) => !state.progress[w.id] || state.progress[w.id].last === 0

    const due = pool.filter(isDue)
    const fresh = pool.filter(isNewWord)

    if (session === 'due') return due
    if (session === 'new') return fresh.slice(0, s.dailyNew)
    // mix: 复习优先，再补新词
    return [...due.slice(0, s.dailyReview), ...fresh.slice(0, s.dailyNew)]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, letter, unit, session, shuffled, s.dailyNew, s.dailyReview])

  const [queueSnapshot, setQueueSnapshot] = useState<Word[]>(queue)
  const initRef = useRef(false)

  // 首次进入或切换条件时重置
  useEffect(() => {
    setQueueSnapshot(queue)
    setIndex(0)
    setCounted(0)
    setRevealed(false)
    setFinished(false)
    setStartTs(Date.now())
    initRef.current = true
  }, [queue])

  const current = queueSnapshot[index]

  const speakWord = useCallback(
    (w?: Word) => {
      if (!w) return
      speak(w.word, { accent: s.accent, rate: s.rate })
    },
    [s.accent, s.rate],
  )

  // 自动发音
  useEffect(() => {
    if (current && s.autoSpeak && !finished) speakWord(current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, s.autoSpeak, finished])

  const advance = () => {
    setRevealed(false)
    if (index + 1 >= queueSnapshot.length) {
      setFinished(true)
    } else {
      setIndex((i) => i + 1)
    }
  }

  const grade = (g: Grade) => {
    if (!current) return
    answer(current, g, { countedAs: 'learn' })
    setCounted((c) => c + 1)
    advance()
  }

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
        else grade('good')
        return
      }
      if (!revealed) return
      const k = e.key.toLowerCase()
      if (k === '1') grade('again')
      else if (k === '2') grade('hard')
      else if (k === '3') grade('good')
      else if (k === '4') grade('easy')
      else if (k === 's') speakWord(current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, current, index, queueSnapshot])

  const restart = () => {
    setIndex(0)
    setCounted(0)
    setRevealed(false)
    setFinished(false)
    setStartTs(Date.now())
  }

  const switchSession = (v: Session) => {
    setSession(v)
    setFinished(false)
  }

  if (queueSnapshot.length === 0) {
    return (
      <div className="card empty" style={{ padding: 60 }}>
        <div className="empty-icon">🌱</div>
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-2)' }}>
          这个范围暂时没有要学的词
        </div>
        <div style={{ fontSize: 13, marginBottom: 18 }}>
          {session === 'due'
            ? '没有到期的复习词，切到「新词」或「混合」继续吧'
            : '试试换个分组范围，或者先学新词'}
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => switchSession('mix')}>
            混合学习
          </button>
          <button className="btn btn-ghost" onClick={() => setScope('all')}>
            全部词库
          </button>
        </div>
      </div>
    )
  }

  if (finished) {
    const mins = Math.max(1, Math.round((Date.now() - startTs) / 60000))
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 22 }}>本轮完成！</h2>
        <p className="muted" style={{ margin: '0 0 24px' }}>
          共学习 <b>{counted}</b> 个单词，用时约 {mins} 分钟
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn btn-primary" onClick={restart}>
            再来一轮
          </button>
          <button className="btn btn-ghost" onClick={() => switchSession('due')}>
            只复习到期词
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="study-wrap">
      <div className="study-head">
        <div className="row wrap" style={{ gap: 6, flex: 1 }}>
          <button
            className={`chip ${session === 'mix' ? 'active' : ''}`}
            onClick={() => switchSession('mix')}
          >
            混合
          </button>
          <button
            className={`chip ${session === 'new' ? 'active' : ''}`}
            onClick={() => switchSession('new')}
          >
            新词
          </button>
          <button
            className={`chip ${session === 'due' ? 'active' : ''}`}
            onClick={() => switchSession('due')}
          >
            复习
          </button>
        </div>
        <span className="dim" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {index + 1} / {queueSnapshot.length}
        </span>
      </div>

      <div className="study-head" style={{ fontSize: 13 }}>
        <select className="select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="all">全部词库</option>
          <option value="core">核心高频</option>
          <option value="extended">拓展词汇</option>
          <option value="letter">按字母</option>
          <option value="unit">按教材单元</option>
        </select>

        {scope === 'letter' && (
          <select className="select" value={letter} onChange={(e) => setLetter(e.target.value)}>
            {letterList.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}

        {scope === 'unit' && (
          <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {unitList.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}

        <button
          className={`chip ${shuffled ? 'active' : ''}`}
          onClick={() => setShuffled((v) => !v)}
          title="打乱顺序"
        >
          🔀 乱序
        </button>

        <div style={{ flex: 1 }} />

        <span className="dim" style={{ fontSize: 12 }}>
          {current?.level === 'core' ? '核心' : '拓展'}
          {current?.unit ? ` · ${current.unit}` : ''}
        </span>
      </div>

      <div className="progress-bar" style={{ width: '100%', maxWidth: 680 }}>
        <span style={{ width: `${((index + 1) / queueSnapshot.length) * 100}%` }} />
      </div>

      <div className="card word-card" onClick={() => setRevealed(true)}>
        <div className="row" style={{ position: 'absolute', top: 14, right: 14, gap: 4 }}>
          <button
            className={`star-btn ${current && state.progress[current.id]?.starred ? 'on' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              if (current) toggleStar(current.id)
            }}
            title="收藏"
          >
            {current && state.progress[current.id]?.starred ? '⭐' : '☆'}
          </button>
        </div>

        <div className="word-main">{current?.word}</div>

        {current?.phonetic && <div className="word-phone">/{current.phonetic}/</div>}

        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={(e) => {
              e.stopPropagation()
              speakWord(current)
            }}
          >
            🔊 朗读
          </button>
          {current?.pos && <span className="word-pos">{current.pos}</span>}
        </div>

        {revealed ? (
          <>
            <div className="word-trans">{current?.trans}</div>
            {current?.forms && <div className="word-forms">变形：{current.forms}</div>}
          </>
        ) : (
          <div className="reveal-hint">
            <span className="hidden-veil">点击显示释义</span>
            <div style={{ marginTop: 8, fontSize: 12 }}>空格键显示 · 1-4 评分</div>
          </div>
        )}
      </div>

      {revealed ? (
        <div className="grade-row">
          <button className="grade-btn grade-again" onClick={() => grade('again')}>
            忘记
            <small>1</small>
          </button>
          <button className="grade-btn grade-hard" onClick={() => grade('hard')}>
            模糊
            <small>2</small>
          </button>
          <button className="grade-btn grade-good" onClick={() => grade('good')}>
            记得
            <small>3</small>
          </button>
          <button className="grade-btn grade-easy" onClick={() => grade('easy')}>
            太简单
            <small>4</small>
          </button>
        </div>
      ) : (
        <div className="grade-row">
          <button className="btn btn-primary btn-lg" style={{ flex: 1 }} onClick={() => setRevealed(true)}>
            显示释义
          </button>
        </div>
      )}
    </div>
  )
}
