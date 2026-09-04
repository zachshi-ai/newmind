/**
 * 阖籍 —— 物的清单：默认形表 ∪ 显式登记（只增不删，声明权在任务方）。
 *
 * 物只在出境侧称量：手里有物不罚（装载是域内合法行为），物出境才罚。
 * 默认形表是显式词法清单，零语义——「名出境不是物出境」：$VAR / ${VAR} 引用形
 * 不含值本身，形表与子串登记都匹配不到它，豁免是词法结构天然保证的。
 */

/** 默认形表（内置七形；显式登记与它取并集，不能删它）。 */
export const DEFAULT_FORMS = [
  { id: 'sk', label: 'sk密钥形', re: /sk-[A-Za-z0-9_-]{20,}/ },
  { id: 'vcs', label: '代码仓令牌形', re: /ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}/ },
  { id: 'chat', label: '协作令牌形', re: /xox[bpars]-[A-Za-z0-9-]{10,}/ },
  { id: 'cloud', label: '云钥形', re: /AKIA[0-9A-Z]{16}/ },
  { id: 'pem', label: '私钥头形', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: 'bearer', label: '承凭形', re: /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/ },
  {
    id: 'assign',
    label: '敏感赋值形',
    re: /\b(api[-_]?key|apikey|token|secret|password|passwd|access[-_]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9+/_-]{8,}/,
  },
]

/** 掩码：报告中永不出现物的原文。len > 8 → 前 4 + … + 尾 2；否则整段 …。 */
export function maskSecret(literal) {
  const s = String(literal)
  if (s.length > 8) return `${s.slice(0, 4)}…${s.slice(-2)}`
  return '…'
}

/** 掩码摘录：命中处前 12 字符 + 掩码物 + 后 6 字符（换行压缩为空格）。 */
function excerptAround(text, start, end, literal) {
  const ctx0 = text.slice(Math.max(0, start - 12), start)
  const ctx1 = text.slice(end, end + 6)
  return `${ctx0}${maskSecret(literal)}${ctx1}`.replace(/\s+/g, ' ').trim()
}

/**
 * 建籍：显式子串登记（字符串数组）与默认形表取并集。
 * @param {{ declare?: string[] }} opts
 */
export function createWuji(opts = {}) {
  const declare = (opts.declare ?? []).map((s) => String(s)).filter((s) => s.length > 0)
  return {
    forms: DEFAULT_FORMS,
    declare,
  }
}

/**
 * 称量：text 中命中了籍上哪些物。
 * 返回逐件命中 [{ formId, label, kind, masked, excerpt }]。
 * 结构性保证：返回值里没有物的原文——只有掩码与掩码摘录，下游想泄也无处可泄。
 */
export function weigh(wuji, text) {
  const hits = []
  for (const form of wuji.forms) {
    const re = new RegExp(form.re.source, form.re.flags.includes('g') ? form.re.flags : form.re.flags + 'g')
    let m
    while ((m = re.exec(text)) !== null) {
      const literal = m[0]
      hits.push({
        formId: form.id,
        label: form.label,
        kind: '默认形',
        masked: maskSecret(literal),
        excerpt: excerptAround(text, m.index, m.index + literal.length, literal),
      })
      if (m.index === re.lastIndex) re.lastIndex++ // 零宽防御
    }
  }
  for (const d of wuji.declare) {
    let from = 0
    for (;;) {
      const idx = text.indexOf(d, from)
      if (idx < 0) break
      hits.push({
        formId: 'declare',
        label: '显式登记',
        kind: '显式登记',
        masked: maskSecret(d),
        excerpt: excerptAround(text, idx, idx + d.length, d),
      })
      from = idx + d.length
    }
  }
  return hits
}
