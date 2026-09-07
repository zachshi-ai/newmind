/**
 * 知行词法 —— 知形 8、戒形句式 11、停用词表、戒体提取与戒词元（docs/03 §2–§3 锁死）。
 *
 * 词面账三原则（与全仓同规）：不做文件系统语义、不展开 `~`、不探测存在性；
 * 化知戒形只生自知面（已装载章程的流内正文）——戒形存在之处知必已入；
 * 词法可欺但骗一次留一次形。
 */

import { normalizePath } from './object.js'

/** 知形 8（默认形表，noDefaults 可关）：单名形 7 按 basename 全等（大小写敏感），径前缀形 1 按规整径前缀。 */
export const ZHI_BASENAME = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'copilot-instructions.md',
]
export const ZHI_PREFIX = ['.cursor/rules/']

/** 知形命中：单名形按 basename 全等（basename 用 `/` 切分末段），前缀形按规整径以前缀开头。 */
export function matchesZhiForm(regPath) {
  const p = normalizePath(regPath)
  const base = p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p
  if (ZHI_BASENAME.includes(base)) return true
  return ZHI_PREFIX.some((pre) => p.startsWith(pre))
}

/** 戒形句式 11：中文 7 ∪ 英文 4（英文大小写不敏感）。 */
export const FORM_PATTERNS_ZH = ['不要', '不得', '禁止', '不许', '切勿', '不能', '勿']
export const FORM_PATTERNS_EN = ['never', 'must not', 'do not', "don't"]

/** 停用词表 41（docs/03 §3.3 锁死）：中文 24 ∪ 英文 17（小写比较）。 */
export const STOPWORDS = new Set([
  '使用', '进行', '出现', '写入', '执行', '运行', '操作', '修改', '更新', '删除',
  '创建', '添加', '以及', '或者', '并且', '如果', '然后', '之前', '之后', '时候',
  '所有', '任何', '直接', '随意',
  'the', 'and', 'with', 'use', 'into', 'from', 'this', 'that', 'when', 'then',
  'your', 'you', 'for', 'are', 'will', 'can', 'not', 'do',
])

/** 段切分：按 && || ; | 切段（管道与链式各段独立判型）。 */
export function segments(command) {
  return String(command ?? '').split(/&&|\|\||;|\|/)
}

/** 剥首尾标点（不含 `-` 与 `_`——`--force` 之 `--` 是语义）。 */
const TRIM_CHARS = '。，；：！？、（）「」《》“”‘’…—·.,;:!?\'"()[]{}<>'

function trimPunct(token) {
  let s = token
  while (s.length > 0 && TRIM_CHARS.includes(s[0])) s = s.slice(1)
  while (s.length > 0 && TRIM_CHARS.includes(s[s.length - 1])) s = s.slice(0, -1)
  return s
}

/**
 * 戒体提取：句式命中处，向后剥引导符，取至首个句读或 20 字符（先到者取）。
 * 返回 { start, body } 或 null（句式后无实文）。
 */
export function extractBody(content, start, patternLen) {
  let i = start + patternLen
  while (i < content.length && '[：:（("\'\t ]'.includes(content[i])) i++
  const rest = content.slice(i)
  const stops = rest.search(/[。；，！？;,!?.\n]/)
  const cut = stops === -1 ? rest : rest.slice(0, stops)
  const body = cut.slice(0, 20)
  if (body.trim().length === 0) return null
  return { start: i, body }
}

/** 戒体词元：空白切分、剥首尾标点、长 ≥2、过停用词表（中文按原文、英文按小写比较）。 */
export function bodyTokens(body) {
  return String(body ?? '')
    .split(/\s+/)
    .map((t) => trimPunct(t))
    .filter((t) => t.length >= 2)
    .filter((t) => !STOPWORDS.has(t) && !STOPWORDS.has(t.toLowerCase()))
}

/** 戒词元：词元集中字符最长者，并列取先出现。 */
export function headToken(tokens) {
  let head = null
  for (const t of tokens) {
    if (head === null || t.length > head.length) head = t
  }
  return head
}

/**
 * 知面正文 → 戒形清单：逐句式扫描全部命中，戒体原文去重。
 * 返回 [{ body, tokens, word }]——word 是戒词元（化知匹配唯此词元）。
 */
export function extractForms(content) {
  const text = String(content ?? '')
  if (!text) return []
  const lower = text.toLowerCase()
  const hits = []
  for (const p of FORM_PATTERNS_ZH) {
    let idx = text.indexOf(p)
    while (idx !== -1) {
      hits.push(extractBody(text, idx, p.length))
      idx = text.indexOf(p, idx + p.length)
    }
  }
  for (const p of FORM_PATTERNS_EN) {
    let idx = lower.indexOf(p)
    while (idx !== -1) {
      hits.push(extractBody(text, idx, p.length))
      idx = lower.indexOf(p, idx + p.length)
    }
  }
  const seen = new Set()
  const forms = []
  for (const h of hits) {
    if (!h) continue
    if (seen.has(h.body)) continue
    seen.add(h.body)
    const tokens = bodyTokens(h.body)
    if (!tokens.length) continue
    forms.push({ body: h.body, tokens, word: headToken(tokens) })
  }
  return forms
}
