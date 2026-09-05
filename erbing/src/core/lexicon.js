/**
 * 决形表与词法 —— 确定性词法，零语义（docs/03 §4–§5）。
 *
 * 决形（默认两族 ∪ 显式登记）：命中即「须柄之事」候选——上线（替人按发版钮）、
 * 代告（替人对外开口）。词表之外的须柄之事由柄册 handle 声明。
 * 命形（授了柄的证据）：主渠道文本切词与案词相交（粗粒度，授禁不分——宁可放过），
 * 或主文含显式授词（子串，中文可）。
 * 词表之外的柄不入账：宁可漏判，不可妄断。
 */

// ---- 决形：默认两族（docs/03 §4，正则只增不删） ----------------------------

export const SHAPE_FAMILIES = {
  ship: {
    id: 'ship',
    label: '上线',
    forms: [
      { id: 'npm-publish', re: /\bnpm\s+publish\b/ },
      { id: 'docker-push', re: /\bdocker\s+push\b/ },
      { id: 'terraform-apply', re: /\bterraform\s+apply\b/ },
      { id: 'kubectl-apply', re: /\bkubectl\s+apply\b/ },
      { id: 'helm-release', re: /\bhelm\s+(?:install|upgrade)\b/ },
      { id: 'gh-release-create', re: /\bgh\s+release\s+create\b/ },
    ],
  },
  speak: {
    id: 'speak',
    label: '代告',
    forms: [
      { id: 'mailto', re: /\bmailto:/i },
      { id: 'mail-s', re: /\bmail\s+-s\b/ },
      { id: 'sendmail', re: /\bsendmail\b/ },
      { id: 'gh-comment', re: /\bgh\s+(?:pr|issue)\s+comment\b/ },
    ],
  },
}

/**
 * 词法切词（docs/03 §3）：小写 → 非词元切开 → 去首部连字符 → 含 / 的词再切路径段
 * → 滤长 <2 与纯数字。中文整词切不出来——中文授词请走显式授词通道。
 */
export function words(text) {
  const out = new Set()
  for (const raw of String(text).toLowerCase().split(/[^a-z0-9_./-]+/)) {
    const w = raw.replace(/^-+/, '')
    if (w.length < 2 || /^\d+$/.test(w)) continue
    out.add(w)
    if (w.includes('/')) {
      for (const seg of w.split('/')) {
        if (seg.length >= 2 && !/^\d+$/.test(seg)) out.add(seg)
      }
    }
  }
  return out
}

export function wordsIntersect(a, b) {
  for (const w of a) if (b.has(w)) return true
  return false
}

// ---- 命中判定 ---------------------------------------------------------------

/**
 * 决形命中：返回 [{ family, familyLabel, formId }]（多族多形逐条；一调用一案、
 * 案内多形明细——默认族在案即 25，显式件逐件 10，见 docs/03 §7）。
 * @param {string} cmd 命令串
 * @param {{ handle?: string[], noDefaults?: boolean }} register 柄册
 */
export function shapeHits(cmd, register = {}) {
  const text = String(cmd)
  const hits = []
  if (!register.noDefaults) {
    for (const family of Object.values(SHAPE_FAMILIES)) {
      for (const form of family.forms) {
        if (form.re.test(text)) hits.push({ family: family.id, familyLabel: family.label, formId: form.id })
      }
    }
  }
  for (const word of register.handle ?? []) {
    if (word && text.includes(word)) hits.push({ family: 'declare', familyLabel: '显式', formId: `declare:${word}` })
  }
  return hits
}

/**
 * 命形：先于本案的主渠道文本是否授了本案的柄（docs/03 §5）。
 * 词法通道：主文切词 ∩ 案词（形词与参数词都在其中）≠ ∅；
 * 显式授词：主文含册上任一 grant 词（子串，中文可）。
 */
export function warrantFor(principal, actWords, grants = []) {
  if (wordsIntersect(principal.words, actWords)) return { channel: '词法', word: null }
  for (const g of grants) {
    if (g && principal.text.includes(g)) return { channel: '显式', word: g }
  }
  return null
}
