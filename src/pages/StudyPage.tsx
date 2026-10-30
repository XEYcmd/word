import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Word } from '../types'
import { letterList, unitList } from '../lib/bank'
import { useApp } from '../lib/store'
import { speak } from '../lib/speech'
import { mulberry32, pickDistractors } from '../lib/groups'
import type { Grade } from '../lib/storage'
import {
  STAGE_META,
  STAGE_ORDER,
  shuffleForToday,
  useSession,
  type Scope,
  type Stage,
} from '../lib/session'

export default function StudyPage() {
  const { state, answer, answerQuiz, toggleStar } = useApp()
  const s = state.settings
  const {
    session,
    words,
    progress,
    startBatch,
    markStudied,
    setStage,
    recordChoice,
    recordSpell,
    reset,
  } = useSession()

  const [scope, setScope] = useState<Scope>(session.scope)
  const [letter, setLetter] = useState(session.letter)
  const [unit, setUnit] = useState(session.unit || unitList[0] || '')

  // 三关各自的当前下标
  const [iStudy, setIStudy] = useState(0)
  const [iChoice, setIChoice] = useState(0)
  const [iSpell, setISpell] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [finishedStudy, setFinishedStudy] = useState(false)

  const stage = session.stage
  const hasBatch = words.length > 0

  // 恢复进度：如果这批词已经背过一部分，从下一个未背的开始
  useEffect(() => {
    if (!hasBatch || stage !== 'study') return
    const firstUnstudied = words.findIndex((w) => !session.studied.includes(w.id))
    setIStudy(firstUnstudied === -1 ? words.length - 1 : firstUnstudied)
    setFinishedStudy(firstUnstudied === -1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ids.join(','), stage])

  const begin = () => {
    startBatch(state, scope, { letter, unit })
    setIStudy(0)
    setIChoice(0)
    setISpell(0)
    setRevealed(false)
    setFinishedStudy(false)
  }

  // ------------------------------------------------------------ 通用
  const stageIndex = STAGE_ORDER.indexOf(stage)

  const goStage = (target: Stage) => {
    setStage(target)
    window.scrollTo({ top: 0 })
  }

  // ------------------------------------------------------------ 第一关：背单词
  const studyWord = words[iStudy]

  const speakWord = useCallback(
    (w?: Word) => {
      if (w) speak(w.word, { accent: s.accent, rate: s.rate })
    },
    [s.accent, s.rate],
  )

  useEffect(() => {
    if (stage === 'study' && studyWord && s.autoSpeak && !finishedStudy) speakWord(studyWord)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyWord?.id, stage, s.autoSpeak, finishedStudy])

  const gradeStudy = (g: Grade) => {
    if (!studyWord) return
    answer(studyWord, g, { countedAs: 'learn' })
    markStudied(studyWord.id)
    setRevealed(false)
    if (iStudy + 1 >= words.length) {
      setFinishedStudy(true)
    } else {
      setIStudy((i) => i + 1)
    }
  }

  // 键盘：第一关
  useEffect(() => {
    if (stage !== 'study' || finishedStudy) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        if (!revealed) setRevealed(true)
        else gradeStudy('good')
        return
      }
      if (!revealed) return
      const k = e.key.toLowerCase()
      if (k === '1') gradeStudy('again')
      else if (k === '2') gradeStudy('hard')
      else if (k === '3') gradeStudy('good')
      else if (k === '4') gradeStudy('easy')
      else if (k === 's') speakWord(studyWord)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, revealed, studyWord, finishedStudy, iStudy, words])

  // ------------------------------------------------------------ 第二关：选择题
  const choiceQuestions = useMemo(() => {
    if (words.length === 0) return []
    const rng = mulberry32(Number(session.date.replace(/-/g, '')))
    const ordered = shuffleForToday(words, 7)
    const used = new Set<string>()
    return ordered.map((word) => {
      const distractors = pickDistractors(word, words, 12, rng)
        .filter((d) => !used.has(d.trans) && d.trans !== word.trans)
        .slice(0, 3)
      used.add(word.trans)
      for (const d of distractors) used.add(d.trans)
      const options = shuffleForToday([word, ...distractors], Math.floor(rng() * 1e6))
      return { word, options, answerIndex: options.findIndex((o) => o.id === word.id) }
    })
  }, [words, session.date])

  const [picked, setPicked] = useState<number | null>(null)
  const [choiceAnswered, setChoiceAnswered] = useState(false)
  const [choiceOk, setChoiceOk] = useState(false)
  const [finishedChoice, setFinishedChoice] = useState(false)

  const choiceQ = choiceQuestions[iChoice]

  const pickOption = (i: number) => {
    if (choiceAnswered || !choiceQ) return
    const ok = i === choiceQ.answerIndex
    setPicked(i)
    setChoiceOk(ok)
    setChoiceAnswered(true)
    answerQuiz(choiceQ.word, ok, { countedAs: 'review' })
    recordChoice(ok)
  }

  const nextChoice = () => {
    setPicked(null)
    setChoiceAnswered(false)
    if (iChoice + 1 >= choiceQuestions.length) setFinishedChoice(true)
    else setIChoice((i) => i + 1)
  }

  // ------------------------------------------------------------ 第三关：拼写
  const spellQuestions = useMemo(() => shuffleForToday(words, 13), [words])
  const spellWord = spellQuestions[iSpell]
  const [typed, setTyped] = useState('')
  const [spellAnswered, setSpellAnswered] = useState(false)
  const [spellOk, setSpellOk] = useState(false)
  const [finishedSpell, setFinishedSpell] = useState(false)

  const submitSpell = () => {
    if (spellAnswered || !spellWord) return
    const norm = (x: string) => (s.ignoreCase ? x.trim().toLowerCase() : x.trim())
    const ok = norm(typed) === norm(spellWord.word)
    setSpellOk(ok)
    setSpellAnswered(true)
    answerQuiz(spellWord, ok, { countedAs: 'review' })
    recordSpell(ok)
  }

  const nextSpell = () => {
    setTyped('')
    setSpellAnswered(false)
    if (iSpell + 1 >= spellQuestions.length) setFinishedSpell(true)
    else setISpell((i) => i + 1)
  }

  // 拼写关不自动朗读（会直接暴露答案），只在答完后可手动听
  useEffect(() => {
    if (stage !== 'spell') return
    // 故意留空：拼写测试中朗读等于念答案
  }, [spellWord?.id, stage])

  useEffect(() => {
    if (stage !== 'spell') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Enter') {
          if (spellAnswered) nextSpell()
          else submitSpell()
        }
        return
      }
      if (spellAnswered && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault()
        nextSpell()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, spellAnswered, typed, iSpell, spellQuestions])

  useEffect(() => {
    if (stage !== 'choice') return
    const onKey = (e: KeyboardEvent) => {
      if (choiceAnswered && (e.key === 'Enter' || e.code === 'Space')) {
        e.preventDefault()
        nextChoice()
        return
      }
      if (!choiceAnswered) {
        const n = parseInt(e.key, 10)
        if (n >= 1 && n <= 4) pickOption(n - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, choiceAnswered, iChoice, choiceQuestions])

  // ------------------------------------------------------------ 渲染
  const stepper = (
    <div className="stepper">
      {STAGE_ORDER.map((st, idx) => {
        const done = idx < stageIndex || (st === 'study' && progress.study === 100)
        const active = st === stage
        const locked = !hasBatch && st !== 'study'
        return (
          <button
            key={st}
            className={`step ${active ? 'active' : ''} ${done && !active ? 'done' : ''}`}
            disabled={locked || !hasBatch}
            onClick={() => {
              if (!hasBatch) return
              goStage(st)
            }}
          >
            <span className="step-dot">{done && !active ? '✓' : idx + 1}</span>
            <span className="step-text">
              <b>{STAGE_META[st].short}</b>
              <small>{STAGE_META[st].desc}</small>
            </span>
            {idx < STAGE_ORDER.length - 1 && <span className="step-line" />}
          </button>
        )
      })}
    </div>
  )

  // 还没开始：选择范围 + 生成词单
  if (!hasBatch) {
    return (
      <div className="study-wrap">
        <div className="card" style={{ padding: 28, width: '100%', maxWidth: 680 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 20 }}>开始今天的单词</h2>
          <p className="muted" style={{ margin: '0 0 20px', fontSize: 14 }}>
            一次学习会带你走完 <b>背单词 → 选择题 → 拼写</b> 三关，三关用的是同一批词。
          </p>

          {stepper}

          <div style={{ marginTop: 22 }}>
            <div className="section-title">学习范围</div>
            <div className="row wrap" style={{ gap: 8 }}>
              {(
                [
                  ['all', '全部词库'],
                  ['core', '核心高频'],
                  ['extended', '拓展词汇'],
                  ['letter', '按字母'],
                  ['unit', '按教材单元'],
                ] as [Scope, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={`chip ${scope === k ? 'active' : ''}`}
                  onClick={() => setScope(k)}
                >
                  {label}
                </button>
              ))}
            </div>

            {scope === 'letter' && (
              <select
                className="select"
                style={{ marginTop: 12 }}
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
              >
                {letterList.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            )}

            {scope === 'unit' && (
              <select
                className="select"
                style={{ marginTop: 12 }}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              >
                {unitList.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div
            className="row"
            style={{ justifyContent: 'space-between', marginTop: 24, flexWrap: 'wrap', gap: 10 }}
          >
            <span className="dim" style={{ fontSize: 13 }}>
              新词 {s.dailyNew} 个 · 复习上限 {s.dailyReview} 个（可在设置里改）
            </span>
            <button className="btn btn-primary btn-lg" data-action="start-batch" onClick={begin}>
              开始学习
            </button>
          </div>
        </div>
      </div>
    )
  }

  const header = (
    <>
      <div className="row" style={{ width: '100%', maxWidth: 680, justifyContent: 'space-between' }}>
        <span className="dim" style={{ fontSize: 13 }}>
          本批 {words.length} 词 · {STAGE_META[stage].label}
        </span>
        <button className="btn btn-sm btn-ghost" onClick={reset}>
          换一批
        </button>
      </div>
      {stepper}
    </>
  )

  // 第一关
  if (stage === 'study') {
    if (finishedStudy || !studyWord) {
      return (
        <div className="study-wrap">
          {header}
          <div className="card" style={{ padding: 36, textAlign: 'center', maxWidth: 680, width: '100%' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>📖</div>
            <h3 style={{ margin: '0 0 8px' }}>背单词完成</h3>
            <p className="muted" style={{ margin: '0 0 22px' }}>
              {words.length} 个词都过了一遍，接下来检验一下记住了没有
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => goStage('choice')}>
              进入第二关 · 选择题 →
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="study-wrap">
        {header}

        <div className="progress-bar" style={{ width: '100%', maxWidth: 680 }}>
          <span style={{ width: `${((iStudy + 1) / words.length) * 100}%` }} />
        </div>

        <div className="card word-card" onClick={() => setRevealed(true)}>
          <div className="row" style={{ position: 'absolute', top: 14, right: 14 }}>
            <button
              className={`star-btn ${state.progress[studyWord.id]?.starred ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                toggleStar(studyWord.id)
              }}
            >
              {state.progress[studyWord.id]?.starred ? '⭐' : '☆'}
            </button>
          </div>

          <div className="row" style={{ gap: 6, fontSize: 12 }}>
            <span className="dim">
              {iStudy + 1} / {words.length}
            </span>
            <span className={`tag ${studyWord.level === 'core' ? 'tag-core' : 'tag-ext'}`}>
              {studyWord.level === 'core' ? '核心' : '拓展'}
            </span>
            {studyWord.unit && <span className="tag">{studyWord.unit}</span>}
          </div>

          <div className="word-main">{studyWord.word}</div>
          {studyWord.phonetic && <div className="word-phone">/{studyWord.phonetic}/</div>}

          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={(e) => {
                e.stopPropagation()
                speakWord(studyWord)
              }}
            >
              🔊 朗读
            </button>
            {studyWord.pos && <span className="word-pos">{studyWord.pos}</span>}
          </div>

          {revealed ? (
            <>
              <div className="word-trans">{studyWord.trans}</div>
              {studyWord.forms && <div className="word-forms">变形：{studyWord.forms}</div>}
            </>
          ) : (
            <div className="reveal-hint">
              <span className="hidden-veil">点击显示释义</span>
              <div style={{ marginTop: 8, fontSize: 12 }}>空格显示 · 1-4 评分</div>
            </div>
          )}
        </div>

        {revealed ? (
          <div className="grade-row">
            <button className="grade-btn grade-again" onClick={() => gradeStudy('again')}>
              忘记<small>1</small>
            </button>
            <button className="grade-btn grade-hard" onClick={() => gradeStudy('hard')}>
              模糊<small>2</small>
            </button>
            <button className="grade-btn grade-good" onClick={() => gradeStudy('good')}>
              记得<small>3</small>
            </button>
            <button className="grade-btn grade-easy" onClick={() => gradeStudy('easy')}>
              太简单<small>4</small>
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

  // 第二关
  if (stage === 'choice') {
    if (finishedChoice || !choiceQ) {
      const total = session.choiceRight + session.choiceWrong
      const rate = total ? Math.round((session.choiceRight / total) * 100) : 0
      return (
        <div className="study-wrap">
          {header}
          <div className="card" style={{ padding: 36, textAlign: 'center', maxWidth: 680, width: '100%' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{rate >= 80 ? '🏆' : '👍'}</div>
            <h3 style={{ margin: '0 0 8px' }}>选择题完成</h3>
            <p className="muted" style={{ margin: '0 0 22px' }}>
              答对 {session.choiceRight} / {total}，正确率 <b>{rate}%</b>
              {session.choiceWrong > 0 && ` · ${session.choiceWrong} 个进了错词本`}
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => goStage('spell')}>
              进入第三关 · 拼写 →
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="study-wrap">
        {header}
        <div className="progress-bar" style={{ width: '100%', maxWidth: 680 }}>
          <span style={{ width: `${((iChoice + (choiceAnswered ? 1 : 0)) / choiceQuestions.length) * 100}%` }} />
        </div>

        <div className="card quiz-card">
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <div className="quiz-prompt">{choiceQ.word.word}</div>
            <button
              className="btn btn-icon btn-ghost"
              onClick={() => speakWord(choiceQ.word)}
            >
              🔊
            </button>
          </div>
          <div className="quiz-prompt-sub">
            {choiceQ.word.phonetic && `/${choiceQ.word.phonetic}/ · `}
            选出正确的中文意思（{iChoice + 1}/{choiceQuestions.length}）
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {choiceQ.options.map((o, i) => {
              const isAnswer = i === choiceQ.answerIndex
              const isPicked = i === picked
              let cls = 'option'
              if (choiceAnswered) {
                if (isAnswer) cls += ' correct'
                else if (isPicked) cls += ' wrong'
              }
              return (
                <button
                  key={o.id}
                  className={cls}
                  onClick={() => pickOption(i)}
                  disabled={choiceAnswered}
                >
                  <span className="option-key">{i + 1}</span>
                  <span style={{ flex: 1 }}>{o.trans}</span>
                  {choiceAnswered && isAnswer && <span style={{ color: 'var(--green)' }}>✓</span>}
                  {choiceAnswered && isPicked && !isAnswer && (
                    <span style={{ color: 'var(--red)' }}>✗</span>
                  )}
                </button>
              )
            })}
          </div>

          {choiceAnswered && (
            <div className={`feedback ${choiceOk ? 'ok' : 'no'}`}>
              <span style={{ flexShrink: 0 }}>{choiceOk ? '✓ 回答正确' : '✗ 答错了'}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13 }}>
                <b>{choiceQ.word.word}</b>
                {choiceQ.word.phonetic && ` /${choiceQ.word.phonetic}/`} · {choiceQ.word.trans}
              </span>
              <button
                className="btn btn-sm btn-ghost"
                style={{ flexShrink: 0 }}
                onClick={() => speakWord(choiceQ.word)}
              >
                🔊
              </button>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="dim" style={{ fontSize: 12 }}>
              ✅ {session.choiceRight} · ❌ {session.choiceWrong}
            </span>
            {choiceAnswered ? (
              <button className="btn btn-primary" onClick={nextChoice}>
                {iChoice + 1 >= choiceQuestions.length ? '查看结果' : '下一题（回车）'}
              </button>
            ) : (
              <span className="dim" style={{ fontSize: 12 }}>
                键盘 1-4 作答
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 第三关
  if (stage === 'spell') {
    if (finishedSpell || !spellWord) {
      const total = session.spellRight + session.spellWrong
      const rate = total ? Math.round((session.spellRight / total) * 100) : 0
      return (
        <div className="study-wrap">
          {header}
          <div className="card" style={{ padding: 36, textAlign: 'center', maxWidth: 680, width: '100%' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{rate >= 80 ? '🎯' : '💪'}</div>
            <h3 style={{ margin: '0 0 8px' }}>拼写完成</h3>
            <p className="muted" style={{ margin: '0 0 22px' }}>
              拼对 {session.spellRight} / {total}，正确率 <b>{rate}%</b>
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => goStage('done')}>
              查看今日总结 →
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="study-wrap">
        {header}
        <div className="progress-bar" style={{ width: '100%', maxWidth: 680 }}>
          <span style={{ width: `${((iSpell + (spellAnswered ? 1 : 0)) / spellQuestions.length) * 100}%` }} />
        </div>

        <div className="card quiz-card">
          <div className="row" style={{ justifyContent: 'center', gap: 8, fontSize: 12 }}>
            <span className="dim">
              {iSpell + 1} / {spellQuestions.length}
            </span>
            <span className={`tag ${spellWord.level === 'core' ? 'tag-core' : 'tag-ext'}`}>
              {spellWord.level === 'core' ? '核心' : '拓展'}
            </span>
          </div>

          <div className="quiz-prompt" style={{ fontSize: 28 }}>
            {spellWord.trans}
          </div>
          <div className="quiz-prompt-sub">
            {spellWord.pos && `${spellWord.pos} · `}
            {spellWord.word.replace(/[^a-zA-Z]/g, '').length} 个字母
            {spellWord.word.includes(' ') && ` · ${spellWord.word.split(' ').length} 个单词`}
            {spellWord.word.includes('-') && ' · 含连字符'}
          </div>

          <input
            className={`spell-input ${spellAnswered ? (spellOk ? 'correct' : 'wrong') : ''}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="输入英文后按回车"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={spellAnswered}
          />

          {spellAnswered && (
            <div className={`feedback ${spellOk ? 'ok' : 'no'}`}>
              <span style={{ flexShrink: 0 }}>{spellOk ? '✓ 拼写正确' : '✗ 拼错了'}</span>
              <span style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13 }}>
                {!spellOk && <span style={{ opacity: 0.75 }}>你写的「{typed.trim() || '（空）'}」· </span>}
                正确：<b>{spellWord.word}</b>
                {spellWord.phonetic && ` /${spellWord.phonetic}/`}
              </span>
              <button className="btn btn-sm btn-ghost" onClick={() => speakWord(spellWord)}>
                🔊
              </button>
            </div>
          )}

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="dim" style={{ fontSize: 12 }}>
              ✅ {session.spellRight} · ❌ {session.spellWrong}
            </span>
            {spellAnswered ? (
              <button className="btn btn-primary" onClick={nextSpell}>
                {iSpell + 1 >= spellQuestions.length ? '查看结果' : '下一个（回车）'}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={submitSpell} disabled={!typed.trim()}>
                提交（回车）
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 完成
  const choiceTotal = session.choiceRight + session.choiceWrong
  const spellTotal = session.spellRight + session.spellWrong
  return (
    <div className="study-wrap">
      {header}
      <div className="card" style={{ padding: 32, maxWidth: 680, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 52 }}>🎉</div>
          <h2 style={{ margin: '8px 0 4px', fontSize: 22 }}>今天的 {words.length} 个词全部完成</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>
            背单词 → 选择题 → 拼写，三关都过了
          </p>
        </div>

        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <div className="stat">
            <div className="stat-value">{words.length}</div>
            <div className="stat-label">本批词数</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: 'var(--brand-text)' }}>
              {choiceTotal ? Math.round((session.choiceRight / choiceTotal) * 100) : 0}%
            </div>
            <div className="stat-label">选择题正确率</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: 'var(--green)' }}>
              {spellTotal ? Math.round((session.spellRight / spellTotal) * 100) : 0}%
            </div>
            <div className="stat-label">拼写正确率</div>
          </div>
          <div className="stat">
            <div className="stat-value" style={{ color: 'var(--red)' }}>
              {session.choiceWrong + session.spellWrong}
            </div>
            <div className="stat-label">错题（已进错词本）</div>
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={begin}>
            再来一批
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              reset()
              window.scrollTo({ top: 0 })
            }}
          >
            换个范围
          </button>
        </div>
      </div>
    </div>
  )
}
