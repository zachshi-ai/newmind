/**
 * 再命与承施 —— 主渠道重命的两条词法通道（docs/03 §5.2，声明权在主渠道）。
 *
 * 对象通道：principal 文本含该遂键的对象词元（非旗标、剔通用词、长 ≥3，子串命中）。
 * 命词通道：principal 文本含命词表 12 词之一，且本笔是该 principal 之后同会话的首笔遂
 * （一次再命只开一决）。
 * 再命限同会话——另一会话的主文无从认作本会话之命（docs/03 §12）。
 */

const GENERIC_WORDS = new Set([
  'gh', 'api', 'curl', 'wget', 'http', 'https',
  'mail', 'mailx', 'sendmail', 'mutt', 'msmtp',
  'post', 'get', 'bash', 'sudo', 'echo',
])

const REMAND_WORDS = ['重发', '再发', '再试', '重试', '再来', '重跑', '再跑', '再施', 'resend', 'retry', 'rerun', 'again']

/** 遂键的对象词元：非旗标词元、剔通用词、剥引号后长 ≥3。 */
export function objectTokens(key) {
  const out = []
  for (const raw of String(key ?? '').split(/\s+/)) {
    if (raw.startsWith('-')) continue
    const t = raw.replace(/^["'`（(]+|["'`）)]+$/g, '')
    if (t.length < 3) continue
    if (GENERIC_WORDS.has(t.toLowerCase())) continue
    out.push(t)
  }
  return out
}

/**
 * 再命判定。principal：{ session, ord, text }； deed：{ session, ord, key }；
 * firstDeedOrdAfter：该 principal 之后同会话首笔遂的 ord（无则 null，由调用方沿遂账算出）。
 * 命中返回通道名（'对象' | '命词'），不中返回 null。
 */
export function matchRemand(principal, deed, firstDeedOrdAfter) {
  if (!principal || principal.session !== deed.session) return null
  if (!(principal.ord < deed.ord)) return null

  const tokens = objectTokens(deed.key)
  if (tokens.some((t) => principal.text.includes(t))) return '对象'

  const hasWord = REMAND_WORDS.some((w) => principal.text.toLowerCase().includes(w))
  if (hasWord && firstDeedOrdAfter === deed.ord) return '命词'

  return null
}
