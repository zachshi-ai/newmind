/**
 * 对象键与工具族 —— 审曲的全部语义输入都来自显式字段，零 NLP（与 jiubian/dingfen/mingshi/xiangxiao/zhizu 同规）。
 *
 * 对象键（按序取第一个命中）：
 *   args.path / args.file_path / args.notebook_path（字符串）→ p:<值>   文件对象
 *   args.command（字符串）                                    → c:<trim> 命令对象
 *   其余                                                      → n:<工具名> 不透明对象
 *
 * 读据成色只判 p: 对象；c: 是黑盒（命令式读取的输出残否与寻径都不可得，宁可放过，不可错罚）。
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

/** 径规整：反斜杠归正斜杠、循环剥 `./` 前缀、剥尾 `/`（同 mingshi/jiyi/zhizu 的规整语义，防同文件异写之诬）。 */
export function normalizePath(p) {
  let s = String(p ?? '').replace(/\\/g, '/')
  while (s.startsWith('./')) s = s.slice(2)
  while (s.length > 1 && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

/** 行数：真实换行切分；末尾以换行结束时不计为额外一行（编辑器的常识行数）。 */
export function countLines(text) {
  const parts = String(text).split(/\r?\n/)
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop()
  return parts.length
}
