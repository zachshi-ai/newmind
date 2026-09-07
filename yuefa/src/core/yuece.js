/**
 * 约册 —— 许削之册的持久化（docs/03 §5 锁死）。
 *
 * 册形：{ "version": 1, "allow": ["legacy/*"], "forms": [], "noDefaults": false }
 * 声明权全在任务方：allow 是「本任务授权削面之径」的明言；无册 = 全账
 * （公面是仓库公共承诺，豁免只能来自册）；register/revoke 归 CLI，
 * 插件只吃注入的 book 对象。
 */

export function emptyBook() {
  return { version: 1, allow: [], forms: [], noDefaults: false }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('约册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('约册须为对象')
  const book = { version: 1, allow: [], forms: [], noDefaults: false }
  if (Array.isArray(v.allow)) book.allow = v.allow.map((g) => String(g))
  if (Array.isArray(v.forms)) book.forms = v.forms.map((s) => String(s))
  if (v.noDefaults === true) book.noDefaults = true
  return book
}

/** 立许削（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('许削径不得为空')
  if (!book.allow.includes(g)) book.allow.push(g)
  return book
}

/** 撤许削：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.allow.indexOf(g)
  if (idx === -1) throw new Error(`约册无此许削径: ${g}`)
  book.allow.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.allow ?? []).length
}
