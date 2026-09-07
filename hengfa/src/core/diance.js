/**
 * 典册 —— 任务方开门授权（open：glob 串数组），声明权全在任务方（docs/03 §3 锁死）。
 * 册由 CLI 持有（register/revoke），插件只吃注入的 book 对象；
 * 无册 = 全护——规矩是仓库的公共物，不需要每单任务重新声明，册只管开门一侧。
 */

export function emptyBook() {
  return { version: 1, open: [] }
}

/** 校验并规范典册：open 必须是非空字符串数组（去重保序）。 */
export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch (error) {
    throw new Error(`典册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('典册必须是 JSON 对象')
  const openRaw = raw.open === undefined ? [] : raw.open
  if (!Array.isArray(openRaw) || openRaw.some((g) => typeof g !== 'string' || g.length === 0)) {
    throw new Error('典册 open 必须是非空字符串数组')
  }
  return { version: 1, open: [...new Set(openRaw)] }
}

export function serializeBook(book) {
  return `${JSON.stringify({ version: 1, open: book.open ?? [] }, null, 2)}\n`
}

/** 立门：重复去重（同串与规整同串都不重立）。返回 { book, added }。 */
export function registerPath(book, glob) {
  const g = String(glob ?? '').trim()
  if (!g) throw new Error('开门径必须是非空字符串')
  if (book.open.includes(g)) return { book, added: false }
  book.open.push(g)
  return { book, added: true }
}

/** 销门：先按同串、再按规整同串找。找不到返回 null（CLI 报 exit 2）。 */
export function revokePath(book, glob) {
  const g = String(glob ?? '').trim()
  let idx = book.open.indexOf(g)
  if (idx === -1) {
    idx = book.open.findIndex((x) => x.replace(/\/+$/, '') === g.replace(/\/+$/, ''))
  }
  if (idx === -1) return null
  book.open.splice(idx, 1)
  return book
}

export function bookCount(book) {
  return { open: (book.open ?? []).length }
}
