/**
 * 命籍 —— 任务方纳籍与增形授权（admit ∪ extra：声明权全在任务方，docs/03 §4 锁死）。
 * 册由 CLI 持有（register/revoke），插件只吃注入的 book 对象；
 * 无册 = 全账——籍面是仓库公共命脉（名山大泽不以封），授权只能来自册。
 */

export function emptyBook() {
  return { version: 1, admit: [], extra: [] }
}

/** 校验并规范命籍：admit/extra 必须是非空字符串数组（去重保序）。 */
export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch (error) {
    throw new Error(`命籍不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('命籍必须是 JSON 对象')
  const listOf = (v, what) => {
    if (v === undefined) return []
    if (!Array.isArray(v) || v.some((g) => typeof g !== 'string' || g.length === 0)) {
      throw new Error(`命籍 ${what} 必须是非空字符串数组`)
    }
    return [...new Set(v)]
  }
  return { version: 1, admit: listOf(raw.admit, 'admit'), extra: listOf(raw.extra, 'extra') }
}

export function serializeBook(book) {
  return `${JSON.stringify({ version: 1, admit: book.admit ?? [], extra: book.extra ?? [] }, null, 2)}\n`
}

/** 立纳籍 / 增形：重复去重。列名 admit | extra。返回 { book, added }。 */
export function registerEntry(book, column, value) {
  const v = String(value ?? '').trim()
  if (!v) throw new Error(`${column === 'admit' ? '纳籍径' : '增形名'}必须是非空字符串`)
  if (book[column].includes(v)) return { book, added: false }
  book[column].push(v)
  return { book, added: true }
}

/** 销纳籍 / 增形：先按同串、再按去尾斜杠同串找（extra 不做斜杠变体）。找不到返回 null。 */
export function revokeEntry(book, column, value) {
  const v = String(value ?? '').trim()
  const list = book[column]
  let idx = list.indexOf(v)
  if (idx === -1 && column === 'admit') {
    idx = list.findIndex((x) => x.replace(/\/+$/, '') === v.replace(/\/+$/, ''))
  }
  if (idx === -1) return null
  list.splice(idx, 1)
  return book
}

export function bookCount(book) {
  return { admit: (book.admit ?? []).length, extra: (book.extra ?? []).length }
}
