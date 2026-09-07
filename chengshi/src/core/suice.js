/**
 * 遂册 —— 再施授权的持久化（docs/03 §4，声明权全在任务方）。
 *
 * { "version": 1, "allow": ["curl -d*hooks.example/beat*"] }
 * 允列是授权，空册 = 全账；册缺失自动建册；唯一入口是 CLI allow/disallow。
 */

export function emptyBook() {
  return { version: 1, allow: [] }
}

export function parseBook(text) {
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('遂册必须是 JSON 对象')
  if (raw.version !== 1) throw new Error(`遂册版本不支持: ${raw.version}`)
  const allow = raw.allow ?? []
  if (!Array.isArray(allow) || allow.some((g) => typeof g !== 'string')) {
    throw new Error('遂册 allow 必须是字符串数组')
  }
  return { version: 1, allow }
}

export function serializeBook(book) {
  return `${JSON.stringify({ version: 1, allow: book.allow }, null, 2)}\n`
}

/** 立允：重复去重。返回 { added }。 */
export function allowKey(book, glob) {
  if (book.allow.includes(glob)) return { added: false }
  book.allow.push(glob)
  return { added: true }
}

/** 销允：无此键返回 null（调用方报错）。 */
export function disallowKey(book, glob) {
  const idx = book.allow.indexOf(glob)
  if (idx === -1) return null
  book.allow.splice(idx, 1)
  return book
}

export function bookCount(book) {
  return { allow: book.allow.length }
}
