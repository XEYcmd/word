import type { Grade, WordProgress } from './storage'

/** 艾宾浩斯间隔（天）：第 n 次答对后，隔多少天再复习 */
export const INTERVALS_DAYS = [0, 1, 2, 4, 7, 15, 30, 60]

/** 连续答对多少次算「掌握」 */
export const MASTER_STEP = 7

export function newProgress(id: string, now = Date.now()): WordProgress {
  return {
    id,
    step: 0,
    due: now,
    last: 0,
    correct: 0,
    wrong: 0,
    mastered: false,
    wrongBook: false,
    starred: false,
  }
}

/**
 * 根据作答质量推进 SRS 状态。
 * again: 忘记 -> 回到 step 0，进入错词本，1 小时后重来
 * hard : 勉强 -> step 不变，缩短间隔
 * good : 记得 -> step +1，按曲线排期
 * easy : 太简单 -> step +2
 */
export function schedule(p: WordProgress, grade: Grade, now = Date.now()): WordProgress {
  const next: WordProgress = { ...p, last: now }
  const DAY = 24 * 60 * 60 * 1000

  switch (grade) {
    case 'again':
      next.step = 0
      next.wrong += 1
      next.due = now + 10 * 60 * 1000
      next.mastered = false
      next.wrongBook = true
      return next
    case 'hard':
      next.step = Math.max(0, p.step)
      next.correct += 1
      next.due = now + 0.5 * DAY
      return next
    case 'good':
      next.step = p.step + 1
      next.correct += 1
      next.due = now + INTERVALS_DAYS[Math.min(next.step, INTERVALS_DAYS.length - 1)] * DAY
      next.mastered = next.step >= MASTER_STEP
      return next
    case 'easy':
      next.step = p.step + 2
      next.correct += 1
      next.due = now + INTERVALS_DAYS[Math.min(next.step, INTERVALS_DAYS.length - 1)] * DAY * 1.3
      next.mastered = next.step >= MASTER_STEP
      return next
  }
}

/** 测试作答（选择题/拼写）：对错简化处理 */
export function gradeQuiz(p: WordProgress, ok: boolean, now = Date.now()): WordProgress {
  if (ok) {
    const next = schedule(p, p.step >= 2 ? 'good' : 'good', now)
    next.wrongBook = p.wrongBook && p.step + 1 < MASTER_STEP
    return next
  }
  const next = schedule(p, 'again', now)
  return next
}

/** 从错词本移除 */
export function removeFromWrongBook(p: WordProgress): WordProgress {
  return { ...p, wrongBook: false }
}

export function isDue(p: WordProgress, now = Date.now()): boolean {
  return p.due <= now
}

export function isNew(p: WordProgress | undefined): boolean {
  return !p || (p.last === 0 && p.step === 0)
}
