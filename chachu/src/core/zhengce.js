/**
 * 证册 —— 免审与基径之册的持久化（docs/03 §9 锁死）。
 *
 * 册形：{ "version": 1, "excuse": ["docs/reports/样板*"], "grounds": ["src/config.js"] }
 * 声明权全在任务方：免审是「本任务授权之稿」的明言，基径是「此物不必再看」的明言；
 * 无册照判（凡言必据）。register/revoke 归 CLI（管 excuse），grounds 直改册文件；
 * 插件只吃注入的 book 对象。v1 只豁免与基径，不扩形（词表内置固定）。
 */

export function emptyBook() {
  return { version: 1, excuse: [], grounds: [] }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('证册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('证册须为对象')
  const book = { version: 1, excuse: [], grounds: [] }
  if (Array.isArray(v.excuse)) book.excuse = v.excuse.map((g) => String(g))
  if (Array.isArray(v.grounds)) book.grounds = v.grounds.map((g) => String(g))
  return book
}

/** 立免审（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('免审径不得为空')
  if (!book.excuse.includes(g)) book.excuse.push(g)
  return book
}

/** 撤免审：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.excuse.indexOf(g)
  if (idx === -1) throw new Error(`证册无此免审径: ${g}`)
  book.excuse.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.excuse ?? []).length
}

/** 宽 glob 命中：词元含星号时按通配全匹配（跨目录），否则规整逐字相等（同全仓既例）。 */
export function globMatch(path, pattern) {
  const p = String(pattern ?? '')
  if (!p.includes('*')) return path === p
  const re = new RegExp(
    p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*') + '$'
  )
  return re.test(path)
}
