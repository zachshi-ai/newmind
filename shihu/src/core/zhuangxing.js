/**
 * 状形提取 —— 状面形、声明行与状键的词法形态（docs/03 §3/§4 锁死），全部确定性，零 LLM。
 *
 * 状面形默认表 5（规整径上判定）：HANDOFF.md/handoff.md basename 全等 ∪
 * basename 小写含 handoff ∪ /handoff/ 径段 ∪ basename 含「交接」；册 shapes
 * 增形（basename 子串大小写不敏或含 * 的宽 glob），noDefaults 可关默认表。
 *
 * 声明行 = 命中任一状形：勾选形（行首列表符后 [x]/[X]）∪ 旗标形（✅☑️☑）∪
 * 中文状词 11 ∪ 英文状词 4（大小写不敏）∪ 里程碑形（Status:/状态: 后含
 * done/complete/完成）；未勾选与将来时不中。
 *
 * 状键 = 声明行剥列表符/勾选符/状词/引用词/停用词后：径形词元保形 ∪ 含 /
 * 词形 ∪ Unicode 词元（长度 ≥2）；对账大小写归一子串。
 */

const SHAPE_EXACT = new Set(['HANDOFF.md', 'handoff.md'])
const SHAPE_SUB = 'handoff'
const SHAPE_SEG = '/handoff/'
const SHAPE_CN = '交接'

export function isSurfacePath(path, cfg = {}) {
  const p = String(path ?? '')
  const slash = p.lastIndexOf('/')
  const base = slash >= 0 ? p.slice(slash + 1) : p
  const low = base.toLowerCase()
  if (!cfg.noDefaults) {
    if (SHAPE_EXACT.has(base)) return true
    if (low.includes(SHAPE_SUB)) return true
    if (('//' + p + '/').includes(SHAPE_SEG)) return true
    if (base.includes(SHAPE_CN)) return true
  }
  for (const s of cfg.shapes ?? []) {
    const g = String(s ?? '')
    if (g.includes('*')) {
      const re = new RegExp(g.split('*').map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*') + '$', 'i')
      if (re.test(base) || re.test(p)) return true
    } else if (low.includes(g.toLowerCase())) {
      return true
    }
  }
  return false
}

/** 宽 glob 命中：词元含 * 时按通配全匹配（* 跨目录），否则规整逐字相等（同全仓既例）。 */
export function globMatch(path, pattern) {
  const g = String(pattern ?? '')
  if (!g.includes('*')) return path === g
  const re = new RegExp(g.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]*') + '$')
  return re.test(path)
}

const CHECK_RE = /^\s*(?:[-*+]\s*)?\[[xX]\]/
const FLAG_RE = /^\s*(?:[-*+]\s*)?(?:✅|☑️|☑)/u
const ZHUANG_WORDS = ['已完成', '已修复', '已实现', '已添加', '已创建', '已更新', '已删除', '已迁移', '已重构', '已部署', '已解决', 'done:', 'completed:', 'fixed:', 'implemented:']
const MILESTONE_RE = /(?:status|状态)\s*[:：]\s*[^\n]*(?:done|complete|完成)/i
const CITE_WORDS = ['上游', '来自', '转自', '借自', '援自', '承接', 'by @', 'from @', 'per @', 'inherited']
const STOPWORDS = ['实现', '完成', '修复', '添加', '创建', '更新', '删除', '迁移', '重构', '部署', '解决', '处理', '支持', '问题', '功能', '模块']
const PATH_RE = /[\w./\\-]+\.[A-Za-z]{1,5}/
const SLASH_RE = /[\w-]+\/[\w./-]+/
const WORD_RE = /[\p{L}\p{N}_-]+/gu

/** 声明行判定：命中任一状形即 true。 */
export function isClaimLine(line) {
  const t = String(line ?? '')
  if (CHECK_RE.test(t) || FLAG_RE.test(t)) return true
  const low = t.toLowerCase()
  for (const w of ZHUANG_WORDS) {
    if (ZHUANG_WORDS.indexOf(w) < 11 ? t.includes(w) : low.includes(w)) return true
  }
  if (MILESTONE_RE.test(t)) return true
  return false
}

/** 掠据白：声明行含引用词（大小写不敏）。 */
export function isCited(line) {
  const low = String(line ?? '').toLowerCase()
  return CITE_WORDS.some((w) => low.includes(w))
}

/** 状键：剥符号/状词/引用词/停用词后的对象词元集合（径形保形、普通词元 ≥2）。 */
export function statusKeys(line) {
  let t = String(line ?? '').replace(/^\s*(?:[-*+]\s*)?(?:\[[xX]\]|✅|☑️|☑)\s*/u, ' ')
  for (const w of ZHUANG_WORDS) t = t.split(w).join(' ')
  for (const w of CITE_WORDS) t = t.split(w).join(' ')
  for (const w of STOPWORDS) t = t.split(w).join(' ')
  const keys = new Set()
  for (const m of t.matchAll(new RegExp(PATH_RE.source, 'g'))) {
    keys.add(m[0])
    t = t.split(m[0]).join(' ')
  }
  for (const m of t.matchAll(new RegExp(SLASH_RE.source, 'g'))) keys.add(m[0])
  for (const m of t.matchAll(WORD_RE)) {
    if (m[0].length >= 2) keys.add(m[0])
  }
  return [...keys]
}

/** 状账扫描：正文 → 声明行清单 [{ line, cited, keys }]（line 为 1 起行号）。 */
export function scanClaims(content) {
  const claims = []
  const lines = String(content ?? '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    if (!isClaimLine(lines[i])) continue
    claims.push({ line: i + 1, cited: isCited(lines[i]), keys: statusKeys(lines[i]) })
  }
  return claims
}

/** 作工面对账：状键任一词元（大小写归一）在任一作工词面中子串命中。 */
export function hasTrace(keys, workfaces) {
  for (const k of keys) {
    const kl = k.toLowerCase()
    for (const wf of workfaces) {
      if (wf.toLowerCase().includes(kl)) return true
    }
  }
  return false
}
