/**
 * 事册 —— 任务方声明权（docs/03 §4）。
 *
 * items 逐事登记（id/name/aliases/terminal/abandon），order 显式立序。
 * 立什么事、怎样算完、何时可弃，只有任务方知道——事册无默认表。
 * enroll 按 id 并集去重，只增不删。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs'

/** 归一件事条目：name 缺省以 id 兼作项词与显示名；词集 = name ∪ aliases。 */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('事册条目必须是对象')
  const id = String(raw.id ?? '').trim()
  if (!id) throw new Error('事册条目缺少 id')
  const name = String(raw.name ?? '').trim() || id
  const aliases = (Array.isArray(raw.aliases) ? raw.aliases : []).map((s) => String(s).trim()).filter((s) => s.length > 0)
  const terminal = (Array.isArray(raw.terminal) ? raw.terminal : []).map((s) => String(s).trim()).filter((s) => s.length > 0)
  const abandon = (Array.isArray(raw.abandon) ? raw.abandon : []).map((s) => String(s).trim()).filter((s) => s.length > 0)
  const words = [name, ...aliases]
  return { id, name, aliases, terminal, abandon, words }
}

/** 构造事册：items 归一、order 原样（校验在 validate）。 */
export function createRegister(opts = {}) {
  const items = (opts.items ?? []).map(normalizeItem)
  const order = (opts.order ?? []).map((pair) => [String(pair[0]), String(pair[1])])
  return { version: 1, items, order }
}

/** 校验：id 唯一、order 引用存在。坏册抛错，由调用方转退出码 2。 */
export function validateRegister(reg) {
  const seen = new Set()
  for (const item of reg.items) {
    if (seen.has(item.id)) throw new Error(`事册重复立事：${item.id}`)
    seen.add(item.id)
  }
  for (const [a, b] of reg.order) {
    if (!seen.has(a) || !seen.has(b)) throw new Error(`先后立序引用了未立之事：${a}→${b}`)
  }
  return reg
}

/** 载入册文件（缺文件 → 空册；坏 JSON → 抛错由调用方转退出码 2）。 */
export function loadRegister(path) {
  if (!path || !existsSync(path)) return createRegister()
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  return validateRegister(
    createRegister({ items: Array.isArray(parsed.items) ? parsed.items : [], order: Array.isArray(parsed.order) ? parsed.order : [] }),
  )
}

/** 合并事册：items 按 id 并集去重（既有 id 原样保留——只增不删），order 沿用册文件。 */
export function mergeRegister(file, additions) {
  const byId = new Map(file.items.map((it) => [it.id, it]))
  const merged = [...file.items]
  for (const raw of additions.items ?? []) {
    const item = normalizeItem(raw)
    if (!byId.has(item.id)) {
      byId.set(item.id, item)
      merged.push(item)
    }
  }
  return { version: 1, items: merged, order: file.order ?? [] }
}

/** enroll：读既有册、按 id 并集去重后写回（只增不删；CLI 不改 order）。 */
export function enrollRegister(path, additions) {
  const existing = loadRegister(path)
  const merged = mergeRegister(existing, createRegister({ items: additions.items ?? [] }))
  const plain = {
    version: 1,
    items: merged.items.map(({ id, name, aliases, terminal, abandon }) => ({ id, name, aliases, terminal, abandon })),
    order: merged.order,
  }
  writeFileSync(path, `${JSON.stringify(plain, null, 2)}\n`)
  return plain
}
