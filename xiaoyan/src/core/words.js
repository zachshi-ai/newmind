/**
 * 效词表与免验词表 —— 显式词法，零 NLP（docs/03 §4–§5）。
 *
 * 纯字母数字词（test、lint…）：词界匹配 —— `\b<word>\b`（小写化后），
 *   "latest" 不误伤 "test"（latest 中 test 前是字母，无词界），
 *   "parse.test.js" 命中 "test"（`.` 是词界）。
 * 其余词（CJK、连字符形 --quiet、含空格形 npm test）：子串匹配——
 *   \b 在连字符前不成立，旗形词必须走子串（免验词表的主用形）。
 * 命中坍缩：最长词胜出（仅用于点名展示），与论世的坍缩规则一致。
 */

export const DEFAULT_XIAO_WORDS = [
  'test', 'spec', 'lint', 'check', 'verify', 'validate', 'audit', 'build', 'compile',
  'coverage', 'benchmark', 'smoke', 'probe', 'assert', 'tsc', 'pytest', 'jest', 'vitest',
  '测试', '验证', '检查', '校验', '构建', '编译', '审计', '体检',
]

export const DEFAULT_MIANYAN_WORDS = []

/** 小写化、去重、滤空。追加式并集（不可删减默认保护）由调用方构造保证。 */
export function normalizeWords(words) {
  if (!Array.isArray(words)) return []
  return [...new Set(words.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.toLowerCase()))]
}

function escapeRegExp(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ALNUM = /^[a-z0-9]+$/

/** 单词命中判定：纯字母数字词界 / 其余子串。 */
export function wordHit(text, word) {
  if (ALNUM.test(word)) return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text)
  return text.includes(word)
}

/** 词表命中：返回按词表序排列的命中词数组。 */
export function matchWords(text, words) {
  return words.filter((word) => wordHit(text, word))
}

/** 命中坍缩：w 是另一命中词 w2 的子串（w ⊂ w2）时 w 被吸收（最长词胜出）。 */
export function collapse(hits) {
  return hits.filter((w) => !hits.some((w2) => w2 !== w && w2.includes(w)))
}
