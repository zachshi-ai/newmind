/**
 * 对象键与工具族 —— 稽疑的全部语义输入都来自显式字段，零 NLP（与 mingshi/jiubian/dingfen 同规）。
 *
 * 对象键（按序取第一个命中）：
 *   args.path / args.file_path / args.notebook_path（字符串）→ p:<值>   文件对象
 *   args.command（字符串）                                    → c:<trim> 命令对象
 *   其余                                                      → n:<工具名> 不透明对象
 *
 * 工具族（小写匹配，exact 集合 ∪ 子串包含）：observe（问之载体）/ write（触发域之一）/
 * exec（触发域之一，命令文本可作问凭据的命令通道）/ other。
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
