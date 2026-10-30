import { useMemo, useState } from 'react'
import type { Word } from '../types'
import { allWords, letterList, unitList, firstLetter } from '../lib/bank'
import { useApp } from '../lib/store'
import { speak } from '../lib/speech'

type Tab = 'all' | 'core' | 'extended' | 'letter' | 'unit' | 'wrong' | 'star' | 'mastered'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'core', label: '核心' },
  { key: 'extended', label: '拓展' },
  { key: 'letter', label: '字母' },
  { key: 'unit', label: '单元' },
  { key: 'wrong', label: '错词本' },
  { key: 'star', label: '收藏' },
  { key: 'mastered', label: '已掌握' },
]

const PAGE = 100

export default function ListPage() {
  const { state, toggleStar, removeWrong } = useApp()
  const s = state.settings

  const [tab, setTab] = useState<Tab>('all')
  const [letter, setLetter] = useState('A')
  const [unit, setUnit] = useState(unitList[0] ?? '')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [statusFilter, setStatusFilter] = useState<'all' | 'new' | 'learning' | 'mastered'>('all')

  const words = useMemo<Word[]>(() => {
    let pool: Word[]
    switch (tab) {
      case 'core':
        pool = allWords.filter((w) => w.level === 'core')
        break
      case 'extended':
        pool = allWords.filter((w) => w.level === 'extended')
        break
      case 'letter':
        pool = allWords.filter((w) => firstLetter(w.word) === letter)
        break
      case 'unit':
        pool = allWords.filter((w) => w.unit === unit)
        break
      case 'wrong':
        pool = allWords.filter((w) => state.progress[w.id]?.wrongBook)
        break
      case 'star':
        pool = allWords.filter((w) => state.progress[w.id]?.starred)
        break
      case 'mastered':
        pool = allWords.filter((w) => state.progress[w.id]?.mastered)
        break
      default:
        pool = allWords
    }

    if (statusFilter !== 'all') {
      pool = pool.filter((w) => {
        const p = state.progress[w.id]
        if (statusFilter === 'new') return !p || p.last === 0
        if (statusFilter === 'mastered') return !!p?.mastered
        return !!p && p.last > 0 && !p.mastered
      })
    }

    const q = query.trim().toLowerCase()
    if (q) {
      pool = pool.filter(
        (w) => w.word.toLowerCase().includes(q) || w.trans.toLowerCase().includes(q),
      )
    }
    return pool
  }, [tab, letter, unit, query, statusFilter, state.progress])

  const shown = words.slice(0, limit)

  const resetLimit = () => setLimit(PAGE)

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`chip ${tab === t.key ? 'active' : ''}`}
              onClick={() => {
                setTab(t.key)
                resetLimit()
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="row wrap" style={{ gap: 8 }}>
          <input
            className="select"
            style={{ flex: 1, minWidth: 180 }}
            placeholder="搜索单词或释义…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              resetLimit()
            }}
          />

          {tab === 'letter' && (
            <select className="select" value={letter} onChange={(e) => setLetter(e.target.value)}>
              {letterList.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          )}

          {tab === 'unit' && (
            <select className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {unitList.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          )}

          <select
            className="select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as typeof statusFilter)
              resetLimit()
            }}
          >
            <option value="all">全部状态</option>
            <option value="new">未学</option>
            <option value="learning">学习中</option>
            <option value="mastered">已掌握</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="dim" style={{ fontSize: 13 }}>
          共 {words.length} 个词{words.length > limit ? `，显示前 ${limit} 个` : ''}
        </span>
      </div>

      {words.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">🔍</div>
          没有匹配的单词
        </div>
      ) : (
        <div className="card word-list">
          {shown.map((w) => {
            const p = state.progress[w.id]
            return (
              <div className="word-row" key={w.id}>
                <div style={{ minWidth: 130 }}>
                  <div className="word-row-word">{w.word}</div>
                  {w.phonetic && (
                    <div className="dim" style={{ fontSize: 11 }}>
                      /{w.phonetic}/
                    </div>
                  )}
                </div>

                <div className="word-row-trans">
                  {w.pos && <span className="dim">{w.pos} </span>}
                  {w.trans}
                </div>

                <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                  {p?.mastered && <span className="tag tag-core">已掌握</span>}
                  {p?.wrongBook && (
                    <button
                      className="tag"
                      style={{ background: 'var(--red-soft)', color: 'var(--red)', cursor: 'pointer' }}
                      onClick={() => removeWrong(w.id)}
                      title="点击移出错词本"
                    >
                      错词
                    </button>
                  )}
                  <span className={`tag ${w.level === 'core' ? 'tag-core' : 'tag-ext'}`}>
                    {w.level === 'core' ? '核心' : '拓展'}
                  </span>
                  <button
                    className="star-btn"
                    onClick={() => speak(w.word, { accent: s.accent, rate: s.rate })}
                    title="朗读"
                  >
                    🔊
                  </button>
                  <button
                    className={`star-btn ${p?.starred ? 'on' : ''}`}
                    onClick={() => toggleStar(w.id)}
                    title="收藏"
                  >
                    {p?.starred ? '⭐' : '☆'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {words.length > limit && (
        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
            加载更多（还有 {words.length - limit} 个）
          </button>
        </div>
      )}
    </div>
  )
}
