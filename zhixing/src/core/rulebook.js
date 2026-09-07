/**
 * 凭册 —— 任务方显式声明的知行约束（docs/03 §4 锁死）。
 * 五字段：rules（凭据径显式登记）/ bans（戒词）/ musts（必行词）/ exempts（宥词）/ noDefaults。
 * 亲命直令不问知：bans/musts/exempts 登记之刻即是知入之刻，不需要章程装载记录。
 */

import { normalizePath } from './object.js'

export function emptyBook() {
  return { rules: [], bans: [], musts: [], exempts: [], noDefaults: false }
}

function strArray(value, field) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`凭册字段 ${field} 必须是字符串数组`)
  for (const v of value) {
    if (typeof v !== 'string' || v.length === 0) throw new Error(`凭册字段 ${field} 含非字符串或空串`)
  }
  return value.slice()
}

export function parseBook(text) {
  let raw
  try {
    raw = JSON.parse(String(text ?? ''))
  } catch (error) {
    throw new Error(`凭册不是合法 JSON: ${error.message}`)
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('凭册必须是 JSON 对象')
  const book = emptyBook()
  book.rules = strArray(raw.rules, 'rules').map(normalizePath)
  book.bans = strArray(raw.bans, 'bans')
  book.musts = strArray(raw.musts, 'musts')
  book.exempts = strArray(raw.exempts, 'exempts')
  if (raw.noDefaults !== undefined) {
    if (typeof raw.noDefaults !== 'boolean') throw new Error('凭册字段 noDefaults 必须是布尔')
    book.noDefaults = raw.noDefaults
  }
  return book
}

export function serializeBook(book) {
  return `${JSON.stringify(book, null, 2)}\n`
}

/** 增条（upsert 去重）：返回新册（不动原册）。 */
export function addEntry(book, field, value) {
  const next = { ...book, [field]: book[field].slice() }
  if (!next[field].includes(value)) next[field].push(value)
  return next
}
