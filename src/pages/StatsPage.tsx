import { useMemo } from 'react'
import { allWords, meta } from '../lib/bank'
import { useApp } from '../lib/store'
import { dateKey } from '../lib/storage'

const DAY = 24 * 60 * 60 * 1000

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec} 秒`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  return `${h} 小时 ${m % 60} 分`
}

export default function StatsPage() {
  const { state, today, streak } = useApp()
  const t = today()

  const overview = useMemo(() => {
    const now = Date.now()
    let mastered = 0
    let learning = 0
    let wrong = 0
    let starred = 0
    let due = 0
    let totalCorrect = 0
    let totalWrong = 0
    const byLevel = { core: { total: 0, learned: 0 }, extended: { total: 0, learned: 0 } }

    for (const w of allWords) {
      const p = state.progress[w.id]
      byLevel[w.level].total += 1
      if (p) {
        if (p.mastered) mastered += 1
        else if (p.last > 0) learning += 1
        if (p.last > 0) byLevel[w.level].learned += 1
        if (p.wrongBook) wrong += 1
        if (p.starred) starred += 1
        if (p.last > 0 && p.due <= now && !p.mastered) due += 1
        totalCorrect += p.correct
        totalWrong += p.wrong
      }
    }
    return { mastered, learning, wrong, starred, due, totalCorrect, totalWrong, byLevel }
  }, [state.progress])

  // 近 14 天柱状图
  const recent = useMemo(() => {
    const out: { key: string; label: string; count: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY)
      const k = dateKey(d)
      const s = state.daily[k]
      out.push({
        key: k,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        count: s ? s.learned + s.reviewed : 0,
      })
    }
    return out
  }, [state.daily])

  // 热力图：最近 26 周（约半年）
  const heatmap = useMemo(() => {
    const weeks: { key: string; count: number }[][] = []
    const total = 26 * 7
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    // 对齐到周日
    const startOffset = (end.getDay() + 7) % 7
    const start = new Date(end.getTime() - (total - 1 - (6 - startOffset)) * DAY)

    let week: { key: string; count: number }[] = []
    for (let i = 0; i < total; i++) {
      const d = new Date(start.getTime() + i * DAY)
      const k = dateKey(d)
      const s = state.daily[k]
      week.push({ key: k, count: s ? s.learned + s.reviewed : 0 })
      if (week.length === 7) {
        weeks.push(week)
        week = []
      }
    }
    if (week.length) weeks.push(week)
    return weeks
  }, [state.daily])

  const maxBar = Math.max(1, ...recent.map((r) => r.count))
  const accuracy =
    overview.totalCorrect + overview.totalWrong > 0
      ? Math.round((overview.totalCorrect / (overview.totalCorrect + overview.totalWrong)) * 100)
      : 0

  const levelPct = (v: { total: number; learned: number }) =>
    v.total ? Math.round((v.learned / v.total) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stat-grid stat-grid-4">
        <div className="stat">
          <div className="stat-value" style={{ color: 'var(--brand-text)' }}>
            {t.learned + t.reviewed}
          </div>
          <div className="stat-label">今日学习</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {overview.mastered}
          </div>
          <div className="stat-label">已掌握</div>
        </div>
        <div className="stat">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>
            {streak()}
          </div>
          <div className="stat-label">连续打卡（天）</div>
        </div>
        <div className="stat">
          <div className="stat-value">{accuracy}%</div>
          <div className="stat-label">累计正确率</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 className="section-title">近 14 天学习量</h3>
        <div className="bar-chart">
          {recent.map((r) => (
            <div className="bar-col" key={r.key} title={`${r.key}：${r.count} 词`}>
              <div
                className="bar"
                style={{ height: `${(r.count / maxBar) * 100}%`, opacity: r.count ? 1 : 0.35 }}
              />
              <span className="bar-label">{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 className="section-title" style={{ margin: 0 }}>
            打卡热力图
          </h3>
          <span className="dim" style={{ fontSize: 12 }}>
            最近 26 周 · 当前连续 {streak()} 天
          </span>
        </div>
        <div className="heatmap">
          {heatmap.map((week, wi) => (
            <div className="heat-col" key={wi}>
              {week.map((d) => {
                const lv = d.count === 0 ? 0 : d.count < 10 ? 1 : d.count < 25 ? 2 : d.count < 50 ? 3 : 4
                return <div className="heat-cell" key={d.key} data-l={lv} title={`${d.key}：${d.count} 词`} />
              })}
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
          <span className="dim" style={{ fontSize: 11 }}>
            少
          </span>
          {[0, 1, 2, 3, 4].map((l) => (
            <div className="heat-cell" key={l} data-l={l} />
          ))}
          <span className="dim" style={{ fontSize: 11 }}>
            多
          </span>
        </div>
      </div>

      <div className="grid-2">
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">词库进度</h3>
          <div style={{ marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span>核心高频</span>
              <span className="dim">
                {overview.byLevel.core.learned} / {overview.byLevel.core.total}
              </span>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${levelPct(overview.byLevel.core)}%` }} />
            </div>
          </div>
          <div>
            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span>拓展词汇</span>
              <span className="dim">
                {overview.byLevel.extended.learned} / {overview.byLevel.extended.total}
              </span>
            </div>
            <div className="progress-bar">
              <span
                style={{
                  width: `${levelPct(overview.byLevel.extended)}%`,
                  background: 'linear-gradient(90deg, var(--amber), #ff9a3c)',
                }}
              />
            </div>
          </div>

          <div className="row wrap" style={{ gap: 8, marginTop: 18 }}>
            <span className="chip">学习中 {overview.learning}</span>
            <span className="chip">待复习 {overview.due}</span>
            <span className="chip">错词 {overview.wrong}</span>
            <span className="chip">收藏 {overview.starred}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">今日明细</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              ['新学单词', `${t.learned}`],
              ['复习单词', `${t.reviewed}`],
              ['答对 / 答错', `${t.correct} / ${t.wrong}`],
              ['学习时长', fmtDuration(t.seconds)],
              ['词库规模', `${meta.count} 词`],
            ].map(([k, v]) => (
              <div className="row" key={k} style={{ justifyContent: 'space-between', fontSize: 14 }}>
                <span className="muted">{k}</span>
                <b style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 className="section-title">即将复习</h3>
        <UpcomingList />
      </div>
    </div>
  )
}

function UpcomingList() {
  const { state } = useApp()
  const items = useMemo(() => {
    const now = Date.now()
    const buckets = [
      { label: '今天', min: 0, max: DAY },
      { label: '明天', min: DAY, max: 2 * DAY },
      { label: '本周内', min: 2 * DAY, max: 7 * DAY },
      { label: '以后', min: 7 * DAY, max: Infinity },
    ]
    return buckets.map((b) => {
      let n = 0
      for (const w of allWords) {
        const p = state.progress[w.id]
        if (!p || p.last === 0 || p.mastered) continue
        const delta = p.due - now
        if (delta >= b.min && delta < b.max) n += 1
      }
      return { label: b.label, count: n }
    })
  }, [state.progress])

  return (
    <div className="row wrap" style={{ gap: 10 }}>
      {items.map((i) => (
        <div key={i.label} className="stat" style={{ flex: 1, minWidth: 110, padding: '12px 14px' }}>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {i.count}
          </div>
          <div className="stat-label">{i.label}</div>
        </div>
      ))}
    </div>
  )
}
