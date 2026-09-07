/**
 * 平准词法 —— 命令切分、词元化、生产落点词法与匹配（docs/03 §2/§3 锁死）。
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
 * 返回词元数组（未规整，调用方判）。
 */
export function redirectTargets(segment) {
  const out = []
  const re = /(?:>{1,2})\s*([^\s;|&"']+)/g
  let m
  while ((m = re.exec(String(segment ?? ''))) !== null) out.push(m[1])
  return out
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

/**
 * 宿主域判定（docs/03 §3.3 锁死）：host 等于默认域或为其子域即默认
 * （host === d 或 host 以「.」 + d 结尾），否则越源——pypi.org.evil.com 之
 * 后缀攻击不在默认之列。
 */
export function isDefaultHost(host, defaults) {
  const h = String(host ?? '').toLowerCase().replace(/\.+$/, '')
  return defaults.some((d) => h === d || h.endsWith(`.${d}`))
}

/** 从 URL 或裸宿主提取 host（剥 scheme、路径、端口、用户信息；小写化）。 */
export function hostOf(value) {
  let s = String(value ?? '').trim()
  if (!s) return ''
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '') // scheme
  s = s.replace(/^[^/@]+@/, '') // 用户信息
  const head = s.split(/[/?#]/)[0]
  return head.split(':')[0].toLowerCase()
}
