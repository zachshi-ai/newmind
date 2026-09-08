/**
 * 引形 · 引语 · 托主 · 托径 —— 矫托的词法面（docs/03 §3/§4 锁死），全部显式词表，零 LLM。
 *
 * 引形（自称依据之词）默认 25 形，两档：
 *   文书型 16（语义上明确指成文依据）：中文 9 ∪ 英文 7；
 *   泛型 9（可能是对某方的要求，不必然自称原文）：中文 4 ∪ 英文 5。
 * 英文词形加词界（`per` 不得误中 `person`）；表序 = 文书型全表在前、泛型全表在后。
 *
 * 引语（引号内自称原文之文）三式：中文「」『』、英文双引、英文单引（撇号防御：
 * 开闭引号紧邻字符不得为字母数字——`don't` 不成对）。原文 ≥4 字符方成引语。
 * 嵌套取内：区间严格包含其他引语区间的外层对弃用（`-m "per X: require '...'"` 里
 * 内层单引才是自称原文）。
 *
 * 托主词 12（引的是主渠道——主渠道不在导出流里，判时诚实沉默）：中文 5 ∪ 英文 7。
 * 托径（指名文书）：行内带文书后缀的词元取首见。
 */

import { normalizePath } from './object.js'

export const DOCUMENTARY_ZH = ['规定', '章程', '任务书', '写明', '明言', '明确指出', '条例', '守则', '依据']
export const DOCUMENTARY_EN = ['per', 'according to', 'as stated', 'as defined in', 'as noted in', 'as documented in', 'as specified']
export const GENERIC_ZH = ['要求', '明确要求', '遵照', '约定']
export const GENERIC_EN = ['as required', 'as mandated', 'required by', 'mandated by', 'as per']

export const ZHUHU_ZH = ['用户', '主人', '任务方', '提问者', '对方']
export const ZHUHU_EN = ['user', 'requester', 'owner', 'you said', 'you asked', 'you requested', 'you told']

const PATH_RE = /[A-Za-z0-9_\-./]+\.(?:md|txt|markdown|rst|adoc|json|ya?ml|toml|cfg|ini|conf)/

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function enIndex(line, word) {
  const m = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(word)}(?![A-Za-z0-9])`, 'i').exec(line)
  return m ? { index: m.index, end: m.index + m[0].length } : null
}

/**
 * 行内引形（表序取先：文书型全表 → 泛型全表；中文子串、英文词界大小写不敏感）。
 * extra 为诏册 words 增补（归文书型档）。返回 { kind, word, index, end } 或 null。
 */
export function matchYinxing(line, { extra = [], noDefaults = false } = {}) {
  const docZh = noDefaults ? [] : DOCUMENTARY_ZH
  const docEn = noDefaults ? [] : DOCUMENTARY_EN
  const genZh = noDefaults ? [] : GENERIC_ZH
  const genEn = noDefaults ? [] : GENERIC_EN
  for (const w of [...extra, ...docZh]) {
    const i = line.indexOf(w)
    if (i !== -1) return { kind: 'documentary', word: w, index: i, end: i + w.length }
  }
  for (const w of docEn) {
    const p = enIndex(line, w)
    if (p) return { kind: 'documentary', word: w, ...p }
  }
  for (const w of genZh) {
    const i = line.indexOf(w)
    if (i !== -1) return { kind: 'generic', word: w, index: i, end: i + w.length }
  }
  for (const w of genEn) {
    const p = enIndex(line, w)
    if (p) return { kind: 'generic', word: w, ...p }
  }
  return null
}

/** 托主词（中文子串、英文词界大小写不敏感）。 */
export function hasZhuhu(line) {
  for (const w of ZHUHU_ZH) if (line.includes(w)) return true
  for (const w of ZHUHU_EN) if (enIndex(line, w)) return true
  return false
}

const QUOTE_RES = [
  /[「『]([^」』]{4,})[」』]/g,
  /"([^"]{4,})"/g,
  /(?<![A-Za-z0-9])'([^']{4,})'(?![A-Za-z0-9])/g,
]

/** 规整：trim + 内部空白折叠为单空格（引语与诏本对账同法）。 */
export function normText(s) {
  return String(s).replace(/\s+/g, ' ').trim()
}

/**
 * 行内引语对（嵌套取内）：返回 [{ body, start, end, norm }]，按起点序。
 * 区间严格包含另一区间的外层对弃用。
 */
export function extractQuotes(line) {
  const all = []
  for (const re of QUOTE_RES) {
    re.lastIndex = 0
    for (const m of String(line).matchAll(re)) {
      all.push({ body: m[1], start: m.index, end: m.index + m[0].length })
    }
  }
  all.sort((a, b) => a.start - b.start || a.end - b.end)
  return all
    .filter((a) => !all.some((b) => b !== a && b.start >= a.start && b.end <= a.end && (b.start > a.start || b.end < a.end)))
    .map((q) => ({ ...q, norm: normText(q.body) }))
}

/** 托径（指名文书）：行内带文书后缀的词元取首见（未规整原文，匹配时再规整）。 */
export function extractTargetPath(line) {
  const m = PATH_RE.exec(String(line))
  return m ? m[0] : null
}

/**
 * 托径匹配诏账：basename 全等 ∪ 规整径全等 ∪ 规整径以「/托径」结尾。
 * 返回诏账键（规整径）或 null。
 */
export function matchTarget(target, zhaos) {
  const t = normalizePath(target)
  for (const key of zhaos.keys()) {
    if (key === t) return key
    const base = key.split('/').pop()
    if (base === t) return key
    if (t.includes('/') && key.endsWith(`/${t}`)) return key
  }
  return null
}

/** djb2 指纹（点名掩码用：块中永不携带引语与引句原文）。 */
export function djb2(s) {
  let h = 5381
  const str = String(s)
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h.toString(16)
}
