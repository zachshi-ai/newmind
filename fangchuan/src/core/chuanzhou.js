/**
 * 川册 —— 任务方纵列授权（indulge：glob 串数组），声明权全在任务方（docs/03 §4 锁死）。
 * 册由 CLI 持有（register/revoke），插件只吃注入的 book 对象；
 * 无册 = 全扫——湮形是仓库的公共卫生，不需要每单任务重新声明，册只管纵列一侧。
 */

export function emptyBook() {
  return { version: 1, indulge: [] }
}

/** 校验并规范川册：indulge 必须是非空字符串数组（去重保序）。 */
export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch (error) {
    throw new Error(`川册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('川册必须是 JSON 对象')
  const indulgeRaw = raw.indulge === undefined ? [] : raw.indulge
  if (!Array.isArray(indulgeRaw) || indulgeRaw.some((g) => typeof g !== 'string' || g.length === 0)) {
    throw new Error('川册 indulge 必须是非空字符串数组')
  }
  return { version: 1, indulge: [...new Set(indulgeRaw)] }
}

export function serializeBook(book) {
  return `${JSON.stringify({ version: 1, indulge: book.indulge ?? [] }, null, 2)}\n`
}

/** 立纵：重复去重。返回 { book, added }。 */
export function registerPath(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('纵列径必须是非空字符串')
  if (book.indulge.includes(g)) return { book, added: false }
  book.indulge.push(g)
  return { book, added: true }
}

/** 销纵：先按同串、再按去尾斜杠同串找。找不到返回 null（CLI 报 exit 2）。 */
export function revokePath(book, glob) {
  const g = String(glob ?? '').trim()
  let idx = book.indulge.indexOf(g)
  if (idx === -1) {
    idx = book.indulge.findIndex((x) => x.replace(/\/+$/, '') === g.replace(/\/+$/, ''))
  }
  if (idx === -1) return null
  book.indulge.splice(idx, 1)
  return book
}

export function bookCount(book) {
  return { indulge: (book.indulge ?? []).length }
}
