import { useEffect, useMemo, useState } from 'react'
import { useApp } from './lib/store'
import { allWords, meta } from './lib/bank'
import HomePage from './pages/HomePage'
import StudyPage from './pages/StudyPage'
import ListPage from './pages/ListPage'
import StatsPage from './pages/StatsPage'
import SettingsPage from './pages/SettingsPage'
import { dateKey } from './lib/storage'

export type Route = 'home' | 'study' | 'list' | 'stats' | 'settings'

const NAV: { key: Route; label: string; icon: string }[] = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'study', label: '开始学习', icon: '🃏' },
  { key: 'list', label: '词库', icon: '📚' },
  { key: 'stats', label: '统计', icon: '📊' },
  { key: 'settings', label: '设置', icon: '⚙️' },
]

export default function App() {
  const { state, updateSettings, today } = useApp()
  const [route, setRoute] = useState<Route>(() => {
    const h = location.hash.replace('#/', '')
    return (NAV.some((n) => n.key === h) ? h : 'home') as Route
  })

  // 主题
  useEffect(() => {
    const apply = () => {
      const want = state.settings.theme
      const dark =
        want === 'dark' ||
        (want === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [state.settings.theme])

  // hash 路由
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.replace('#/', '')
      if (NAV.some((n) => n.key === h)) setRoute(h as Route)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (r: Route) => {
    setRoute(r)
    location.hash = `#/${r}`
    window.scrollTo({ top: 0 })
  }

  const badges = useMemo(() => {
    const wrong = Object.values(state.progress).filter((p) => p.wrongBook).length
    const now = Date.now()
    const due = allWords.filter((w) => {
      const p = state.progress[w.id]
      return p && p.due <= now && p.last > 0
    }).length
    return { wrong, due }
  }, [state.progress])

  const t = today()
  const doneToday = t.learned + t.reviewed

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">词</div>
          <div>
            <div className="brand-name">高中必背 3600 词</div>
            <div className="brand-sub">{meta.count} 词 · 离线可用</div>
          </div>
        </div>

        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-item ${route === n.key ? 'active' : ''}`}
            onClick={() => go(n.key)}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
            {n.key === 'study' && badges.due > 0 && <span className="nav-badge">{badges.due}</span>}
            {n.key === 'list' && badges.wrong > 0 && <span className="nav-badge">{badges.wrong}</span>}
          </button>
        ))}

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          <div className="card" style={{ padding: 14, background: 'var(--card-2)' }}>
            <div className="dim" style={{ fontSize: 11, marginBottom: 4 }}>
              今日学习
            </div>
            <div style={{ fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
              {doneToday}
              <span className="dim" style={{ fontSize: 13, fontWeight: 500 }}>
                {' '}
                / {state.settings.dailyNew + state.settings.dailyReview}
              </span>
            </div>
            <div className="progress-bar" style={{ marginTop: 8 }}>
              <span
                style={{
                  width: `${Math.min(100, (doneToday / Math.max(1, state.settings.dailyNew + state.settings.dailyReview)) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10, justifyContent: 'space-between' }}>
            <span className="dim" style={{ fontSize: 11 }}>
              {dateKey()}
            </span>
            <button
              className="chip"
              onClick={() =>
                updateSettings({
                  theme:
                    state.settings.theme === 'light'
                      ? 'dark'
                      : state.settings.theme === 'dark'
                        ? 'auto'
                        : 'light',
                })
              }
              title="切换主题"
            >
              {state.settings.theme === 'light' ? '☀️ 亮' : state.settings.theme === 'dark' ? '🌙 暗' : '🌗 自动'}
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{NAV.find((n) => n.key === route)?.label}</h1>
          <div className="topbar-spacer" />
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => go('study')}
              title="开始今日学习"
            >
              {badges.due > 0 ? `复习 ${badges.due}` : '开始学习'}
            </button>
            <button
              className="btn btn-icon btn-ghost"
              onClick={() =>
                updateSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' })
              }
              title="明暗切换"
            >
              {state.settings.theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <main className="content">
          {route === 'home' && <HomePage go={go} />}
          {route === 'study' && <StudyPage />}
          {route === 'list' && <ListPage />}
          {route === 'stats' && <StatsPage />}
          {route === 'settings' && <SettingsPage />}
        </main>
      </div>

      <nav className="mobile-nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={`nav-item ${route === n.key ? 'active' : ''}`}
            onClick={() => go(n.key)}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
