/**
 * 足册（.zhizu.json）——阈值与豁免之册。
 *
 * 声明权在任务方：Agent 无从自我发额度；CLI 旗标是审计方的口径（旗标 > 册 > 默认）。
 * 无册照判：册缺失时默认阈值照常在岗。坏册报错（CLI 转 exit 2）。
 */

export const DEFAULT_THRESHOLDS = { hugeLines: 400, fanDirs: 6, fanFiles: 20, churnFree: 3 }

export function emptyBook() {
  return { version: 1, exempt: [], ...DEFAULT_THRESHOLDS }
}

function fail(message) {
  throw new Error(message)
}

/** 校验并装配足册：未知字段忽略，字段类型与取值范围错则抛 Error。 */
export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    fail(`足册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('足册必须是 JSON 对象')
  const book = emptyBook()
  if (Array.isArray(raw.exempt)) {
    for (const w of raw.exempt) {
      if (typeof w !== 'string' || w.length === 0) fail('exempt 必须是非空字符串数组')
    }
    book.exempt = [...new Set(raw.exempt)]
  } else if (raw.exempt != null) {
    fail('exempt 必须是非空字符串数组')
  }
  for (const key of ['hugeLines', 'fanDirs', 'fanFiles', 'churnFree']) {
    if (raw[key] == null) continue
    const v = raw[key]
    if (!Number.isInteger(v) || v < 1) fail(`${key} 必须是 ≥1 的整数`)
    book[key] = v
  }
  return book
}

export function serializeBook(book) {
  return JSON.stringify(
    {
      version: 1,
      exempt: book.exempt ?? [],
      hugeLines: book.hugeLines ?? DEFAULT_THRESHOLDS.hugeLines,
      fanDirs: book.fanDirs ?? DEFAULT_THRESHOLDS.fanDirs,
      fanFiles: book.fanFiles ?? DEFAULT_THRESHOLDS.fanFiles,
      churnFree: book.churnFree ?? DEFAULT_THRESHOLDS.churnFree,
    },
    null,
    2,
  ) + '\n'
}

export function bookCount(book) {
  return (book?.exempt ?? []).length
}

/** 审计方口径合并：CLI 旗标覆盖册值（旗标 > 册 > 默认）。值域校验同 parseBook。 */
export function overrideBook(book, overrides = {}) {
  const next = { ...(book ?? emptyBook()) }
  for (const key of ['hugeLines', 'fanDirs', 'fanFiles', 'churnFree']) {
    const v = overrides[key]
    if (v == null) continue
    if (!Number.isInteger(v) || v < 1) throw new Error(`${key} 必须是 ≥1 的整数`)
    next[key] = v
  }
  if (overrides.exempt) {
    for (const w of overrides.exempt) {
      if (typeof w !== 'string' || w.length === 0) throw new Error('exempt 必须是非空字符串数组')
    }
    next.exempt = [...new Set([...(next.exempt ?? []), ...overrides.exempt])]
  }
  return next
}
