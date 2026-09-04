/**
 * 对象键与工具族 —— 有涯的全部语义输入都来自显式字段，零 NLP。
 *
 * 对象键与 familyOf 沿用九变的同仓惯例（跨项目夹具互认，见 docs/03 §2）。
 * 有涯在 observe 族内再分一刀（docs/03 §2）：
 *   装载类（内容身份 = 路径）：read / cat / view（精确）——两次装载间路径未变 ⇒ 第二次零新信息；
 *   检索类（内容身份 ≠ 路径）：其余 observe（grep/glob/ls/search/list/find…）——
 *   所问在参数，同路径异参数是合法的再问；检索类永不入复见账，也不设装载基线。
 */

export function objectKey(args, name) {
  const a = args && typeof args === 'object' ? args : {}
  for (const field of ['path', 'file_path', 'notebook_path']) {
    if (typeof a[field] === 'string' && a[field].length > 0) return `p:${a[field]}`
  }
  if (typeof a.command === 'string' && a.command.trim().length > 0) return `c:${a.command.trim()}`
  return `n:${name}`
}

const OBSERVE_EXACT = new Set(['read', 'glob', 'grep', 'ls', 'cat', 'view'])
const OBSERVE_SUB = ['read', 'grep', 'glob', 'list', 'search']
const EXEC_EXACT = new Set(['bash', 'exec', 'run', 'shell', 'command'])
const EXEC_SUB = ['bash', 'exec', 'run', 'shell', 'command']
const WRITE_EXACT = new Set(['write', 'edit', 'apply', 'create', 'move', 'remove'])
const WRITE_SUB = ['write', 'edit', 'patch', 'insert', 'create']

const LOAD_EXACT = new Set(['read', 'cat', 'view'])

function matchFamily(name, exact, subs) {
  if (exact.has(name)) return true
  return subs.some((s) => name.includes(s))
}

/** 工具族：观察 / 写 / 执行 / 其他。 */
export function familyOf(name) {
  const n = String(name ?? '').toLowerCase()
  if (matchFamily(n, OBSERVE_EXACT, OBSERVE_SUB)) return 'observe'
  if (matchFamily(n, WRITE_EXACT, WRITE_SUB)) return 'write'
  if (matchFamily(n, EXEC_EXACT, EXEC_SUB)) return 'exec'
  return 'other'
}

/**
 * 观察类调用再分装载/检索：返回 'load'（装载，可作复见基线）｜'search'（检索，永不入罪）
 * ｜null（非观察族）。
 */
export function observeClass(name) {
  if (familyOf(name) !== 'observe') return null
  return LOAD_EXACT.has(String(name ?? '').toLowerCase()) ? 'load' : 'search'
}
