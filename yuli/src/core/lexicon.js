/**
 * 险形表与备形表 —— 确定性词法，零语义。
 *
 * 险形（四族默认形 ∪ 显式登记）：命中即险行候选——灭迹、断史、覆宗、遁引。
 * 备形（影写/存史/布影/干跑）：行前之备的词法证据——备过什么物，赦什么物之险。
 * 遁引与显式族永缺备：影存不住任意执行，词亦无物可影——唯落款可赦。
 * 词表之外的险不入账：宁可漏判，不可妄断。
 */

// ---- 险形：默认四族（docs/03 §5，正则只增不删） ----------------------------

export const RISK_FAMILIES = {
  wipe: {
    id: 'wipe',
    label: '灭迹',
    forms: [
      { id: 'rm-recursive', re: /\brm\s+(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive)(?:\s+-[A-Za-z]+|\s+--[A-Za-z-]+(?=\S))*\s*\S/ },
      { id: 'find-delete', re: /\bfind\b[^;&|]*\s-delete\b/ },
      { id: 'find-exec-rm', re: /\bfind\b[^;&|]*-exec\s+rm\b/ },
      { id: 'xargs-rm', re: /\bxargs\s+(?:-\S+\s+)*rm\b/ },
      { id: 'shred', re: /\bshred\b/ },
    ],
  },
  sever: {
    id: 'sever',
    label: '断史',
    forms: [
      { id: 'force-push', re: /\bgit\s+push\b[^;&|]*(?:--force(?:-with-lease)?\b|\s-f\b)/ },
      { id: 'reset-hard', re: /\bgit\s+reset\s+--hard\b/ },
      { id: 'clean-f', re: /\bgit\s+clean\b(?=[^;&|]*\s(?:-\w*f\w*|--force)\b)/ },
      { id: 'checkout-discard', re: /\bgit\s+checkout\b[^;&|]*\s--\s*\S/ },
      { id: 'restore-discard', re: /\bgit\s+restore\b(?![^;&|]*--staged\b)/ },
      { id: 'branch-D', re: /\bgit\s+branch\b[^;&|]*\s-D\b/ },
    ],
  },
  drop: {
    id: 'drop',
    label: '覆宗',
    forms: [
      { id: 'drop-sql', re: /\bdrop\s+(?:table|database|schema|index|view)\b/i },
      { id: 'truncate', re: /\btruncate\b/i },
      { id: 'delete-from', re: /\bdelete\s+from\b/i },
      { id: 'docker-volume', re: /\bdocker\s+volume\s+(?:rm|prune)\b/ },
    ],
  },
  conjure: {
    id: 'conjure',
    label: '遁引',
    forms: [{ id: 'pipe-shell', re: /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/ }],
  },
}

/** 干跑词：险形命中而带此词 → 无伤之形（docs/03 §5）。 */
export const DRYRUN_RE = /--dry-run\b|--dryrun\b/

/** 干 clean：clean 而不带 f 旗——范围预演（docs/03 §5）。 */
export const GIT_CLEAN_RE = /\bgit\s+clean\b/

// ---- 备形：行前之备（docs/03 §6） ------------------------------------------

/** 影写形（灭迹之备、clean-f 之备）：须与险行词法相交。 */
export const YING_FORMS = [
  { id: 'cp', re: /\bcp\b/ },
  { id: 'rsync', re: /\brsync\b/ },
  { id: 'tar', re: /\btar\b/ },
  { id: 'zip', re: /\bzip\b/ },
  { id: '7z', re: /\b7z\b/ },
  { id: 'mysqldump', re: /\bmysqldump\b/ },
  { id: 'pg_dump', re: /\bpg_dump\b/ },
]

/** 布影形（覆宗之备）：须与险行词法相交。 */
export const BUYING_FORMS = [
  { id: 'mysqldump', re: /\bmysqldump\b/ },
  { id: 'pg_dump', re: /\bpg_dump\b/ },
  { id: 'sqlite-backup', re: /\bsqlite3\b[^\n]*\.(?:dump|backup)\b/ },
  { id: 'cp', re: /\bcp\b/ },
  { id: 'rsync', re: /\brsync\b/ },
  { id: 'tar', re: /\btar\b/ },
]

/** 存史形（断史之备，全族全局）：commit/stash/tag、非强推之 push。干 clean 另立。 */
export const CUNSHI_FORMS = [
  { id: 'git-commit', re: /\bgit\s+(?:commit|stash|tag)\b/ },
  { id: 'git-push', re: /\bgit\s+push\b/ },
]

/** 词法相交（docs/03 §7）：小写 → 切词 → 去首部连字符 → 路径段切分 → 滤短词纯数字。 */
export function words(cmd) {
  const out = new Set()
  for (const raw of String(cmd).toLowerCase().split(/[^a-z0-9_./-]+/)) {
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
 * 险形命中：返回 [{ family, familyLabel, formId }]（多族多形逐条，案别归并时一调用一案）。
 * @param {string} cmd 命令串
 * @param {{ risk?: string[], noDefaults?: boolean }} register 豫册
 */
export function riskHits(cmd, register = {}) {
  const text = String(cmd)
  const hits = []
  if (!register.noDefaults) {
    for (const family of Object.values(RISK_FAMILIES)) {
      for (const form of family.forms) {
        if (form.re.test(text)) hits.push({ family: family.id, familyLabel: family.label, formId: form.id })
      }
    }
  }
  for (const word of register.risk ?? []) {
    if (word && text.includes(word)) hits.push({ family: 'declare', familyLabel: '显式', formId: `declare:${word}` })
  }
  return hits
}

/** 款词命中：命令串含册上任一款词（逐字）。 */
export function exemptHit(cmd, register = {}) {
  const text = String(cmd)
  return (register.exempt ?? []).find((w) => w && text.includes(w)) ?? null
}

export function isDryRun(cmd) {
  return DRYRUN_RE.test(String(cmd))
}

/** 干 clean：clean 而不带 f 旗（带 f 由 clean-f 险形先接走）。 */
export function isDryClean(cmd) {
  const text = String(cmd)
  if (!GIT_CLEAN_RE.test(text)) return false
  return !riskHits(text, {}).some((h) => h.formId === 'clean-f')
}

/** 影写/布影命中与词集：返回 { ying, buying, words }。 */
export function netShapes(cmd) {
  const text = String(cmd)
  const ws = words(text)
  return {
    ying: YING_FORMS.some((f) => f.re.test(text)),
    buying: BUYING_FORMS.some((f) => f.re.test(text)),
    words: ws,
  }
}

/** 存史命中（非强推之 push 才是存史；强推是险行，不由 CUNSHI 判）。 */
export function isCunshi(cmd) {
  const text = String(cmd)
  if (!CUNSHI_FORMS.some((f) => f.re.test(text))) return false
  return !RISK_FAMILIES.sever.forms.find((f) => f.id === 'force-push').re.test(text)
}
