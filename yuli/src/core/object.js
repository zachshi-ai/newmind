/**
 * 工具族与命令串 —— 豫立的全部语义输入都来自命令串与显式词表，零 NLP。
 *
 * familyOf 逐字沿用九变/有涯的同仓惯例（跨项目夹具互认，见 docs/03 §3）。
 * 唯 exec 族受审：命令串是险形的唯一居所——写族参数里出现「rm -rf」字样是文本，
 * 不是灭失；观察族读世界，不动世界。
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

/** 命令串：递归收集 args 里全部字符串值，以空格连接（baihe 同款，不经 JSON 序列化）。 */
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
