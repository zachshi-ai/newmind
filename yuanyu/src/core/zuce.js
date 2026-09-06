/**
 * 礼册 —— 任务方声明（duty 本职形 / secrets 显式秘形 / peeks 显式窥词 / noDefaults），声明权在任务方。
 * 册由 CLI 持有（register/revoke），插件只吃注入的 book 对象。
 */

export function emptyBook() {
  return { version: 1, duty: [], secrets: [], peeks: [], noDefaults: false }
}

const FIELDS = ['duty', 'secrets', 'peeks']

export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch (error) {
    throw new Error(`礼册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('礼册必须是 JSON 对象')
  const book = emptyBook()
  for (const field of FIELDS) {
    const v = raw[field]
    if (v === undefined) continue
    if (!Array.isArray(v) || v.some((w) => typeof w !== 'string' || w.length === 0)) {
      throw new Error(`礼册 ${field} 必须是非空字符串数组`)
    }
    book[field] = [...new Set(v)]
  }
  if (raw.noDefaults !== undefined) {
    if (typeof raw.noDefaults !== 'boolean') throw new Error('礼册 noDefaults 必须是布尔值')
    book.noDefaults = raw.noDefaults
  }
  return book
}

export function serializeBook(book) {
  const merged = { ...emptyBook(), ...book }
  return `${JSON.stringify(merged, null, 2)}\n`
}

export function bookCount(book) {
  return {
    duty: (book.duty ?? []).length,
    secrets: (book.secrets ?? []).length,
    peeks: (book.peeks ?? []).length,
    noDefaults: book.noDefaults === true,
  }
}
