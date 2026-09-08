/**
 * 诏册 —— 免案之册的持久化（docs/03 §8 锁死）。
 *
 * 册形：{ "version": 1, "excuse": ["docs/reports/*"], "words": ["增补引形"], "noDefaults": false }
 * 声明权全在任务方：免案是「本任务授权之径」的明言；无册照判（凡托皆记）；
 * register/revoke 归 CLI，插件只吃注入的 book 对象。
 */

export function emptyBook() {
  return { version: 1, excuse: [], words: [], noDefaults: false }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('诏册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('诏册须为对象')
  const book = { version: 1, excuse: [], words: [], noDefaults: false }
  if (Array.isArray(v.excuse)) book.excuse = v.excuse.map((g) => String(g))
  if (Array.isArray(v.words)) book.words = v.words.map((w) => String(w))
  if (v.noDefaults === true) book.noDefaults = true
  return book
}

/** 立免案（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('免案径不得为空')
  if (!book.excuse.includes(g)) book.excuse.push(g)
  return book
}

/** 撤免案：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.excuse.indexOf(g)
  if (idx === -1) throw new Error(`诏册无此免案径: ${g}`)
  book.excuse.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.excuse ?? []).length
}

/** 宽 glob 命中：词元含 * 时按通配全匹配（* 跨目录），否则规整逐字相等（同全仓既例）。 */
export function globMatch(path, pattern) {
  const p = String(pattern ?? '')
  if (!p.includes('*')) return path === p
  const re = new RegExp(
    p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*') + '$'
  )
  return re.test(path)
}
