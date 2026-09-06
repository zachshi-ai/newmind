/**
 * 材册 —— 残记形与窗字段之册（`.shenqu.json`）。
 *
 * 全部字段可选、缺省即默认；坏册（类型不对、碎览阈非 ≥1 整数）抛错由调用方落 exit 2。
 * 默认表保守开箱在岗（无册照判）；noDefaults 关闭两张默认表——审计方口径的开关。
 *
 * 信任模型（同 duzhi/zhizu）：材册是任务方的声明，Agent 无从自我豁免；
 * CLI 旗标是审计方的口径，优先级：旗标 > 册 > 默认。
 */

/** 默认残记形表（10 形，认尾——截断标记的物理位置在内容尾部；正文引用同字样的文档不误伤）。 */
export const DEFAULT_MARKERS = [
  '[truncated]',
  '[truncated…]',
  '[...truncated]',
  '[output truncated]',
  '[content truncated]',
  '<truncated>',
  '(truncated)',
  '[Clipped]',
  '[...clipped]',
  '[cut off]',
]

/** 默认窗字段表（18 名）：限形=存在即窗；偏形=存在且为 >0 数值即窗（跳过了卷首）。 */
export const DEFAULT_CAP_FIELDS = [
  'limit', 'max_lines', 'maxLines', 'num_lines', 'numLines', 'line_limit', 'lineLimit',
  'head_limit', 'headLimit', 'tail_limit', 'tailLimit',
]
export const DEFAULT_OFFSET_FIELDS = [
  'offset', 'start_line', 'startLine', 'begin_line', 'beginLine', 'skip_lines', 'skipLines',
]

const DEFAULT_BOOK = {
  version: 1,
  exempt: [],
  markers: [],
  windowFields: [],
  fragWindows: 3,
  noDefaults: false,
}

export function emptyBook() {
  return { ...DEFAULT_BOOK, exempt: [], markers: [], windowFields: [] }
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0)
}

/** 解析并校验材册（JSON 文本 → 册对象）。 */
export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(String(text))
  } catch (error) {
    throw new Error(`材册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('材册必须是 JSON 对象')
  if (raw.version != null && raw.version !== 1) throw new Error('材册 version 必须为 1')
  const book = emptyBook()
  if (raw.exempt != null) {
    if (!isStringArray(raw.exempt)) throw new Error('exempt 必须是非空字符串数组')
    book.exempt = [...raw.exempt]
  }
  if (raw.markers != null) {
    if (!isStringArray(raw.markers)) throw new Error('markers 必须是非空字符串数组')
    book.markers = [...raw.markers]
  }
  if (raw.windowFields != null) {
    if (!isStringArray(raw.windowFields)) throw new Error('windowFields 必须是非空字符串数组')
    book.windowFields = [...raw.windowFields]
  }
  if (raw.fragWindows != null) {
    if (!Number.isInteger(raw.fragWindows) || raw.fragWindows < 1) throw new Error('fragWindows 必须是 ≥1 的整数')
    book.fragWindows = raw.fragWindows
  }
  if (raw.noDefaults != null) {
    if (typeof raw.noDefaults !== 'boolean') throw new Error('noDefaults 必须是布尔值')
    book.noDefaults = raw.noDefaults
  }
  return book
}

export function serializeBook(book) {
  return `${JSON.stringify(book, null, 2)}\n`
}

export function bookCount(book) {
  return book.exempt.length + book.markers.length + book.windowFields.length + (book.fragWindows === 3 ? 0 : 1) + (book.noDefaults ? 1 : 0)
}

/**
 * 装配生效口径：册 ∪ CLI 旗标覆盖 → 豁免 / 残记（认尾 ∪ 认全文）/ 窗字段 / 碎览阈。
 * 显式残记（册与旗标）认全文；默认残记（noDefaults 未关时）认尾。
 */
export function assembleOpts({ book = null, overrides = {} } = {}) {
  const base = book ?? emptyBook()
  const exempt = [...new Set([...(base.exempt ?? []), ...(overrides.exempt ?? [])])]
  const explicitMarkers = [...new Set([...(base.markers ?? []), ...(overrides.markers ?? [])])]
  const explicitFields = [...new Set([...(base.windowFields ?? []), ...(overrides.windowFields ?? [])])]
  const noDefaults = base.noDefaults === true
  const tailMarkers = noDefaults ? [] : [...DEFAULT_MARKERS]
  const capFields = [...(noDefaults ? [] : DEFAULT_CAP_FIELDS), ...explicitFields]
  const offFields = noDefaults ? [] : [...DEFAULT_OFFSET_FIELDS]
  const fragWindows = overrides.fragWindows ?? base.fragWindows ?? 3
  return {
    exempt,
    tailMarkers,
    anyMarkers: explicitMarkers,
    capFields,
    offFields,
    fragWindows,
  }
}
