/**
 * 常见近义词组：中→英选择题里，同一组内的词不能同时出现在选项中，
 * 否则会出现「多个选项都能对应所考中文」。
 *
 * 只收高中词库范围内、语义确实高度重合的词对；
 * 各组内成员两两互斥（传递闭包）。
 */
export const SYNONYM_GROUPS: string[][] = [
  // 信息类
  ['information', 'news', 'message', 'notice'],
  // 买卖
  ['buy', 'purchase', 'shop', 'sell'],
  // 道路
  ['road', 'street', 'way', 'path', 'route'],
  // 家
  ['home', 'house', 'family'],
  // 看
  ['look', 'see', 'watch', 'notice', 'observe'],
  // 说
  ['say', 'speak', 'talk', 'tell'],
  // 帮助
  ['help', 'assist', 'aid'],
  // 大小
  ['big', 'large', 'huge', 'great'],
  ['small', 'little', 'tiny', 'minor'],
  // 快慢
  ['fast', 'quick', 'rapid', 'swift'],
  ['slow', 'sluggish'],
  // 开始结束
  ['begin', 'start', 'commence'],
  ['end', 'finish', 'complete', 'conclude'],
  // 情绪
  ['happy', 'glad', 'pleased', 'delighted'],
  ['sad', 'unhappy', 'sorrowful'],
  ['angry', 'mad', 'furious'],
  ['afraid', 'scared', 'frightened', 'terrified'],
  // 困难
  ['difficult', 'hard', 'tough'],
  ['easy', 'simple'],
  // 工作
  ['job', 'work', 'career', 'occupation'],
  // 回答
  ['answer', 'reply', 'response', 'respond'],
  // 照片
  ['photo', 'photograph', 'picture', 'image'],
  // 考试
  ['exam', 'examination', 'test', 'quiz'],
  // 车
  ['car', 'automobile', 'vehicle'],
  // 电影
  ['film', 'movie'],
  // 商店
  ['store', 'shop'],
  // 生病
  ['ill', 'sick', 'unwell'],
  // 整个
  ['whole', 'entire', 'complete', 'total'],
  // 经常
  ['often', 'frequently', 'usually'],
  // 很少
  ['seldom', 'rarely', 'hardly'],
  // 立刻
  ['immediately', 'instantly', 'at once'],
  // 高兴地
  ['perhaps', 'maybe', 'possibly', 'probably'],
  // 选择
  ['choose', 'select', 'pick'],
  // 记得
  ['remember', 'recall', 'memorize'],
  // 忘记
  ['forget', 'ignore'],
  // 增加减少
  ['increase', 'raise', 'rise', 'grow'],
  ['decrease', 'reduce', 'decline', 'drop'],
  // 重要
  ['important', 'significant', 'essential', 'vital'],
  // 美丽
  ['beautiful', 'pretty', 'lovely', 'handsome'],
  // 聪明
  ['clever', 'smart', 'bright', 'intelligent'],
  // 需要
  ['need', 'require', 'demand'],
  // 得到
  ['get', 'obtain', 'gain', 'acquire'],
  // 给
  ['give', 'offer', 'provide', 'supply'],
  // 建造
  ['build', 'construct', 'establish'],
  // 破坏
  ['destroy', 'damage', 'ruin'],
  // 保护
  ['protect', 'defend', 'guard'],
  // 允许
  ['allow', 'permit', 'let'],
  // 禁止
  ['forbid', 'ban', 'prohibit'],
  // 建议
  ['advise', 'suggest', 'recommend'],
  // 认为
  ['think', 'believe', 'consider', 'suppose'],
  // 期望
  ['hope', 'wish', 'expect'],
  // 害怕
  ['fear', 'afraid', 'dread'],
  // 旅行
  ['travel', 'trip', 'journey', 'tour', 'voyage'],
  // 天气
  ['weather', 'climate'],
  // 钱
  ['money', 'cash', 'currency'],
  // 学生老师
  ['student', 'pupil'],
  ['teacher', 'instructor'],
  // 房间
  ['room', 'chamber'],
  // 开始
  ['opening', 'start'],
]

/** 词形 -> 组 id 列表 */
const GROUP_OF = new Map<string, number[]>()
SYNONYM_GROUPS.forEach((group, idx) => {
  for (const w of group) {
    const key = w.toLowerCase().trim()
    const list = GROUP_OF.get(key) ?? []
    list.push(idx)
    GROUP_OF.set(key, list)
  }
})

/** 两个英文词是否属于同一近义词组 */
export function areSynonyms(a: string, b: string): boolean {
  const ka = a.toLowerCase().trim()
  const kb = b.toLowerCase().trim()
  if (!ka || !kb) return false
  if (ka === kb) return true
  const ga = GROUP_OF.get(ka)
  if (!ga) return false
  const gb = GROUP_OF.get(kb)
  if (!gb) return false
  return ga.some((g) => gb.includes(g))
}
