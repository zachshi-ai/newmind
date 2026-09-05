/**
 * 名之提取 —— 从写内容与安装令里提取「名」，全部显式词表，零 NLP。
 *
 * 名的原料只有两处：
 *   - write 族成功之写的内容字段（代码后缀门 + 注释剥离 + 提名正则）；
 *   - exec 族命令串里的安装令（npm/pnpm/yarn + install/add）。
 *
 * 名的分类（classifySpec）：
 *   node: 前缀 → builtin；./ 或 ../ → relative（以被写文件目录为基解析）；
 *   # 或 / 开头 → skip（bundler 专属，宁漏勿诬）；其余 → bare（@ 开头取两段，否则取首段）。
 */

import { normalizePath } from './glob.js'
import { posix } from 'node:path'

export const CODE_EXTS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']
export const CONTENT_FIELDS = ['content', 'text', 'new_string', 'newString', 'newText']

/** 默认内建表（node: 前缀一律豁免，此外精确匹配）。 */
export const DEFAULT_BUILTINS = [
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram',
  'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url',
  'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]

/** 内容字段：按序取首个非空字符串（write args 的名之载体）。 */
export function contentOf(args) {
  const a = args && typeof args === 'object' ? args : {}
  for (const field of CONTENT_FIELDS) {
    if (typeof a[field] === 'string' && a[field].length > 0) return a[field]
  }
  return null
}

/** 代码后缀门：径的后缀 ∈ 默认表 ∪ 登记增词 才提名。 */
export function isCodePath(p, extraExts = []) {
  const s = String(p ?? '').toLowerCase()
  for (const ext of [...CODE_EXTS, ...extraExts]) {
    if (s.endsWith(ext)) return true
  }
  return false
}

/** 注释剥离：整行注释 → null；行内 `//`（行首或前一字符为空白）起截断（防误伤网址中的双斜杠）。 */
export function stripLine(line) {
  const t = line.trim()
  if (!t) return null
  for (const head of ['//', '/*', '*', '#', '<!--']) {
    if (t.startsWith(head)) return null
  }
  const idx = t.indexOf('//')
  if (idx > 0 && /\s/.test(t[idx - 1])) return t.slice(0, idx)
  return t
}

const SPEC_PATTERNS = [
  /^\s*import\s[^'"]*?from\s*['"]([^'"]+)['"]/,
  /^\s*import\s*['"]([^'"]+)['"]/,
  /^\s*export\s[^'"]*?from\s*['"]([^'"]+)['"]/,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/,
]

/** 提名：逐行剥离注释后过提名正则，按出现序返回（去重归判定层）。 */
export function extractSpecs(text) {
  const specs = []
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = stripLine(rawLine)
    if (line === null) continue
    for (const re of SPEC_PATTERNS) {
      const m = line.match(re)
      if (m) {
        specs.push(m[1])
        break // 一行取一名：首个命中模式为准，确定性优先
      }
    }
  }
  return specs
}

/** 包名：scoped（@a/b）取前两段，否则取首段；余段是包内子径，不问。 */
export function pkgName(spec) {
  const s = String(spec)
  if (s.startsWith('@')) {
    const parts = s.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : s
  }
  return s.split('/')[0]
}

/**
 * 相对名解析：以被写文件目录为基，posix 规范化。
 * fromPath 已是规范化路径；spec 原样（./x、../x）。
 */
export function resolveRelative(spec, fromPath) {
  const dir = posix.dirname(normalizePath(fromPath))
  return normalizePath(posix.normalize(`${dir}/${spec}`))
}

/** 名的分类。返回 { kind, pkg?, resolved? }，kind ∈ builtin | relative | bare | skip。 */
export function classifySpec(spec) {
  const s = String(spec)
  if (s.startsWith('node:')) return { kind: 'builtin' }
  if (s.startsWith('./') || s.startsWith('../')) {
    return { kind: 'relative' }
  }
  if (s.startsWith('#') || s.startsWith('/')) return { kind: 'skip' }
  return { kind: 'bare', pkg: pkgName(s) }
}

/**
 * 安装令提取：npm|pnpm|yarn + i|install|add，其后词元滤旗标、剥版本。
 * 返回去重前的包名序列（判定层按 (session, pkg, 次序) 记案）。
 */
export function extractInstalls(command) {
  const names = []
  const re = /\b(?:npm|pnpm|yarn)\s+(?:i(?:nstall)?|add)\b\s*([^;&|]*)/g
  const text = String(command ?? '')
  let m
  while ((m = re.exec(text)) !== null) {
    const tokens = m[1].split(/\s+/).filter((t) => t && !t.startsWith('-'))
    for (const t of tokens) {
      const name = stripVersion(t)
      if (name) names.push(name)
    }
  }
  return names
}

/** 版本剥离：pkg@1.2 → pkg；@a/b@1.2 → @a/b；@a/b → @a/b。 */
export function stripVersion(token) {
  const t = String(token)
  if (t.startsWith('@')) {
    const m = t.match(/^(@[^/@]+\/[^/@]+)/)
    return m ? m[1] : null
  }
  const idx = t.indexOf('@')
  return idx === -1 ? t : t.slice(0, idx)
}

/** 内建豁免：node: 前缀 ∪ 默认表 ∪ 登记增词。 */
export function isBuiltin(name, extraBuiltins = []) {
  const s = String(name)
  if (s.startsWith('node:')) return true
  if (DEFAULT_BUILTINS.includes(s)) return true
  return extraBuiltins.includes(s)
}
