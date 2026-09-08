/**
 * 弱锁形与阻词 —— 守门开关的词法（docs/03 §3 锁死），全部公开词表，零 LLM。
 *
 * 默认弱锁形 12（验锁 10 ∪ 网锁 2）：单行正则、大小写敏感、一处=一行=一案；
 * 阻词 10（验锁 6 ∪ 网锁 4）：大小写不敏感、按表序取首中，只供拆锁窗归因；
 * 校场（演武之地不设门禁）：径中任一名段命中 10 段正则即立案前豁免。
 */

// 形名即展示词面（公开词表，非用户行内容——掩码不受累）。
export const LOCK_FORMS = [
  { name: 'verify=False', re: /\bverify\s*=\s*(False|false|0)\b/, family: 'yan' },
  { name: 'ssl_verify=False', re: /ssl_verify\s*=\s*(False|false)/, family: 'yan' },
  { name: 'CERT_NONE', re: /\bCERT_NONE\b/, family: 'yan' },
  { name: 'check_hostname=False', re: /check_hostname\s*=\s*(False|false)/, family: 'yan' },
  { name: 'rejectUnauthorized:false', re: /rejectUnauthorized['"]?\s*:\s*(False|false|0)\b/, family: 'yan' },
  { name: 'NODE_TLS_REJECT_UNAUTHORIZED=0', re: /NODE_TLS_REJECT_UNAUTHORIZED['"]?\s*[=:]\s*['"]?0/, family: 'yan' },
  { name: 'GIT_SSL_NO_VERIFY', re: /\bGIT_SSL_NO_VERIFY\b/, family: 'yan' },
  { name: 'sslVerify=false', re: /sslVerify\s*=\s*(false|False)/, family: 'yan' },
  { name: 'InsecureSkipVerify:true', re: /InsecureSkipVerify\s*:\s*true/, family: 'yan' },
  { name: '--insecure', re: /--insecure\b/, family: 'yan' },
  { name: 'Access-Control-Allow-Origin:*', re: /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]?\*/, family: 'wang' },
  { name: "origin:'*'", re: /origin['"]?\s*:\s*['"]\*['"]/, family: 'wang' },
]

const YAN_WORDS = ['certificate', 'self-signed', 'ssl', 'tls', 'handshake', '证书']
const WANG_WORDS = ['cors', 'cross-origin', 'access-control', '跨域']

/** 阻词归因：族内按表序取首中（大小写不敏感），无中返回 null。 */
export function obstacleWord(text, family) {
  const t = String(text ?? '').toLowerCase()
  const words = family === 'wang' ? WANG_WORDS : YAN_WORDS
  for (const w of words) {
    if (t.includes(w.toLowerCase())) return w
  }
  return null
}

/** 尾文逐行扫形：返回 [{line, name, family}]（行号 1 起，一行可中多形）。 */
export function scanLines(content) {
  const lines = String(content).split(/\r?\n/)
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    for (const f of LOCK_FORMS) {
      if (f.re.test(lines[i])) hits.push({ line: i + 1, name: f.name, family: f.family })
    }
  }
  return hits
}

/** 校场：径中任一名段命中 10 段正则即豁免（径首亦算段）。 */
const CAMPO_RE = /^(tests?|specs?|mocks?|fixtures?|debug|examples?|benchmarks?|sandbox|demos?|local)$/

export function isCampo(path) {
  return String(path ?? '').split('/').some((seg) => seg.length > 0 && CAMPO_RE.test(seg))
}

/** 宽 glob 命中：词元含 * 时按通配全匹配（* 跨目录），否则规整逐字相等（同全仓既例）。 */
export function globMatch(path, pattern) {
  const p = String(pattern ?? '')
  if (!p.includes('*')) return path === p
  const re = new RegExp(
    p.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*') + '$'
  )
  return re.test(path)
}
