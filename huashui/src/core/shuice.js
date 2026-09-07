/**
 * 水册 —— 许复之册的持久化（docs/03 §4 锁死）。
 *
 * 册形：{ "version": 1, "excuse": ["legacy/*"] }
 * 声明权全在任务方：许复是「本任务授权凭旧底重写之径」的明言；无册 = 全账
 * （落笔之鲜是仓库公共事实，豁免只能来自册）；register/revoke 归 CLI，
 * 插件只吃注入的 book 对象。
 */

export function emptyBook() {
  return { version: 1, excuse: [] }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('水册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('水册须为对象')
  const book = { version: 1, excuse: [] }
  if (Array.isArray(v.excuse)) book.excuse = v.excuse.map((g) => String(g))
  return book
}

/** 立许复（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('许复径不得为空')
  if (!book.excuse.includes(g)) book.excuse.push(g)
  return book
}

/** 撤许复：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.excuse.indexOf(g)
  if (idx === -1) throw new Error(`水册无此许复径: ${g}`)
  book.excuse.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.excuse ?? []).length
}
