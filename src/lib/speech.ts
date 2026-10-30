/** 浏览器语音合成（TTS），离线可用，无需联网 */

let voicesCache: SpeechSynthesisVoice[] = []

function refreshVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  voicesCache = window.speechSynthesis.getVoices()
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices()
  window.speechSynthesis.onvoiceschanged = refreshVoices
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function pickVoice(accent: 'us' | 'uk'): SpeechSynthesisVoice | undefined {
  if (!voicesCache.length) refreshVoices()
  const want = accent === 'uk' ? ['en-GB', 'en_GB'] : ['en-US', 'en_US']
  const other = accent === 'uk' ? ['en-US', 'en_US'] : ['en-GB', 'en_GB']

  const byLang = (langs: string[]) =>
    voicesCache.find((v) => langs.some((l) => v.lang.replace('-', '_').startsWith(l.replace('-', '_'))))

  return byLang(want) ?? byLang(other) ?? voicesCache.find((v) => v.lang.toLowerCase().startsWith('en'))
}

export interface SpeakOptions {
  accent?: 'us' | 'uk'
  rate?: number
  onEnd?: () => void
}

/** 朗读一个单词/句子。返回是否成功发起。 */
export function speak(text: string, opts: SpeakOptions = {}): boolean {
  if (!isSpeechSupported() || !text) return false
  const { accent = 'us', rate = 0.9, onEnd } = opts
  try {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    const v = pickVoice(accent)
    if (v) u.voice = v
    u.lang = v?.lang ?? (accent === 'uk' ? 'en-GB' : 'en-US')
    u.rate = Math.min(2, Math.max(0.5, rate))
    u.pitch = 1
    if (onEnd) u.onend = () => onEnd()
    window.speechSynthesis.speak(u)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}
