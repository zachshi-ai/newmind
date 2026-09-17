/**
 * 弃责词法 —— 责面形、弃责形、否定卫、镜形、对象词元（docs/03 §3–§5/§7 锁死），
 * 全部显式词表，零 LLM。
 *
 * 判定单位是行：弃责形命中方成弃责行；否定卫行级拦下（如实否述不入罪）；
 * 对象词元走整行遮蔽切词（弃责对象双向在场——形前形后皆可，宽进宽出）。
 */

// ---- 责面形（受审径法，docs/03 §3）-----------------------------------------

/** 责面形 10（规整径小写化后子串命中）。 */
export const ZEMIAN = [
  'report', 'summary', 'retro', 'postmortem', 'handoff',
  '复盘', '报告', '总结', '纪要', '交接',
]

export function isZemian(path, { shapes = [], noDefaults = false } = {}) {
  const s = String(path ?? '').toLowerCase()
  if (shapes.some((f) => s.includes(String(f).toLowerCase()))) return true
  if (noDefaults) return false
  return ZEMIAN.some((f) => s.includes(f))
}

// ---- 弃责形（责任切割之词迹，行级）------------------------------------------

/** 中文形 10（子串命中）。 */
export const QIZE_ZH = [
  '历史遗留', '本来就有', '非本次引入', '先前已存在', '之前就存在',
  '与本次无关', '与本次任务无关', '不属于本次', '不在范围内', '超出范围',
]

/** 英文形 15（词界，大小写不敏感；数组序仅定枚举，首形取行内最先）。 */
export const QIZE_EN = [
  'pre-existing', 'preexisting', 'existing failure', 'already broken',
  'already failing', 'legacy issue', 'historical issue', 'out of scope',
  'not in scope', 'beyond scope', 'unrelated to', 'not related to',
  'flaky', 'wontfix', "won't fix",
]

const QIZE_EN_RES = QIZE_EN.map((f) => new RegExp(`\\b${f.replace(/\s+/g, '\\s+')}\\b`, 'i'))

/**
 * 行内弃责形提取：返回首个命中 { form, index, len }——中英皆扫，取行内最先出现者
 * （index 最小，同位取长者），一行多形只取首形，行=案。无命中返回 null。
 */
export function findQize(line) {
  let best = null
  for (const f of QIZE_ZH) {
    const idx = line.indexOf(f)
    if (idx === -1) continue
    if (!best || idx < best.index || (idx === best.index && f.length > best.len)) {
      best = { form: f, index: idx, len: f.length }
    }
  }
  for (let i = 0; i < QIZE_EN.length; i++) {
    const m = QIZE_EN_RES[i].exec(line)
    if (!m) continue
    const idx = m.index
    const len = m[0].length
    if (!best || idx < best.index || (idx === best.index && len > best.len)) {
      best = { form: QIZE_EN[i], index: idx, len }
    }
  }
  return best
}

// ---- 否定卫（如实否述不入罪，行级，docs/03 §5）------------------------------

/** 中文否定词 5（形前紧邻 0–3 字符内子串命中——容三字否定词「不存在」）。 */
export const FOUDING_ZH = ['无', '没有', '并非', '不是', '不存在']

/** 英文否定词 3（形前紧邻词，词界，大小写不敏感）。 */
export const FOUDING_EN = ['no', 'not', 'never']

const FOUDING_EN_RE = /\b(no|not|never)[\s,;:]*$/i

/** 否定卫：弃责形命中位之前紧邻否定词 → 整行不判（宁纵；窗口 0–3 字符——容三字否定词「不存在」）。 */
export function hasNegationGuard(line, hit) {
  const window = line.slice(Math.max(0, hit.index - 3), hit.index)
  if (FOUDING_ZH.some((w) => window.includes(w))) return true
  return FOUDING_EN_RE.test(line.slice(0, hit.index))
}

// ---- 镜形（基线对照命令的词迹，docs/03 §7）----------------------------------

/** 镜形（命令原文小写化后子串命中，成败皆算）。 */
export const JINGXING = ['git stash', 'git checkout', 'git switch', 'baseline', '基线', '对照']

export function isJingxing(command) {
  const s = String(command ?? '').toLowerCase()
  return JINGXING.some((f) => s.includes(f))
}

// ---- 对象词元（docs/03 §5）--------------------------------------------------

/** 英文停词 26（大小写不敏感全等）。 */
const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'is', 'was', 'are', 'were', 'be',
  'to', 'for', 'in', 'on', 'with', 'that', 'this', 'it', 'not', 'when',
  'but', 'as', 'at', 'by', 'from',
])

const TOKEN_RE = /[A-Za-z0-9_\-./@]+/g
const CJK_RE = /[^\u4e00-\u9fff]/g

/** 把命中形与否定词从行中遮蔽掉（替换为空白），保其余词面完好。 */
function maskLine(line) {
  let s = line
  for (const f of QIZE_ZH) s = s.split(f).join(' ')
  for (const f of QIZE_EN) s = s.replace(new RegExp(`\\b${f.replace(/\s+/g, '\\s+')}\\b`, 'gi'), ' ')
  for (const w of FOUDING_ZH) s = s.split(w).join(' ')
  s = s.replace(/\b(?:no|not|never)\b/gi, ' ')
  return s
}

/**
 * 对象词元提取（ASCII 路 only，docs/03 §5）：整行遮蔽全部命中形与否定词后按
 * `[A-Za-z0-9_\-./@]+` 切词，剥尾点；过滤停词/纯数字/长 <2（路径形 token 含
 * `./_@-` 者保留）。CJK 词元不入对账（跨语言词面不可对账——宁纵）。
 */
export function tokensOf(line) {
  const text = maskLine(String(line ?? ''))
  const tokens = []
  const seen = new Set()
  for (const m of text.matchAll(TOKEN_RE)) {
    const t = m[0].replace(/\.+$/, '')
    if (t.length < 2) continue
    if (!/[./_\-@]/.test(t)) {
      if (t.length < 3) continue
      if (/^\d+$/.test(t)) continue
      if (STOP.has(t.toLowerCase())) continue
    }
    if (!seen.has(t)) {
      seen.add(t)
      tokens.push(t)
    }
  }
  return tokens
}

// ---- 指纹 -----------------------------------------------------------------

/** djb2 指纹（案的断言数据，不是行原文——掩码是结构性保证）。 */
export function djb2(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
