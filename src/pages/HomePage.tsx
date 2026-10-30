import { useMemo } from 'react'
import type { Route } from '../App'
import { allWords, meta } from '../lib/bank'
import { useApp } from '../lib/store'
import { speak } from '../lib/speech'
import { isStudyWorthy } from '../lib/worth'

export default function HomePage({ go }: { go: (r: Route) => void }) {
  const { state, today, streak } = useApp()
  const t = today()

  const stats = useMemo(() => {
    const now = Date.now()
    let due = 0
    let mastered = 0
    let learning = 0
    let wrong = 0
    let starred = 0
    for (const w of allWords) {
      const p = state.progress[w.id]
      if (!p) continue
      if (p.mastered) mastered += 1
      else if (p.last > 0) learning += 1
      if (p.wrongBook) wrong += 1
      if (p.starred) starred += 1
      if (p.last > 0 && p.due <= now && !p.mastered) due += 1
    }
    return { due, mastered, learning, wrong, starred, total: allWords.length }
  }, [state.progress])

  const target = state.settings.dailyNew + state.settings.dailyReview
  const done = t.learned + t.reviewed
  const pct = Math.min(100, Math.round((done / Math.max(1, target)) * 100))

  // 今日推荐词：从核心词里挑「有学习价值」的——跳过功能词/短语/过短的词
  const recommend = useMemo(() => {
    const pool = allWords
      .filter((w) => w.level === 'core' && !state.progress[w.id] && isStudyWorthy(w))
      .sort((a, b) => a.rank - b.rank)
    return pool.slice(0, 6)
  }, [state.progress])

  return (
    <div>
      <div className="hero">
        <div className="card hero-card">
          <h2 className="hero-title">今天也要加油 💪</h2>
          <p className="muted" style={{ margin: '0 0 18px', fontSize: 14 }}>
            已连续打卡 <b style={{ color: 'var(--brand-text)' }}>{streak()}</b> 天 · 词库共{' '}
            {meta.count} 词（核心 {meta.core} / 拓展 {meta.extended}）
          </p>

          <div className="row wrap" style={{ gap: 10, marginBottom: 16 }}>
            <span className="chip active">今日 {done}</span>
            <span className="chip">新词 {t.learned}</span>
            <span className="chip">复习 {t.reviewed}</span>
            <span className="chip">正确率 {t.correct + t.wrong > 0 ? Math.round((t.correct / (t.correct + t.wrong)) * 100) : 0}%</span>
          </div>

          <div className="flow-hint">
            <span className="flow-step"><b>1</b> 背单词</span>
            <span className="flow-arrow">→</span>
            <span className="flow-step"><b>2</b> 选择题</span>
            <span className="flow-arrow">→</span>
            <span className="flow-step"><b>3</b> 拼写</span>
          </div>

          <div className="progress-bar" style={{ marginBottom: 8 }}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="dim" style={{ fontSize: 12, marginBottom: 20 }}>
            今日目标 {done} / {target}（{pct}%）
          </div>

          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn btn-primary btn-lg" onClick={() => go('study')}>
              {stats.due > 0 ? `开始今日学习（复习 ${stats.due}）` : '开始今日学习'}
            </button>
            <button className="btn btn-ghost btn-lg" onClick={() => go('list')}>
              浏览词库
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-value" style={{ color: 'var(--brand-text)' }}>
                {stats.due}
              </div>
              <div className="stat-label">待复习</div>
            </div>
            <div className="stat">
              <div className="stat-value" style={{ color: 'var(--green)' }}>
                {stats.mastered}
              </div>
              <div className="stat-label">已掌握</div>
            </div>
            <div className="stat">
              <div className="stat-value">{stats.learning}</div>
              <div className="stat-label">学习中</div>
            </div>
            <div className="stat">
              <div className="stat-value" style={{ color: 'var(--red)' }}>
                {stats.wrong}
              </div>
              <div className="stat-label">错词本</div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
              <span className="dim">总进度</span>
              <span className="dim">
                {stats.mastered + stats.learning} / {stats.total}
              </span>
            </div>
            <div className="progress-bar" style={{ marginTop: 6 }}>
              <span
                style={{
                  width: `${Math.round(((stats.mastered + stats.learning) / stats.total) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>今日推荐词</h3>
          <button className="btn btn-sm btn-ghost" onClick={() => go('list')}>
            查看全部 →
          </button>
        </div>

        {recommend.length === 0 ? (
          <div className="empty" style={{ padding: '30px 10px' }}>
            <div className="empty-icon">🎉</div>
            核心词都学过了，去拓展词汇看看吧
          </div>
        ) : (
          <div className="word-list" style={{ border: '1px solid var(--border)', borderRadius: 12 }}>
            {recommend.map((w) => (
              <div className="word-row" key={w.id}>
                <div className="word-row-word">{w.word}</div>
                <div className="word-row-trans">
                  {w.pos && <span className="dim">{w.pos} </span>}
                  {w.trans}
                </div>
                <button
                  className="star-btn on"
                  onClick={() => speak(w.word, { accent: state.settings.accent, rate: state.settings.rate })}
                  title="朗读"
                >
                  🔊
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
