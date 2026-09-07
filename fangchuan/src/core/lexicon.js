/**
 * 防川词法 —— 命令切分、词元化、生产落点词法、灭词表与匹配（docs/03 §2 锁死）。
 *
 * 词面账三原则（与全仓同规）：不做文件系统语义、不展开 `~`、不探测存在性；
 * 引号字符从命令文本中删除后空白切词；词法可欺但骗一次留一次形。
 */

import { normalizePath } from './object.js'

/** 灭词表（7）：段内任一词元（小写化）命中即破坏段——`git rm` 之 rm 亦中。 */
export const RM_WORDS = ['rm', 'unlink', 'rmdir', 'del', 'erase', 'trash', 'shred']

/** 拷贝动词（2）：末个非旗标词元是落点——`cp a b` 的 b、`mv a b` 的 b。 */
export const COPY_VERBS = ['cp', 'mv']

/** 触碰动词（2）：任一非旗标词元皆可落——`tee`、`touch`。 */
export const TOUCH_VERBS = ['tee', 'touch']

/** 段切分：按 && || ; | 切段（管道与链式各段独立判型）。 */
export function segments(command) {
  return String(command ?? '').split(/&&|\|\||;|\|/)
}

/** 词元化：删引号字符后空白切分。 */
export function tokenize(segment) {
  return String(segment ?? '').replace(/['"]/g, '').trim().split(/\s+/).filter(Boolean)
}

/** 非旗标词元（`-` 开头者不算——`-r`/`-f` 是修饰不是落点）。 */
export function argTokens(tokens) {
  return tokens.filter((t) => !t.startsWith('-'))
}

/**
 * 重定向目标：`>`/`>>` 后第一个词元；`2>&1` 天然不中（`&` 不在捕获字符集）。
 * 返回词元数组（未规整，调用方以 hitOf 判）。
 */
export function redirectTargets(segment) {
  const out = []
  const re = /(?:>{1,2})\s*([^\s;|&"']+)/g
  let m
  while ((m = re.exec(String(segment ?? ''))) !== null) out.push(m[1])
  return out
}

/**
 * 词元与既知径匹配：规整逐字相等 ∪ 宽 glob（词元含 `*` 时按通配全匹配，`*` 跨目录）。
 * 全等是主道；沙川落点与纵列的径匹配都用它。
 */
export function tokenMatchesPath(token, path) {
  const t = normalizePath(token)
  if (t === path) return true
  if (t.includes('*')) return globMatch(path, t)
  return false
}

/** 宽 glob 全匹配：pat 含 `*` 时按通配（`*` 跨目录），否则逐字相等。 */
export function globMatch(str, pat) {
  const p = normalizePath(pat)
  if (!p.includes('*')) return normalizePath(str) === p
  const re = new RegExp(`^${p.split('*').map(escapeRe).join('.*')}$`)
  return re.test(normalizePath(str))
}

function escapeRe(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}
