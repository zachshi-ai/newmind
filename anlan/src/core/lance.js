/**
 * 澜册 —— 豁对象之册的持久化（docs/03 §8 锁死）。
 *
 * 册形：{ "version": 1, "spare": ["auth"], "forms": ["mvn verify"], "noDefaults": false }
 * 声明权全在任务方：spare 豁对象是「此对象波动已知、勿审」的明言（flaky 之名的正式
 * 归宿——环境之波是系统之责）；无册照判（凡荡必审——波动之验不挑对象，豁免授权
 * 只能来自册）。register/revoke 归 CLI；插件只吃注入的 book 对象。
 * 诊形内置默认表：forms 增形、noDefaults 可关。本层无稿面豁免、无演武地名段（零稿面
 * ——豁免唯对象一途）。
 */

export function emptyBook() {
  return { version: 1, spare: [] }
}

export function parseBook(text) {
  let v
  try {
    v = JSON.parse(text)
  } catch {
    throw new Error('澜册不是合法 JSON')
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('澜册须为对象')
  const book = { version: 1, spare: [] }
  if (Array.isArray(v.spare)) book.spare = v.spare.map((t) => String(t))
  if (Array.isArray(v.forms)) book.forms = v.forms.map((f) => String(f))
  if (v.noDefaults === true) book.noDefaults = true
  return book
}

/** 豁对象（小写归一，重复去重，保持首见序）。 */
export function registerSpare(book, token) {
  const t = String(token ?? '').trim().toLowerCase()
  if (!t) throw new Error('豁免对象不得为空')
  if (!book.spare.includes(t)) book.spare.push(t)
  return book
}

/** 撤豁免：无此对象抛错（CLI 转 exit 2）。 */
export function revokeSpare(book, token) {
  const t = String(token ?? '').trim().toLowerCase()
  const idx = book.spare.indexOf(t)
  if (idx === -1) throw new Error(`澜册无此豁免对象: ${t}`)
  book.spare.splice(idx, 1)
  return book
}

/** 增诊形（重复去重）。 */
export function registerForm(book, form) {
  const f = String(form ?? '').trim()
  if (!f) throw new Error('诊形不得为空')
  if (!book.forms) book.forms = []
  if (!book.forms.includes(f)) book.forms.push(f)
  return book
}

/** 关默认诊形表。 */
export function setNoDefaults(book) {
  book.noDefaults = true
  return book
}

export function serializeBook(book) {
  return JSON.stringify(book, null, 2) + '\n'
}

export function bookCount(book) {
  return (book?.spare ?? []).length + (book?.forms ?? []).length
}
