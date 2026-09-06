/**
 * 契册 —— 任务方声明（items：name/path/form/fields/words/minLines），声明权全在任务方。
 * 册由 CLI 持有（register/revoke），插件只吃注入的 book 对象；无册不判（contractless）。
 */

export function emptyBook() {
  return { version: 1, items: [] }
}

/** 校验并规范一契目（docs/03 §3）：name 唯一性由 parseBook 层查，此处查形。 */
export function parseItem(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('契目必须是 JSON 对象')
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) throw new Error('契目 name 必须是非空字符串')
  if (typeof raw.path !== 'string' || raw.path.length === 0) throw new Error('契目 path 必须是非空字符串')
  const item = { name: raw.name, path: raw.path }
  const form = raw.form === undefined ? 'text' : raw.form
  if (form !== 'json' && form !== 'text') throw new Error(`契目 form 必须是 json 或 text，得：${form}`)
  item.form = form
  for (const field of ['fields', 'words']) {
    const v = raw[field]
    if (v === undefined) {
      item[field] = []
      continue
    }
    if (!Array.isArray(v) || v.some((w) => typeof w !== 'string' || w.length === 0)) {
      throw new Error(`契目 ${field} 必须是非空字符串数组`)
    }
    item[field] = [...new Set(v)]
  }
  if (raw.minLines !== undefined) {
    if (!Number.isInteger(raw.minLines) || raw.minLines < 1) throw new Error('契目 minLines 必须是正整数')
    item.minLines = raw.minLines
  }
  return item
}

export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch (error) {
    throw new Error(`契册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('契册必须是 JSON 对象')
  const itemsRaw = raw.items === undefined ? [] : raw.items
  if (!Array.isArray(itemsRaw)) throw new Error('契册 items 必须是数组')
  const items = itemsRaw.map(parseItem)
  const names = items.map((i) => i.name)
  const dup = names.find((n, i) => names.indexOf(n) !== i)
  if (dup) throw new Error(`契册 name 撞名: ${dup}`)
  return { version: 1, items }
}

export function serializeBook(book) {
  return `${JSON.stringify({ version: 1, items: book.items ?? [] }, null, 2)}\n`
}

export function bookCount(book) {
  const items = book.items ?? []
  return {
    items: items.length,
    json: items.filter((i) => i.form === 'json').length,
    text: items.filter((i) => i.form === 'text').length,
  }
}
