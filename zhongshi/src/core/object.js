/**
 * 工具族、作工面与文本串 —— 终始的全部语义输入都来自调用参数与显式事册，零 NLP。
 *
 * familyOf 逐字沿用有涯/九变的同仓惯例（跨项目夹具互认，见 docs/03 §3）。
 * 作工面 = 观察 ∪ 写 ∪ 执行：读一个路径含项词的文件是开工之迹（查即始），
 * 写是施工，exec 是运斤——三族全记。
 * todo 族显式排除：todo 工具的参数里天然全是项词，若计作工则立册即全始、
 * 幽项永不可判——这是本层对同仓表的唯一收窄（只收本层审计面，不改共享表）。
 */

const OBSERVE_EXACT = new Set(['read', 'glob', 'grep', 'ls', 'cat', 'view'])
const OBSERVE_SUB = ['read', 'grep', 'glob', 'list', 'search']
const WRITE_EXACT = new Set(['write', 'edit', 'apply', 'create', 'move', 'remove'])
const WRITE_SUB = ['write', 'edit', 'patch', 'insert', 'create']
const EXEC_EXACT = new Set(['bash', 'exec', 'run', 'shell', 'command'])
const EXEC_SUB = ['bash', 'exec', 'run', 'shell', 'command']

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

/** todo 族：名（小写）精确命中者，本层按 other 处理。 */
const TODO_EXACT = new Set(['todo_write', 'todowrite', 'todo'])

/** 本层的作工族：todo 族收窄为 other，其余同 familyOf。 */
export function workFamilyOf(name) {
  const n = String(name ?? '').toLowerCase()
  if (TODO_EXACT.has(n)) return 'other'
  return familyOf(n)
}

/** 文本串：递归收集 args 里全部字符串值，以空格连接（捭阖同款，不经 JSON 序列化）。 */
export function argsText(args) {
  const parts = []
  const walk = (v) => {
    if (typeof v === 'string') parts.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(args)
  return parts.join(' ')
}
