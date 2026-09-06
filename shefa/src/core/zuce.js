/**
 * 筏册（.shefa.json）——归宿声明之册（docs/03 §3）。
 *
 * 声明权在任务方：keep 是交付径的签字、raft 是追加筏形、roots 是任务域界；
 * CLI 旗标是审计方的口径（旗标 > 册 > 默认）。无册照判：默认形表开箱在岗。坏册报错（CLI 转 exit 2）。
 */

export const DEFAULT_RAFT_FORMS = [
  'tmp/', 'temp/', 'scratch/', 'sandbox/', 'draft/', 'wip/', 'debug/',
  'backup', '.bak', '.tmp', '.orig', '.rej', '.swp', '.old', 'copy_of_',
]

export const DEFAULT_KEEP_FORMS = ['/dev/null']

export function emptyBook() {
  return { version: 1, keep: [], raft: [], roots: [], noDefaults: false }
}

function fail(message) {
  throw new Error(message)
}

function strList(raw, field) {
  if (raw == null) return null
  if (!Array.isArray(raw)) fail(`${field} 必须是字符串数组`)
  for (const w of raw) {
    if (typeof w !== 'string' || w.length === 0) fail(`${field} 必须是非空字符串数组`)
  }
  return [...new Set(raw)]
}

/** 校验并装配筏册：未知字段忽略，字段类型错则抛 Error。 */
export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    fail(`筏册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('筏册必须是 JSON 对象')
  const book = emptyBook()
  const keep = strList(raw.keep, 'keep')
  const raft = strList(raw.raft, 'raft')
  const roots = strList(raw.roots, 'roots')
  if (keep) book.keep = keep
  if (raft) book.raft = raft
  if (roots) book.roots = roots
  if (raw.noDefaults != null) {
    if (typeof raw.noDefaults !== 'boolean') fail('noDefaults 必须是布尔值')
    book.noDefaults = raw.noDefaults
  }
  return book
}

export function serializeBook(book) {
  return (
    JSON.stringify(
      {
        version: 1,
        keep: book?.keep ?? [],
        raft: book?.raft ?? [],
        roots: book?.roots ?? [],
        noDefaults: book?.noDefaults ?? false,
      },
      null,
      2,
    ) + '\n'
  )
}

export function bookCount(book) {
  return (book?.keep ?? []).length + (book?.raft ?? []).length + (book?.roots ?? []).length
}

/** 审计方口径合并：CLI 旗标并集/覆盖册值（旗标 > 册 > 默认）。 */
export function overrideBook(book, overrides = {}) {
  const next = { ...(book ?? emptyBook()) }
  const merged = (field, v) => {
    if (v == null) return
    if (!Array.isArray(v)) throw new Error(`${field} 必须是逗号分隔的非空字符串`)
    for (const w of v) {
      if (typeof w !== 'string' || w.length === 0) throw new Error(`${field} 必须是非空字符串`)
    }
    next[field] = [...new Set([...(next[field] ?? []), ...v])]
  }
  merged('keep', overrides.keep)
  merged('raft', overrides.raft)
  merged('roots', overrides.roots)
  if (overrides.noDefaults === true) next.noDefaults = true
  return next
}
