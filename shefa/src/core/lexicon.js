/**
 * 落物词法 —— exec 命令词面的落物目标提取与 glob 匹配（docs/03 §4.2 锁死）。
 *
 * 词面账三原则：不做文件系统语义、不展开 `~`、不探测存在性；
 * 引号字符从命令文本中删除后空白切词（词面账简化：引号内的空格不再分隔——引文消息不影响段型判定）。
 */

/** 段切分：按 && || ; | 切段（管道与链式各段独立判型）。 */
export function segments(command) {
  return String(command ?? '').split(/&&|\|\||;|\|/)
}

/** 词元化：删引号字符后空白切分。 */
export function tokenize(segment) {
  return String(segment ?? '').replace(/['"]/g, '').trim().split(/\s+/).filter(Boolean)
}

const BASENAME_RE = /[/\\]/
/** 段首词（剥路径前缀、小写化——命令名惯例小写；筏形匹配不受此影响，仍大小写敏感）。 */
export function headWord(segment) {
  const t = tokenize(segment)
  if (!t.length) return ''
  return t[0].split(BASENAME_RE).pop().toLowerCase()
}

const FLAG_RE = /^-/
const OUTREF_RE = /^&\d/
/** 目标词元是否有效（非旗标、非 `2>&1` 的 `&N` 形）。 */
function validTarget(token) {
  return !FLAG_RE.test(token) && !OUTREF_RE.test(token)
}

const REDIRECT_RE = /(?:^|\s)[012&]*>{1,2}\s*([^\s;&|<>]+)/g
const CP_MV = new Set(['cp', 'mv'])
const TEE_TOUCH = new Set(['tee', 'touch'])

/**
 * 单段的落物目标提取（docs/03 §4.2）：
 *   cp/mv → 末个非旗标词元；tee/touch → 其余全部非旗标词元；其余段 → 重定向正则。
 * 返回词元数组（未过滤 keep、未匹配筏形——那两道在引擎里做）。
 */
export function dropTargets(segment) {
  const tokens = tokenize(segment)
  if (!tokens.length) return []
  const head = tokens[0].split(BASENAME_RE).pop().toLowerCase()
  const out = []
  if (CP_MV.has(head)) {
    const paths = tokens.slice(1).filter(validTarget)
    if (paths.length) out.push(paths[paths.length - 1])
  } else if (TEE_TOUCH.has(head)) {
    out.push(...tokens.slice(1).filter(validTarget))
  } else {
    REDIRECT_RE.lastIndex = 0
    let m
    while ((m = REDIRECT_RE.exec(String(segment))) !== null) {
      if (validTarget(m[1])) out.push(m[1])
    }
  }
  return out
}

const GLOB_ESCAPE = /[.*+?^${}()|[\]\\]/g

/**
 * roots 域界 glob（docs/03 §3）：`**` 跨 `/`、`*` 不跨 `/`、`?` 单字符；尾 `/` 视为目录前缀。
 */
export function globMatch(pattern, path) {
  const p = String(pattern ?? '')
  const s = String(path ?? '')
  if (p === s) return true
  const src = (p.endsWith('/') ? p + '**' : p)
    .split('**')
    .map((seg) =>
      seg
        .split('*')
        .map((piece) => piece.split('?').map((q) => q.replace(GLOB_ESCAPE, '\\$&')).join('[^/]'))
        .join('[^/]*'),
    )
    .join('.*')
  return new RegExp(`^${src}$`).test(s)
}

/**
 * rm 凭据的宽 glob（docs/03 §4.3）：`*` 匹配任意（含 `/`）、`?` 单字符——销案方向从宽（宁纵）。
 */
export function wildcardMatch(pattern, path) {
  const p = String(pattern ?? '')
  const s = String(path ?? '')
  if (p === s) return true
  const src = p
    .split('*')
    .map((piece) => piece.split('?').map((q) => q.replace(GLOB_ESCAPE, '\\$&')).join('.'))
    .join('.*')
  return new RegExp(`^${src}$`).test(s)
}

/** 系统区前缀（域界回退用，docs/03 §3）：无 roots 时以这些前缀判域外。 */
export const SYSTEM_PREFIXES = ['/tmp/', '/var/', '/private/var/', '~/', '/dev/', '/etc/']

/** 无 roots 时的域外判定：径以系统区前缀开头。 */
export function inSystemArea(path) {
  return SYSTEM_PREFIXES.some((p) => String(path ?? '').startsWith(p))
}
