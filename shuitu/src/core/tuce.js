/**
 * 土册（.shuitu.json）——境变豁免之册（docs/03 §3）。
 *
 * 声明权在任务方：install/config/reside 三列豁免词（子串，大小写敏感）——
 * 命中案 key 即完全出账（注记）。CLI 旗标是审计方口径（旗标 > 册，并集）。
 * 无册照判：默认形表 41 形开箱在岗。坏册报错（CLI 转 exit 2）。
 * v1 无扩形：册只做豁免声明，不做形表扩充（docs/03 §3/§12 的诚实边界）。
 */

export function emptyBook() {
  return { version: 1, install: [], config: [], reside: [] }
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

/** 校验并装配土册：未知字段忽略，字段类型错则抛 Error。 */
export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    fail(`土册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('土册必须是 JSON 对象')
  const book = emptyBook()
  const install = strList(raw.install, 'install')
  const config = strList(raw.config, 'config')
  const reside = strList(raw.reside, 'reside')
  if (install) book.install = install
  if (config) book.config = config
  if (reside) book.reside = reside
  return book
}

export function serializeBook(book) {
  return (
    JSON.stringify(
      {
        version: 1,
        install: book?.install ?? [],
        config: book?.config ?? [],
        reside: book?.reside ?? [],
      },
      null,
      2,
    ) + '\n'
  )
}

export function bookCount(book) {
  return (book?.install ?? []).length + (book?.config ?? []).length + (book?.reside ?? []).length
}

/** 审计方口径合并：CLI 旗标并集覆盖册值（旗标 > 册）。 */
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
  merged('install', overrides.install)
  merged('config', overrides.config)
  merged('reside', overrides.reside)
  return next
}
