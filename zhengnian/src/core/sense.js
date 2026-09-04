/**
 * 感知层 —— 写检测、主路径提取、愿界判定、锚点相关性。纯函数，确定性。
 *
 * 设计约束：
 *   - 零语义判断：不读命令的"意思"，只做子串 / 前缀 / 正则的确定性匹配；
 *   - 宁漏勿错：路径提取失败不罚（返回 null，由上层计入 unparsedWrites），
 *     fail 方向与安全一致（漏一次攀缘，好过冤枉一次合法动作）；
 *   - 愿界以相对路径书写；绝对路径视为界外（除非根同为绝对）。
 */

import { WRITE_TOOLS, SHELL_TOOLS } from './contract.js'

const stripQuotes = (s) => s.replace(/^["']|["']$/g, '')

/** 路径归一化：剥 ./、并连续斜杠。保留绝对路径形态。 */
export function normalizePath(p) {
  return String(p).trim().replace(/^\.\//, '').replace(/\/{2,}/g, '/')
}

/** 前缀匹配：path 是否落在 root 之内。 */
export function underRoot(path, root) {
  const p = normalizePath(path)
  let r = normalizePath(root)
  if (!r.endsWith('/')) r += '/'
  return p.startsWith(r)
}

/** 结构化工具的主路径键（按序取第一个存在的）。 */
const PATH_KEYS = ['path', 'file_path', 'file', 'target', 'filename']

function commandOf(call) {
  const a = call?.args
  if (typeof a === 'string') return a
  if (a && typeof a === 'object') {
    for (const k of ['command', 'cmd', 'script']) {
      if (typeof a[k] === 'string') return a[k]
    }
  }
  return null
}

/**
 * 引号屏蔽：把 "…" / '…' 内部字符替换为等长空格（保留引号本身）。
 * 变更检测与路径提取都在屏蔽后的命令上做——引号内的 `>` 不是重定向。
 */
function maskQuoted(cmd) {
  let out = ''
  let quote = null
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null
      out += ' '
    } else {
      if (ch === '"' || ch === "'") quote = ch
      out += ch
    }
  }
  return out
}

/**
 * shell 变更命令里变更模式的判定（同一组模式决定"是不是写"，提取器决定"写在哪"）。
 */
const MUTATING = {
  redirect: /(?:^|[\s;|&(])>{1,2}\s*\S/,
  word: /(?:^|[\s;|&])(tee|dd|cp|mv|rm|chmod|chown|ln|mkdir|touch|truncate)\s/,
  sedInPlace: /(?:^|[\s;|&])sed\s+(?:-{1,2}[^\s]+\s+)*-i[a-zA-Z]*/,
  gitMutation: /(?:^|[\s;|&])git\s+(?:add|commit|restore|clean|reset|checkout)\b/,
}

/** 是否写类动作（结构化写工具，或 shell 命中变更模式）。 */
export function isWriteCall(call) {
  const name = String(call?.name ?? '').toLowerCase()
  if (WRITE_TOOLS.includes(name)) return true
  if (!SHELL_TOOLS.includes(name)) return false
  const cmd = commandOf(call)
  if (!cmd) return false
  const masked = maskQuoted(cmd)
  return !!(MUTATING.redirect.test(masked) || MUTATING.word.test(masked) ||
            MUTATING.sedInPlace.test(masked) || MUTATING.gitMutation.test(masked))
}

/**
 * 主路径提取（任意工具）。结构化 args 按 PATH_KEYS 取首个；
 * shell 在引号屏蔽后的命令上按变更形态提取；引号包住的路径视为提取失败。
 * 提取不出 → null（宁漏勿错，上层计入 unparsedWrites）。
 */
export function primaryPathOf(call) {
  const a = call?.args
  if (a && typeof a === 'object') {
    for (const k of PATH_KEYS) {
      const v = a[k]
      if (typeof v === 'string' && v.trim()) return normalizePath(v)
    }
  }
  const name = String(call?.name ?? '').toLowerCase()
  if (!SHELL_TOOLS.includes(name)) return null
  const cmd = commandOf(call)
  if (!cmd) return null
  const masked = maskQuoted(cmd)
  const token = '([^\\s;|&"\']+|"[^"]*"|\'[^\']*\')'

  // 1. 重定向目标（避开 2>&1：要求 > 前是空白/分隔符）
  let m = masked.match(new RegExp(`(?:^|[\\s;|&(])>{1,2}\\s*${token}`))
  // 2. tee 目标
  if (!m) m = masked.match(new RegExp(`(?:^|[\\s;|&(])tee\\s+(?:-[^\\s]+\\s+)*${token}`))
  // 3. cp/mv：目的是最后一个非选项参数（写的是目的地）
  if (!m) m = masked.match(/(?:^|[\s;|&])(?:mv|cp)\s+(?:-{1,2}[^\s]+\s+)*(?:--\s+)?([^\s;|&"']+)\s+([^\s;|&"']+)/)
  // 4. sed -i：文件是行尾最后一个 token
  if (!m && MUTATING.sedInPlace.test(masked)) m = masked.match(/([^\s;|&"']+)\s*$/)
  // 5. 单目标变更器：跳过选项后的第一个参数
  if (!m) m = masked.match(new RegExp(`(?:^|[\\s;|&])(?:rm|chmod|chown|ln|mkdir|touch|truncate|dd)\\s+(?:-{1,2}[^\\s]+\\s+)*(?:--\\s+)?${token}`))
  if (!m) return null // 含 git 变更等无单一主路径的形态

  const raw = (m[3] ?? m[2] ?? m[1] ?? '').replace(/^["']|["']$/g, '')
  if (!raw || /[ "']/.test(raw)) return null
  return normalizePath(raw)
}

/** 愿界判定：allowRoots 为 null（allowAll）→ 无界，一律视为界内。 */
export function inScope(path, allowRoots) {
  if (allowRoots === null) return true
  if (!path) return true // 提取不出路径的写动作不在范围度量的射程内（unparsed 计数）
  return allowRoots.some((root) => underRoot(path, root))
}

/**
 * 锚点相关性：动作里还有没有本愿的痕迹（念的判据——于曾习境）。
 *   1. 任一 keyword（大小写不敏感）是 name+args 序列化的子串；
 *   2. 主路径落在 anchors.paths 之内；
 *   3. 写类动作且主路径落在 scope.allowRoots 之内（allowAll 时本条不适用）。
 */
export function isRelevant(call, contract) {
  const keywords = contract?.anchors?.keywords ?? []
  const hay = (String(call?.name ?? '') + ' ' +
    (typeof call?.args === 'string' ? call.args : JSON.stringify(call?.args ?? {})))
    .toLowerCase()
  if (keywords.some((kw) => hay.includes(String(kw).toLowerCase()))) return true

  const p = primaryPathOf(call)
  const anchorPaths = Array.isArray(contract?.anchors?.paths) ? contract.anchors.paths : []
  if (p && anchorPaths.some((root) => underRoot(p, root))) return true

  if (isWriteCall(call)) {
    const roots = Array.isArray(contract?.scope?.allowRoots) ? contract.scope.allowRoots : null
    if (roots && p && inScope(p, roots)) return true
  }
  return false
}
