/**
 * 指纹与路径提取 —— 知止的确定性感知层。
 *
 * 本文件所有函数都是纯函数：同样的输入永远得到同样的输出。
 * 这一层不做任何"理解"，只做稳定归一化 —— 知止的第一戒律是
 * 不装作比自己更聪明：没有语义判断，没有概率猜测，只有可测试的规则。
 */

/** FNV-1a 32 位哈希，返回 8 位十六进制。确定性指纹的基底。 */
export function fnv1a32(str) {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** 稳定 JSON 序列化：对象键递归排序，数组保持顺序。 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`
}

/**
 * 调用指纹：工具名 + 参数的确定性摘要。
 * 同名同参 = 同一指纹。止损规则以指纹为单位计数。
 */
export function callFingerprint(name, args) {
  return `${name}#${fnv1a32(stableStringify(args ?? null))}`
}

/** 截断字符串到 n 个字符，超长加省略号。 */
export function truncate(str, n) {
  const s = String(str ?? '')
  return s.length <= n ? s : s.slice(0, n) + '…'
}

/** 参数预览：用于拦截理由中向模型展示"是哪次调用被拦了"。 */
export function argPreview(args, max = 240) {
  try {
    return truncate(stableStringify(args ?? null), max)
  } catch {
    return '(unserializable args)'
  }
}

/** 命令归一化：压缩空白。`npm   test` 与 `npm test` 是同一命令。 */
export function normalizeCommand(cmd) {
  return String(cmd ?? '').trim().replace(/\s+/g, ' ')
}

/** 路径归一化：去 ./ 前缀、折叠 //、去尾部 /。大小写保留（多数文件系统大小写敏感）。 */
export function normalizePath(p) {
  let s = String(p ?? '').trim().replace(/^['"]|['"]$/g, '')
  if (s.startsWith('./')) s = s.slice(2)
  s = s.replace(/\/{2,}/g, '/')
  if (s.length > 1) s = s.replace(/\/+$/, '')
  return s
}

/**
 * readPath 是否"覆盖"writePath：
 * 相等，或 writePath 位于 readPath 目录之下（读过目录算读过其下文件——
 * 例如 `grep -rn foo src/` 覆盖 src 下的一切写入）。
 * readPath 为 '.' 视为读过当前目录树下的相对路径；'/' 覆盖一切绝对路径。
 */
export function pathIsCovered(readPath, writePath) {
  const r = normalizePath(readPath)
  const w = normalizePath(writePath)
  if (!r || !w) return false
  if (r === w) return true
  if (r === '.') return !w.startsWith('/')
  if (r === '/') return w.startsWith('/')
  return w.startsWith(r + '/')
}

// ---------------------------------------------------------------------------
// shell 命令的读写路径提取（best-effort，白名单命令 + 确定性正则）
//
// 范围声明：bash 写入路径无法被完美解析（重定向到变量、eval、xargs……）。
// 知止的立场是"宁可漏拦，不可错拦"：提取器只报告高置信度的目标，
// 漏掉的目标不会造成误拦 —— 这与"先读后写"规则的安全性方向一致。
// ---------------------------------------------------------------------------

const SHELL_SPLIT = /\s*(?:&&|\|\||[;|&])\s*/

function stripShellNoise(token) {
  return String(token ?? '').replace(/^['"]|['"]$/g, '').replace(/[,;)]]*$/, '')
}

function nonFlagTokens(segment) {
  return segment
    .split(SHELL_SPLIT)
    .flatMap(seg => seg.split(/\s+/))
    .filter(t => t && !t.startsWith('-'))
    .map(stripShellNoise)
}

/** 提取 shell 命令"写入"的路径（高置信度目标）。 */
export function bashWrittenPaths(cmd) {
  const c = normalizeCommand(cmd)
  if (!c) return []
  const out = []

  // 重定向 > >> （排除 2> &> 等文件描述符重定向与 /dev/*）
  for (const m of c.matchAll(/(?<![\d&])>{1,2}\s*([^\s;|&<>]+)/g)) {
    const p = normalizePath(stripShellNoise(m[1]))
    if (p && !p.startsWith('/dev/')) out.push(p)
  }

  // dd of=…
  for (const m of c.matchAll(/\bdd\b[^;|&]*?\bof=([^\s;|&]+)/g)) {
    const p = normalizePath(stripShellNoise(m[1]))
    if (p && !p.startsWith('/dev/')) out.push(p)
  }

  for (const seg of c.split(SHELL_SPLIT)) {
    const first = seg.trim().split(/\s+/)[0] ?? ''

    // tee [-a] FILE...（管道两侧都可能写）
    if (first === 'tee') {
      for (const t of nonFlagTokens(seg).slice(1)) {
        const p = normalizePath(t)
        if (p && !p.startsWith('/dev/')) out.push(p)
      }
      continue
    }

    // sed -i：最后一个非 flag 参数是它原地改写的文件
    if (first === 'sed' && /(^|\s)-i[a-zA-Z]*(\s|$)/.test(seg)) {
      const toks = nonFlagTokens(seg).slice(1)
      if (toks.length >= 1) {
        const p = normalizePath(toks[toks.length - 1])
        if (p) out.push(p)
      }
      continue
    }

    // 整体写入型命令：所有非 flag 参数都是写入目标
    if (['touch', 'rm', 'mkdir', 'rmdir', 'unlink'].includes(first)) {
      for (const t of nonFlagTokens(seg).slice(1)) out.push(normalizePath(t))
      continue
    }

    // 源→目标型命令：最后一个非 flag 参数是写入目标
    if (['cp', 'mv', 'rsync', 'install', 'ln'].includes(first)) {
      const toks = nonFlagTokens(seg).slice(1)
      if (toks.length >= 2) out.push(normalizePath(toks[toks.length - 1]))
      continue
    }
  }

  return [...new Set(out.filter(Boolean))]
}

/** 提取 shell 命令"读取"的路径（白名单命令）。 */
export function bashReadPaths(cmd) {
  const c = normalizeCommand(cmd)
  if (!c) return []
  const out = []

  for (const seg of c.split(SHELL_SPLIT)) {
    const toks = seg.trim().split(/\s+/)
    const first = toks[0] ?? ''

    // cat/head/tail/less/nl/wc/file/stat/od/xxd：所有非 flag 参数都是读取目标
    if (['cat', 'head', 'tail', 'less', 'nl', 'wc', 'file', 'stat', 'od', 'xxd'].includes(first)) {
      for (const t of nonFlagTokens(seg).slice(1)) out.push(normalizePath(t))
      continue
    }

    // grep/rg：第一个非 flag 是 pattern，其余是路径
    if (first === 'grep' || first === 'rg') {
      const rest = nonFlagTokens(seg).slice(1)
      for (const t of rest.slice(1)) out.push(normalizePath(t))
      continue
    }

    // ls：非 flag 参数即目录；find：首个非 flag 参数是根路径（其后是表达式）
    if (first === 'ls') {
      for (const t of nonFlagTokens(seg).slice(1)) out.push(normalizePath(t))
      continue
    }
    if (first === 'find') {
      const rest = nonFlagTokens(seg).slice(1)
      if (rest.length >= 1) out.push(normalizePath(rest[0]))
      continue
    }

    // sed（非 -i）：最后一个非 flag 参数是输入文件
    if (first === 'sed' && !/(^|\s)-i[a-zA-Z]*(\s|$)/.test(seg)) {
      const rest = nonFlagTokens(seg).slice(1)
      if (rest.length >= 1) out.push(normalizePath(rest[rest.length - 1]))
      continue
    }
  }

  return [...new Set(out.filter(Boolean))]
}

/** 结构化工具参数中的路径：按配置的参数键名提取（顶层）。 */
export function structuredPaths(args, keys) {
  if (!args || typeof args !== 'object') return []
  const out = []
  for (const k of keys) {
    const v = args[k]
    if (typeof v === 'string' && v.trim()) out.push(normalizePath(v))
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string' && item.trim()) out.push(normalizePath(item))
      }
    }
  }
  return [...new Set(out.filter(Boolean))]
}

/**
 * 是否为验证性命令（跑测试 / 构建 / 类型检查 / lint）。
 * patterns 为字符串时按 new RegExp(String) 解释。
 */
export function isVerificationCommand(cmd, patterns) {
  const c = normalizeCommand(cmd)
  if (!c) return false
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(String(p))
    if (re.test(c)) return true
  }
  return false
}
