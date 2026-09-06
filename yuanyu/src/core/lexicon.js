/**
 * 入目词法 —— 默认白形表 / 默认秘形表 / 默认窥词表 / 要词表 / 命令切分 / 密值指纹（docs/03 §2/§3/§5 锁死）。
 *
 * 词面账三原则（与全仓同规）：不做文件系统语义、不展开 `~`、不探测存在性；
 * 引号字符从命令文本中删除后空白切词；词法可欺但骗一次留一次形。
 */

/** 默认白形表（3）：先于一切判定，静默出账——模板里没有真值，模板入目无罪。 */
export const DEFAULT_CLEAR_FORMS = ['.env.example', '.env.sample', '.env.template']

/** 默认秘形表（20，子串匹配规整径，开箱在岗；逐形依据见 docs/03 §3）。 */
export const DEFAULT_SECRET_FORMS = [
  // 尾形 11：证书/密钥库/密码存档的事实标准后缀
  '.pem', '.p12', '.pfx', '.jks', '.keystore', '.htpasswd', '.pgpass', '.npmrc', '.netrc', '.git-credentials', '.kdbx',
  // 环形 1：环境文件总形（.env.local / .env.production / .envrc 尽在其中）
  '.env',
  // 目录形 4：凭据目录的藏身之制
  '.aws/', '.ssh/', '.gnupg/', '.kube/',
  // 名形 4：事实标准密钥名 / 云凭据文件名
  'id_rsa', 'id_ed25519', 'id_ecdsa', 'credentials.json',
]

/** 默认窥词表（17，段首词，小写化匹配）：把暗处之物请进视野的常见命令首词。 */
export const DEFAULT_PEEK_WORDS = [
  'cat', 'head', 'tail', 'less', 'more', 'strings', 'base64', 'xxd',
  'grep', 'egrep', 'rg', 'awk', 'sed', 'zcat', 'vi', 'vim', 'nano',
]

/** 要词表（8）：KEY 大写化后子串命中其一，其值方为要值候选。 */
export const WANTED_WORDS = ['TOKEN', 'SECRET', 'PASSWORD', 'PASSWD', 'KEY', 'CRED', 'PASS', 'PRIVATE']

/** 段切分：按 && || ; | 切段（管道与链式各段独立判型）。 */
export function segments(command) {
  return String(command ?? '').split(/&&|\|\||;|\|/)
}

/** 词元化：删引号字符后空白切分。 */
export function tokenize(segment) {
  return String(segment ?? '').replace(/['"]/g, '').trim().split(/\s+/).filter(Boolean)
}

const BASENAME_RE = /[/\\]/
/** 段首词（剥路径前缀、小写化——命令名惯例小写；秘形匹配不受此影响，仍大小写敏感）。 */
export function headWord(segment) {
  const t = tokenize(segment)
  if (!t.length) return ''
  return t[0].split(BASENAME_RE).pop().toLowerCase()
}

/**
 * 密值指纹：sdbm + djb2 双积累器，纯 JS、零依赖、确定性。
 * 报告与块中永不携带值原文——指纹是结构掩码，只用于跨行对认（同值同纹）。
 */
export function fingerprint(value) {
  const s = String(value ?? '')
  let sdbm = 0
  let djb2 = 5381
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    sdbm = (c + (sdbm << 6) + (sdbm << 16) - sdbm) | 0
    djb2 = (Math.imul(djb2, 33) + c) | 0
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, '0')
  return `fp:${hex(sdbm)}${hex(djb2)}(len ${s.length})`
}

/** 要值行形：KEY=VALUE / KEY: VALUE / "KEY": "VALUE" 三态同收（docs/03 §5）。 */
const LINE_RE = /^\s*"?([A-Za-z0-9][A-Za-z0-9_.\-]*)"?\s*[:=]\s*(.+?)\s*,?\s*$/

/**
 * 从装载结果正文提取要值集（docs/03 §5）：
 *   行形命中 → KEY 大写化中要词 → 值剥引号 → 值卫（http 前缀排除、len ≥ 16）→ 指纹。
 * 返回 Map<指纹, { value, len, key, }>（value 供流内转运比照，永不外泄到任何报告结构）。
 */
export function extractValues(content) {
  const out = new Map()
  if (typeof content !== 'string' || !content) return out
  for (const line of content.split(/\r?\n/)) {
    const m = LINE_RE.exec(line)
    if (!m) continue
    const key = m[1].toUpperCase()
    if (!WANTED_WORDS.some((w) => key.includes(w))) continue
    let val = m[2].replace(/^["']/, '').replace(/["']$/, '')
    if (val.length < 16) continue
    if (val.startsWith('http://') || val.startsWith('https://')) continue
    const fp = fingerprint(val)
    if (!out.has(fp)) out.set(fp, { value: val, len: val.length, key: m[1] })
  }
  return out
}
