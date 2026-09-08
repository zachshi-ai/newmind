/**
 * 锁册 —— 免拆之册的持久化（docs/03 §5 锁死）。
 *
 * 册形：{ "version": 1, "excuse": ["local-dev/*"] }
 * 声明权全在任务方：免拆是「本任务授权拆锁之径」的明言；无册照判（校场照豁）；
 * register/revoke 归 CLI，插件只吃注入的 book 对象。
 */

export function emptyBook() {
  return { version: 1, excuse: [] }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('锁册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('锁册须为对象')
  const book = { version: 1, excuse: [] }
  if (Array.isArray(v.excuse)) book.excuse = v.excuse.map((g) => String(g))
  return book
}

/** 立免拆（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('免拆径不得为空')
  if (!book.excuse.includes(g)) book.excuse.push(g)
  return book
}

/** 撤免拆：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.excuse.indexOf(g)
  if (idx === -1) throw new Error(`锁册无此免拆径: ${g}`)
  book.excuse.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.excuse ?? []).length
}
