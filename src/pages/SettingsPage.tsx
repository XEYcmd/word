import { useState } from 'react'
import { useApp } from '../lib/store'
import { isSpeechSupported, speak } from '../lib/speech'
import { meta } from '../lib/bank'

export default function SettingsPage() {
  const { state, updateSettings, resetAll } = useApp()
  const s = state.settings
  const [confirming, setConfirming] = useState(false)
  const speechOk = isSpeechSupported()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <div className="card" style={{ padding: 20 }}>
        <h3 className="section-title">学习计划</h3>

        <div className="setting-row">
          <div>
            <div className="setting-label">每日新词</div>
            <div className="setting-desc">每次开始学习时引入的新单词数量</div>
          </div>
          <input
            className="number-input"
            type="number"
            min={5}
            max={200}
            step={5}
            value={s.dailyNew}
            onChange={(e) => updateSettings({ dailyNew: Math.max(1, Number(e.target.value) || 30) })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">每日复习上限</div>
            <div className="setting-desc">一次学习中最多安排多少个复习词</div>
          </div>
          <input
            className="number-input"
            type="number"
            min={10}
            max={500}
            step={10}
            value={s.dailyReview}
            onChange={(e) => updateSettings({ dailyReview: Math.max(1, Number(e.target.value) || 100) })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">每组测试题量</div>
            <div className="setting-desc">选择题 / 拼写测试每轮出题数</div>
          </div>
          <input
            className="number-input"
            type="number"
            min={5}
            max={100}
            step={5}
            value={s.quizSize}
            onChange={(e) => updateSettings({ quizSize: Math.max(1, Number(e.target.value) || 20) })}
          />
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 className="section-title">发音</h3>

        {!speechOk && (
          <div className="feedback no" style={{ marginBottom: 12 }}>
            当前浏览器不支持语音合成，发音功能不可用（不影响其他功能）
          </div>
        )}

        <div className="setting-row">
          <div>
            <div className="setting-label">自动朗读</div>
            <div className="setting-desc">出现新单词时自动读一遍</div>
          </div>
          <button
            className={`switch ${s.autoSpeak ? 'on' : ''}`}
            onClick={() => updateSettings({ autoSpeak: !s.autoSpeak })}
            aria-label="自动朗读"
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">发音口音</div>
            <div className="setting-desc">取决于系统里安装了哪种语音包</div>
          </div>
          <select
            className="select"
            value={s.accent}
            onChange={(e) => updateSettings({ accent: e.target.value as 'us' | 'uk' })}
          >
            <option value="us">美式 en-US</option>
            <option value="uk">英式 en-GB</option>
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">语速</div>
            <div className="setting-desc">当前 {s.rate.toFixed(2)}x</div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <input
              type="range"
              min={0.5}
              max={1.5}
              step={0.05}
              value={s.rate}
              onChange={(e) => updateSettings({ rate: Number(e.target.value) })}
              style={{ width: 140 }}
            />
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => speak('vocabulary', { accent: s.accent, rate: s.rate })}
            >
              🔊 试听
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 className="section-title">外观与测试</h3>

        <div className="setting-row">
          <div>
            <div className="setting-label">主题</div>
            <div className="setting-desc">跟随系统或固定明暗</div>
          </div>
          <select
            className="select"
            value={s.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as typeof s.theme })}
          >
            <option value="auto">跟随系统</option>
            <option value="light">亮色</option>
            <option value="dark">暗色</option>
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">拼写忽略大小写</div>
            <div className="setting-desc">关闭后必须完全匹配大小写</div>
          </div>
          <button
            className={`switch ${s.ignoreCase ? 'on' : ''}`}
            onClick={() => updateSettings({ ignoreCase: !s.ignoreCase })}
            aria-label="拼写忽略大小写"
          />
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 className="section-title">数据</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          学习进度保存在浏览器本地（localStorage），换设备或清缓存会丢失。建议定期导出备份。
        </p>

        <div className="row wrap" style={{ gap: 8 }}>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `word-progress-${new Date().toISOString().slice(0, 10)}.json`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
          >
            ⬇️ 导出进度
          </button>

          <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
            ⬆️ 导入进度
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                try {
                  const text = await file.text()
                  const data = JSON.parse(text)
                  if (!data.progress) throw new Error('格式不正确')
                  localStorage.setItem('word-memory-v1', JSON.stringify(data))
                  location.reload()
                } catch (err) {
                  alert('导入失败：' + (err instanceof Error ? err.message : '未知错误'))
                }
              }}
            />
          </label>

          {confirming ? (
            <>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--red)' }}
                onClick={() => {
                  resetAll()
                  setConfirming(false)
                  location.reload()
                }}
              >
                确认清空
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                取消
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={() => setConfirming(true)}>
              清空所有进度
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <h3 className="section-title">关于</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">词库</span>
            <b>{meta.count} 词</b>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">核心 / 拓展</span>
            <b>
              {meta.core} / {meta.extended}
            </b>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">数据来源</span>
            <span className="dim" style={{ fontSize: 12 }}>
              {meta.source}
            </span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">版本</span>
            <b>v{meta.version}</b>
          </div>
        </div>
        <p className="dim" style={{ fontSize: 12, marginBottom: 0, marginTop: 14 }}>
          纯前端实现，无后端、无网络请求，断网也能正常使用。
        </p>
      </div>
    </div>
  )
}
