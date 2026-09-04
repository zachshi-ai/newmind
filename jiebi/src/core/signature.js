/**
 * 签名归一化 —— 对比审计的原子。
 *
 * 与 zhizhi 的精确指纹不同：jiebi 把一次调用归一化到"探查的对象"。
 * 「每次换个参数磨同一扇门」在 zhizhi 的精确指纹下是合法的新调用，
 * 在归一化签名下现形 —— 这是两层治理的互补边界（docs/03-design.md）。
 *
 * 规则（确定性，可单测）：
 *   command/cmd/script → 首词；首词 ∈ KNOWN 且有次词 → 取前两词
 *   path/file/file_path/target → 该值（trim）
 *   query/q/pattern → 该值（trim）
 *   其余 → args 按键排序 JSON 化，截断 64 字符
 *   signature = `${name}:${target}`（无 args → `${name}`）
 */

const COMMAND_KEY = ['command', 'cmd', 'script']
const PATH_KEY = ['path', 'file', 'file_path', 'target']
const QUERY_KEY = ['query', 'q', 'pattern']

const KNOWN_MULTIWORD = new Set(['npm', 'pnpm', 'yarn', 'bun', 'git', 'cargo', 'go', 'make'])

/** 按键排序的稳定 JSON 化（对象键序不影响签名）。 */
export function stableJson(value, cap = 64) {
  const encode = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
    if (Array.isArray(v)) return `[${v.map(encode).join(',')}]`
    const keys = Object.keys(v).sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${encode(v[k])}`).join(',')}}`
  }
  const text = encode(value) ?? '{}'
  return text.length > cap ? `${text.slice(0, cap - 1)}…` : text
}

function firstString(args, keys) {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function commandTarget(command) {
  const tokens = command.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  if (tokens.length > 1 && KNOWN_MULTIWORD.has(tokens[0])) {
    return `${tokens[0]} ${tokens[1]}`
  }
  return tokens[0]
}

/**
 * 归一化签名。args 允许为 null/undefined/任意值 —— 永不抛错。
 * 目标统一截断到 64 字符（command/path/query 与 JSON 兜底同规）。
 */
export function signatureOf(name, args) {
  let target = ''
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const command = firstString(args, COMMAND_KEY)
    if (command !== null) target = commandTarget(command)
    else target = firstString(args, PATH_KEY) ?? firstString(args, QUERY_KEY) ?? stableJson(args)
  } else if (args != null) {
    target = stableJson(args)
  }
  if (target.length > 64) target = `${target.slice(0, 63)}…`
  return target ? `${name}:${target}` : `${name}`
}
