/**
 * 词法底座 —— 命令分段、词元、通配、指纹（docs/03 §2/§3/§7）。全部显式词法，零 LLM。
 */

/** 段切：按 `&&` `||` `;` `|` 切分命令（与全仓同规）；引号内的分隔符不保证保留——宁纵方向。 */
export function segments(command) {
  return String(command ?? '')
    .split(/&&|\|\||;|\|/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 词元：空白切分，保留原大小写与标点（遂键依赖原样）。 */
export function tokenize(segment) {
  return String(segment ?? '').trim().split(/\s+/).filter(Boolean)
}

/** 遂键规整：trim + 连续空白折叠为单空格，保留原大小写（docs/03 §2）。 */
export function collapseWs(segment) {
  return String(segment ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * 允列命中：glob 含 `*` 时按通配全匹配（`*` 跨任意字符含空白）；不含 `*` 时规整逐字相等。
 */
export function globMatch(key, glob) {
  const g = String(glob ?? '')
  if (!g.includes('*')) return key === g
  const re = new RegExp(
    g.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'),
  )
  return re.test(key)
}

/** djb2 指纹（hex 8 位）——遂名掩码用，永不携带命令原文。 */
export function fingerprint(text) {
  const s = String(text ?? '')
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16).padStart(8, '0')
}
