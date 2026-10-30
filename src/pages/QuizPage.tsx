import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Word } from '../types'
import { allWords } from '../lib/bank'
import { useApp } from '../lib/store'
import { speak } from '../lib/speech'
import { mulberry32, pickDistractors, seededShuffle } from '../lib/groups'
import { dateKey } from '../lib/storage'

type Mode = 'en2cn' | 'cn2en' | 'spell'

interface Q {
  word: Word
  options: Word[]
  /** 正确答案在 options 中的下标（选择题） */
  answerIndex: number
}

const MODE_LABEL: Record<Mode, string> = {
  en2cn: '看英文选中文',
  cn2en: '看中文选英文',
  spell: '看中文拼写',
}

export default function QuizPage() {
  const { state, answerQuiz, toggleStar } = useApp()
  const s = state.settings

  const [mode, setMode] = useState<Mode>('en2cn')
  const [scope, setScope] = useState<'core' | 'extended' | 'all' | 'wrong' | 'star'>('core')
  const [seed, setSeed] = useState(() => Date.now())
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [stats, setStats] = useState({ correct: 0, wrong: 0 })
  const [finished, setFinished] = useState(false)

  const pool = useMemo<Word[]>(() => {
    switch (scope) {
      case 'core':
        return allWords.filter((w) => w.level === 'core')
      case 'extended':
        return allWords.filter((w) => w.level === 'extended')
      case 'wrong':
        return allWords.filter((w) => state.progress[w.id]?.wrongBook)
      case 'star':
        return allWords.filter((w) => state.progress[w.id]?.starred)
      default:
        return allWords
    }
  }, [scope, state.progress])

  const questions = useMemo<Q[]>(() => {
    const rng = mulberry32(seed)
    const size = Math.min(s.quizSize, pool.length)
    const picked = seededShuffle(pool, seed).slice(0, size)
    const used = new Set<string>()
    return picked.map((word) => {
      // 同一组题里干扰项释义不重复，避免出现两个看起来都对
      const distractors = pickDistractors(word, pool, 12, rng)
        .filter((d) => !used.has(d.trans) && d.trans !== word.trans)
        .slice(0, 3)
      used.add(word.trans)
      for (const d of distractors) used.add(d.trans)
      const options = seededShuffle([word, ...distractors], Math.floor(rng() * 1e9))
      return { word, options, answerIndex: options.findIndex((o) => o.id === word.id) }
    })
  }, [pool, seed, s.quizSize])

  const q = questions[index]

  const reset = useCallback(() => {
    setSeed(Date.now())
    setIndex(0)
    setPicked(null)
    setTyped('')
    setSubmitted(false)
    setStats({ correct: 0, wrong: 0 })
    setFinished(false)
  }, [])

  useEffect(() => {
    reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scope])

  // 进入新题自动发音
  useEffect(() => {
    if (q && mode !== 'spell' && s.autoSpeak) {
      speak(q.word.word, { accent: s.accent, rate: s.rate })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.word.id, mode])

  const finishQuestion = (ok: boolean) => {
    if (!q) return
    answerQuiz(q.word, ok, { countedAs: 'learn' })
    setIsCorrect(ok)
    setSubmitted(true)
    setStats((st) => ({ correct: st.correct + (ok ? 1 : 0), wrong: st.wrong + (ok ? 0 : 1) }))
    if (!ok) {
      // 答错自动入错词本由 answerQuiz 处理
    }
  }

  const pickOption = (i: number) => {
    if (submitted || !q) return
    setPicked(i)
    finishQuestion(i === q.answerIndex)
  }

  const submitSpell = () => {
    if (submitted || !q) return
    const norm = (x: string) => (s.ignoreCase ? x.trim().toLowerCase() : x.trim())
    finishQuestion(norm(typed) === norm(q.word.word))
  }

  const next = () => {
    if (index + 1 >= questions.length) {
      setFinished(true)
    } else {
      setIndex((i) => i + 1)
      setPicked(null)
      setTyped('')
      setSubmitted(false)
    }
  }

  // 键盘：选择题 1-4，拼写 Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Enter') {
          if (submitted) next()
          else submitSpell()
        }
        return
      }
      if (submitted && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault()
        next()
        return
      }
      if (!submitted && mode !== 'spell') {
        const n = parseInt(e.key, 10)
        if (n >= 1 && n <= 4) pickOption(n - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted, mode, index, questions, typed])

  if (pool.length === 0) {
    return (
      <div className="card empty" style={{ padding: 60 }}>
        <div className="empty-icon">📭</div>
        <div style={{ fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>这个范围没有词</div>
        <div style={{ fontSize: 13 }}>
          {scope === 'wrong' ? '错词本还是空的，去背单词吧' : scope === 'star' ? '还没有收藏的单词' : '换个范围试试'}
        </div>
      </div>
    )
  }

  if (finished) {
    const total = stats.correct + stats.wrong
    const rate = total ? Math.round((stats.correct / total) * 100) : 0
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>{rate >= 80 ? '🏆' : rate >= 60 ? '👍' : '💪'}</div>
        <h2 style={{ margin: '0 0 6px', fontSize: 22 }}>测试完成</h2>
        <p className="muted" style={{ margin: '0 0 22px' }}>
          答对 {stats.correct} / {total}，正确率 <b>{rate}%</b>
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
          <button className="btn btn-primary" onClick={reset}>
            再来一组
          </button>
          {stats.wrong > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setScope('wrong')
                reset()
              }}
            >
              刷错题（{stats.wrong}）
            </button>
          )}
        </div>
      </div>
    )
  }

  if (!q) return null

  const progress = ((index + (submitted ? 1 : 0)) / questions.length) * 100

  return (
    <div className="study-wrap">
      <div className="study-head">
        <div className="row wrap" style={{ gap: 6, flex: 1 }}>
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <button key={m} className={`chip ${mode === m ? 'active' : ''}`} onClick={() => setMode(m)}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <span className="dim" style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
          {index + 1} / {questions.length}
        </span>
      </div>

      <div className="study-head">
        <select className="select" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="core">核心高频</option>
          <option value="extended">拓展词汇</option>
          <option value="all">全部词库</option>
          <option value="wrong">错词本</option>
          <option value="star">我的收藏</option>
        </select>
        <div style={{ flex: 1 }} />
        <span className="dim" style={{ fontSize: 12 }}>
          ✅ {stats.correct} · ❌ {stats.wrong}
        </span>
      </div>

      <div className="progress-bar" style={{ width: '100%', maxWidth: 680 }}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <div className="card quiz-card">
        {mode === 'en2cn' && (
          <>
            <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
              <div className="quiz-prompt">{q.word.word}</div>
              <button
                className="btn btn-icon btn-ghost"
                onClick={() => speak(q.word.word, { accent: s.accent, rate: s.rate })}
              >
                🔊
              </button>
            </div>
            {q.word.phonetic && <div className="quiz-prompt-sub">/{q.word.phonetic}/</div>}
          </>
        )}

        {mode === 'cn2en' && (
          <>
            <div className="quiz-prompt" style={{ fontSize: 26 }}>
              {q.word.trans}
            </div>
            <div className="quiz-prompt-sub">
              {q.word.pos && `${q.word.pos} · `}
              选出对应的英文
            </div>
          </>
        )}

        {mode === 'spell' && (
          <>
            <div className="quiz-prompt" style={{ fontSize: 26 }}>
              {q.word.trans}
            </div>
            <div className="quiz-prompt-sub">
              {q.word.pos && `${q.word.pos} · `}共 {q.word.word.replace(/[^a-zA-Z]/g, '').length} 个字母
            </div>
            <input
              className={`spell-input ${submitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="输入英文后按回车"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={submitted}
            />
          </>
        )}

        {mode !== 'spell' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map((o, i) => {
              const isAnswer = i === q.answerIndex
              const isPicked = i === picked
              let cls = 'option'
              if (submitted) {
                if (isAnswer) cls += ' correct'
                else if (isPicked) cls += ' wrong'
              }
              return (
                <button key={o.id} className={cls} onClick={() => pickOption(i)} disabled={submitted}>
                  <span className="option-key">{i + 1}</span>
                  <span style={{ flex: 1 }}>{mode === 'en2cn' ? o.trans : o.word}</span>
                  {submitted && isAnswer && <span style={{ color: 'var(--green)' }}>✓</span>}
                  {submitted && isPicked && !isAnswer && <span style={{ color: 'var(--red)' }}>✗</span>}
                </button>
              )
            })}
          </div>
        )}

        {submitted && (
          <div className={`feedback ${isCorrect ? 'ok' : 'no'}`}>
            <span style={{ flexShrink: 0 }}>{isCorrect ? '✓ 回答正确' : '✗ 答错了'}</span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontWeight: 500, fontSize: 13 }}>
              {!isCorrect && mode === 'spell' && (
                <span style={{ opacity: 0.75 }}>你写的「{typed.trim() || '（空）'}」· </span>
              )}
              正确：<b>{q.word.word}</b>
              {q.word.phonetic && ` /${q.word.phonetic}/`} · {q.word.trans}
            </span>
            <button
              className="btn btn-sm btn-ghost"
              style={{ flexShrink: 0 }}
              onClick={() => speak(q.word.word, { accent: s.accent, rate: s.rate })}
            >
              🔊
            </button>
          </div>
        )}

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button
            className={`star-btn ${state.progress[q.word.id]?.starred ? 'on' : ''}`}
            onClick={() => toggleStar(q.word.id)}
            title="收藏"
          >
            {state.progress[q.word.id]?.starred ? '⭐' : '☆'} 收藏
          </button>

          {mode === 'spell' && !submitted ? (
            <button className="btn btn-primary" onClick={submitSpell} disabled={!typed.trim()}>
              提交（回车）
            </button>
          ) : submitted ? (
            <button className="btn btn-primary" onClick={next}>
              {index + 1 >= questions.length ? '查看结果' : '下一题（回车）'}
            </button>
          ) : (
            <span className="dim" style={{ fontSize: 12 }}>
              键盘 1-4 快速作答
            </span>
          )}
        </div>
      </div>

      <div className="dim" style={{ fontSize: 12 }}>
        {dateKey()} · 每组 {s.quizSize} 题
      </div>
    </div>
  )
}
