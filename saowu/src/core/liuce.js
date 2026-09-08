/**
 * 留册 —— 许留之册的持久化（docs/03 §5 锁死）。
 *
 * 册形：{ "version": 1, "retain": ["scripts/*"], "forms": [], "noDefaults": false }
 * 声明权全在任务方：retain 是「此处之留是正当输出」的明言；无册 = 全扫
 * （正当之留必须明言，CLI 的输出界面是不是正当任务方说了算）；register/revoke
 * 归 CLI，插件只吃注入的 book 对象。
 */

export function emptyBook() {
  return { version: 1, retain: [], forms: [], noDefaults: false }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('留册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('留册须为对象')
  const book = { version: 1, retain: [], forms: [], noDefaults: false }
  if (Array.isArray(v.retain)) book.retain = v.retain.map((g) => String(g))
  if (Array.isArray(v.forms)) book.forms = v.forms.map((s) => String(s))
  if (v.noDefaults === true) book.noDefaults = true
  return book
}

/** 立许留（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('许留径不得为空')
  if (!book.retain.includes(g)) book.retain.push(g)
  return book
}

/** 撤许留：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.retain.indexOf(g)
  if (idx === -1) throw new Error(`留册无此许留径: ${g}`)
  book.retain.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.retain ?? []).length
}
