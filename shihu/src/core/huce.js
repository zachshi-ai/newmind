/**
 * 状册 —— 豁免之册的持久化（docs/03 §6 锁死）。
 *
 * 册形：{ "version": 1, "exempt": ["archive/*"], "shapes": ["STATUS.md"], "noDefaults": false }
 * 声明权全在任务方：exempt 是「本任务授权免对账之径」的明言；无册 = 全账
 * （交接语境的陈报是公共事实，豁免只能来自册）；register/revoke 归 CLI，
 * 插件只吃注入的 book 对象。
 */

export function emptyBook() {
  return { version: 1, exempt: [], shapes: [], noDefaults: false }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('状册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('状册须为对象')
  const book = { version: 1, exempt: [], shapes: [], noDefaults: false }
  if (Array.isArray(v.exempt)) book.exempt = v.exempt.map((g) => String(g))
  if (Array.isArray(v.shapes)) book.shapes = v.shapes.map((s) => String(s))
  if (v.noDefaults === true) book.noDefaults = true
  return book
}

/** 立豁免（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('豁免径不得为空')
  if (!book.exempt.includes(g)) book.exempt.push(g)
  return book
}

/** 撤豁免：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.exempt.indexOf(g)
  if (idx === -1) throw new Error(`状册无此豁免径: ${g}`)
  book.exempt.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.exempt ?? []).length
}
