/**
 * 痊册 —— 免审之册的持久化（docs/03 §8 锁死）。
 *
 * 册形：{ "version": 1, "allow": ["docs/internal/*"], "forms": ["mvn verify"], "noDefaults": false }
 * 声明权全在任务方：allow 免审是「此径内文书之愈言皆有名分」的明言；无册照判
 * （凡愈必痊——痊愈之验不挑文件，豁免授权只能来自册）。register/revoke 归 CLI；
 * 插件只吃注入的 book 对象。v1 allow 只豁免；forms 增检形；noDefaults 关默认检形表；
 * 愈形/否定卫内置固定，不扩形（弱形宁纵不收）。
 */

export function emptyBook() {
  return { version: 1, allow: [] }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('痊册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('痊册须为对象')
  const book = { version: 1, allow: [] }
  if (Array.isArray(v.allow)) book.allow = v.allow.map((g) => String(g))
  if (Array.isArray(v.forms)) book.forms = v.forms.map((g) => String(g))
  if (v.noDefaults === true) book.noDefaults = true
  return book
}

/** 立免审（重复去重，保持首见序）。 */
export function registerEntry(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('免审径不得为空')
  if (!book.allow.includes(g)) book.allow.push(g)
  return book
}

/** 撤免审：无此径抛错（CLI 转 exit 2）。 */
export function revokeEntry(book, glob) {
  const g = String(glob ?? '').trim()
  const idx = book.allow.indexOf(g)
  if (idx === -1) throw new Error(`痊册无此免审径: ${g}`)
  book.allow.splice(idx, 1)
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.allow ?? []).length
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
