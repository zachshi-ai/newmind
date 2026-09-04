/**
 * 险兆词表 —— 闻诊的全部家当：显式词表匹配，零 NLP、零语义判断。
 *
 * 诚实立场（docs/01-book.md 第五节）：词表是显式声明的，声明权在任务方
 * （--lexicon 可追加）；体检承诺"报出来的每一条都可复现、可门禁、可重放"，
 * 不承诺"认得出所有病句"——确定性与覆盖面分开承诺。
 */

export const DEFAULT_UNBOUNDED = [
  '所有', '全部', '凡是', '一律', '每个', '彻底', '完全', '永远', '绝不', '任何',
  'all', 'every', 'everything', 'always', 'never', 'entirely', 'completely',
]

export const DEFAULT_VAGUE = [
  '优化', '改进', '完善', '看看', '了解', '研究', '考虑', '梳理',
  'explore', 'improve', 'optimize', 'consider', 'look into', 'understand', 'review', 'familiarize',
]

export const OMEN_WEIGHT = 5
export const OMEN_CAP_PER_KIND = 10

/** 合并用户词表（追加，不覆盖内置；按原序，保证确定性遍历）。 */
export function mergeLexicon(custom) {
  const u = custom && Array.isArray(custom.unbounded) ? custom.unbounded.filter((t) => typeof t === 'string' && t.length > 0) : []
  const v = custom && Array.isArray(custom.vague) ? custom.vague.filter((t) => typeof t === 'string' && t.length > 0) : []
  return { unbounded: [...DEFAULT_UNBOUNDED, ...u], vague: [...DEFAULT_VAGUE, ...v] }
}

/**
 * 闻诊：brief 里命中的险兆。
 * 规则：英文小写化后子串匹配；同一 kind 内去重 token（与出现次数无关）；
 * 输出序 = 词表内序（无边先、无度后）——同输入永远同输出。
 */
export function findOmens(brief, lexicon) {
  const hay = brief.toLowerCase()
  const omens = []
  for (const token of lexicon.unbounded) {
    if (hay.includes(token.toLowerCase())) omens.push({ token, kind: 'unbounded', label: '无边之词', weight: OMEN_WEIGHT })
  }
  for (const token of lexicon.vague) {
    if (hay.includes(token.toLowerCase())) omens.push({ token, kind: 'vague', label: '无度之动词', weight: OMEN_WEIGHT })
  }
  return omens
}

/** 险兆计分：每 kind 内 5/去重 token，封顶 10——险兆总贡献上限 20。 */
export function omenScore(omens) {
  const by = (kind) => omens.filter((o) => o.kind === kind).length
  return Math.min(OMEN_CAP_PER_KIND, by('unbounded') * OMEN_WEIGHT) + Math.min(OMEN_CAP_PER_KIND, by('vague') * OMEN_WEIGHT)
}

/** 险兆的医嘱（按 kind）。 */
export function omenPrescription(kind) {
  return kind === 'unbounded'
    ? '无边之词改成可数的界，点名列出对象'
    : '无度之动词配上可验证的目标，改写成可对账的终验'
}
