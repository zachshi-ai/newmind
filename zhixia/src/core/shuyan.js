/**
 * 数言 · 列块 · 表块 · 日序 —— 指瑕的词法面（docs/03 §3/§4/§5/§6 锁死），全部显式词表与结构判定，零 LLM。
 *
 * 数言（声明卷面数目之词）：中文方向词 12（上 3/下 3/无向 6）× 量词 30；英文方向形 7 前缀
 * 与冒号形（跨形去重）。N ≥ 2 方成言；只生于非列非表行（列内子数不是卷面结构声明）。
 *
 * 列块/表块：数言之应——块窗 gap ≤ 2、空行透明、块内同类行连续；表块须有效形
 * （≥3 行含分隔行）；列实 M = 列块行数或表数据行数（去表头/分隔行/合计行）。
 *
 * 表账：单合计行 × 纯整数列，各行和 ≠ 合计即乖总（不依赖数言，无声也判）。
 * 日序：行内 ISO 日期对，历法门（月 01–12 日 01–31），起 > 止即倒期（列行表行皆判）。
 */

export const DIR_UP_ZH = ['以上', '上述', '前述']
export const DIR_DOWN_ZH = ['以下', '如下', '下述']
export const DIR_ANY_ZH = ['共计', '总共', '总计', '共', '合计', '凡']
export const QUANT_ZH = [
  '条目', '事项', '任务', '问题', '风险', '需求', '建议', '要点', '步骤', '规则',
  '文件', '测试', '用例', '案例', '功能', '模块',
  '个', '项', '条', '点', '处', '步', '名', '则', '例', '类', '款', '篇', '章', '节',
]
export const PREFIX_EN = {
  up: ['above'],
  down: ['following', 'below', 'next', 'these'],
  any: ['total', 'all'],
}
export const QUANT_EN = [
  'items', 'item', 'points', 'point', 'steps', 'step', 'rules', 'rule', 'tasks', 'task',
  'issues', 'issue', 'findings', 'finding', 'requirements', 'requirement', 'risks', 'risk',
  'notes', 'note', 'examples', 'example', 'files', 'file', 'tests', 'test', 'cases', 'case',
  'bugs', 'bug', 'fixes', 'fix', 'modules', 'module', 'features', 'feature',
  'sections', 'section', 'chapters', 'chapter', 'entries', 'recommendations', 'recommendation',
  'questions', 'question', 'options', 'option', 'candidates', 'candidate',
]

export const LIST_RE = /^\s*(?:[-*+]|\d+[.、)])\s/
export const TABLE_RE = /^\s*\|/
export const SEP_CELL_RE = /^:?-{2,}:?$/
export const TOTAL_LABELS = new Set(['合计', '总计', '总共', 'sum', 'total', 'grand total', 'overall'])
export const DATE_RE = /(\d{4}-\d{2}-\d{2})\s*(?:至|到|~|～|–|—|->|→|\bto\b|\bthrough\b)\s*(\d{4}-\d{2}-\d{2})/gi

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function zhClaimsOf(line) {
  const out = []
  const groups = [
    ['up', DIR_UP_ZH],
    ['down', DIR_DOWN_ZH],
    ['any', DIR_ANY_ZH],
  ]
  for (const [dir, words] of groups) {
    const re = new RegExp(`(${words.join('|')})\\s*(\\d{1,4})\\s*(${QUANT_ZH.join('|')})`, 'g')
    for (const m of line.matchAll(re)) {
      out.push({ dir, n: Number(m[2]), start: m.index, end: m.index + m[0].length })
    }
  }
  return out
}

const EN_PREFIXES = [...PREFIX_EN.up, ...PREFIX_EN.down, ...PREFIX_EN.any]
const EN_DIR_OF = new Map([
  ...PREFIX_EN.up.map((w) => [w, 'up']),
  ...PREFIX_EN.down.map((w) => [w, 'down']),
  ...PREFIX_EN.any.map((w) => [w, 'any']),
])

function enClaimsOf(line) {
  const out = []
  const quant = QUANT_EN.map(escapeRegex).join('|')
  const dirRe = new RegExp(`\\b(${EN_PREFIXES.map(escapeRegex).join('|')})\\s*:?\\s*(\\d{1,4})\\s+(${quant})\\b`, 'gi')
  for (const m of line.matchAll(dirRe)) {
    out.push({ dir: EN_DIR_OF.get(m[1].toLowerCase()), n: Number(m[2]), start: m.index, end: m.index + m[0].length })
  }
  const colonRe = new RegExp(`\\b(\\d{1,4})\\s+(${quant})\\s*[:：]`, 'gi')
  for (const m of line.matchAll(colonRe)) {
    const span = { dir: 'any', n: Number(m[1]), start: m.index, end: m.index + m[0].length }
    const clash = out.some((c) => span.start < c.end && c.start < span.end)
    if (!clash) out.push(span)
  }
  return out
}

/**
 * 一行的数言（区间去重——同一声明只取一形）。
 * 返回 [{ dir, n, start, end }]；n < 2 不成言（宁纵）。
 */
export function claimsOf(line) {
  const all = [...zhClaimsOf(line), ...enClaimsOf(line)]
  all.sort((a, b) => a.start - b.start)
  const kept = []
  for (const c of all) {
    if (c.n < 2) continue
    if (kept.some((k) => c.start < k.end && k.start < c.end)) continue
    kept.push(c)
  }
  return kept
}

export function isListLine(s) {
  return LIST_RE.test(s)
}

export function isTableLine(s) {
  return TABLE_RE.test(s)
}

/** 块窗扫描：自数言行起逐步进（step=+1 向下 / -1 向上），空行跳过，gap > 2 不认块。 */
export function scanBlock(lines, claimIdx, step) {
  let j = claimIdx + step
  let gap = 0
  while (j >= 0 && j < lines.length) {
    const s = lines[j]
    if (!s.trim()) {
      j += step
      continue
    }
    if (isListLine(s) || isTableLine(s)) return { start: j, kind: isTableLine(s) ? 'table' : 'list' }
    gap += 1
    if (gap > 2) return null
    j += step
  }
  return null
}

/** 列块行数：自块首连续列表行（空行透明，遇非空非列行止）。 */
export function collectList(lines, start) {
  let j = start
  let count = 0
  while (j < lines.length) {
    const s = lines[j]
    if (!s.trim()) {
      j += 1
      continue
    }
    if (!isListLine(s)) break
    count += 1
    j += 1
  }
  return count
}

/** 自块首连续表行（空行透明），供表解析。 */
export function collectTableLines(lines, start) {
  const out = []
  let j = start
  while (j < lines.length) {
    const s = lines[j]
    if (!s.trim()) {
      j += 1
      continue
    }
    if (!isTableLine(s)) break
    out.push({ text: s, no: j + 1 })
    j += 1
  }
  return out
}

export function splitCells(line) {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((c) => c.trim())
}

export function isSeparatorRow(cells) {
  return cells.length > 0 && cells.every((c) => SEP_CELL_RE.test(c))
}

export function normLabel(s) {
  return String(s ?? '').trim().replace(/:$/, '').toLowerCase()
}

export function isTotalRow(cells) {
  return TOTAL_LABELS.has(normLabel(cells[0]))
}

/** 整数格：剥千分位/空白/尾百分号/首币符后须为纯整数；小数不算（四舍五入的世界，宁纵）。 */
export function parseIntCell(s) {
  const t = String(s ?? '').replace(/[,，\s%¥$€£]/g, '')
  return /^[-+]?\d+$/.test(t) ? Number(t) : null
}

/**
 * 表解析：valid=false 无效形；skip=true 合计行数 ≠ 1（整表跳过——分组小计不判）；
 * 否则返回 { valid, skip, cols, total: {cells, text, line}, dataRows: [{cells, line}] }。
 */
export function parseTable(tlines) {
  if (tlines.length < 3) return { valid: false }
  const rows = tlines.map((tl) => ({ cells: splitCells(tl.text), text: tl.text, line: tl.no }))
  if (!isSeparatorRow(rows[1].cells)) return { valid: false }
  const cols = rows[0].cells.length
  if (cols < 1 || rows.some((r) => r.cells.length !== cols)) return { valid: false }
  const body = rows.slice(2)
  const totalRows = body.filter((r) => isTotalRow(r.cells))
  if (totalRows.length !== 1) return { valid: true, skip: true }
  const total = totalRows[0]
  const dataRows = body.filter((r) => r !== total && !isSeparatorRow(r.cells))
  return { valid: true, skip: false, cols, total, dataRows }
}

/** 历法门：月 01–12 且日 01–31（零垫串比较即时间序）。 */
export function calOk(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  if (!m) return false
  const mo = Number(m[2])
  const da = Number(m[3])
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31
}

/**
 * 数言之应的表行计数（docs/03 §4）：M = 数据行数（去表头/分隔行/合计行），
 * 不问合计行数——单合计行之条件只属 §5 表账，言与列的相应只数可数之实。
 * 无效形返回 null（按无块论——阙列）。
 */
export function claimTableRows(tlines) {
  if (tlines.length < 3) return null
  const rows = tlines.map((tl) => ({ cells: splitCells(tl.text) }))
  if (!isSeparatorRow(rows[1].cells)) return null
  const cols = rows[0].cells.length
  if (cols < 1 || rows.some((r) => r.cells.length !== cols)) return null
  const body = rows.slice(2)
  return body.filter((r) => !isSeparatorRow(r.cells) && !isTotalRow(r.cells)).length
}

/** djb2 指纹（点名掩码用：块中永不携带行原文）。 */
export function djb2(s) {
  let h = 5381
  const str = String(s)
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0
  return h.toString(16)
}
