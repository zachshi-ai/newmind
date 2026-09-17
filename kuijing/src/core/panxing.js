/**
 * 判言词法 —— 判面形、判形四族、褒形、否定卫、对象词元（docs/03 §3–§5/§8 锁死），
 * 全部显式词表，零 LLM。
 *
 * 判定单位是行：判形四族命中方成判行（可形/靖形 +1，否形/虞形 −1；一行只取首形——
 * 行内最先出现者，同位取长者；显式否形起位先于裸形，自带极性不受卫累）；
 * 否定卫行级拦下（如实否述不入罪）；褒形独立副扫不占首形（只为谀断供「誉」件）；
 * 对象词元走整行遮蔽切词（判言对象双向在场——形前形后皆可，宽进宽出）。
 */

// ---- 判面形（受审径法，docs/03 §3）-----------------------------------------

/** 判面形 10（规整径小写化后子串命中）。 */
export const PANMIAN = [
  'review', 'assessment', 'proposal', 'decision', 'verdict',
  '评估', '评审', '方案', '建议', '决策',
]

export function isPanmian(path, { shapes = [], noDefaults = false } = {}) {
  const s = String(path ?? '').toLowerCase()
  if (shapes.some((f) => s.includes(String(f).toLowerCase()))) return true
  if (noDefaults) return false
  return PANMIAN.some((f) => s.includes(f))
}

// ---- 判形四族（立场词迹，行级，极性锁死）------------------------------------

/** 可形（正判 +1）：中文 6（子串命中）∪ 英文 7（词界，大小写不敏感）。 */
export const KE_ZH = ['可行', '建议采用', '可以采用', '推荐采用', '建议采纳', '可以采纳']
export const KE_EN = ['viable', 'feasible', 'recommend', 'recommended', 'approve', 'approved', 'adopt']

/** 否形（反判 −1）：中文 7 ∪ 英文 11（显式负形起位先于裸形，不入卫）。 */
export const FOU_ZH = ['不可行', '不建议采用', '不可以采用', '不推荐', '不宜采用', '否决', '不可采纳']
export const FOU_EN = [
  'not viable', 'not feasible', 'not recommended', 'not recommend',
  'cannot recommend', 'cannot adopt', 'no longer viable', 'no longer feasible',
  'reject', 'rejected', 'veto',
]

/** 虞形（风险之言 −1）：中文 6 ∪ 英文 7。 */
export const YU_ZH = ['有风险', '存在风险', '有隐患', '存在隐患', '有缺陷', '存在缺陷']
export const YU_EN = ['risky', 'has risk', 'at risk', 'carries risk', 'has flaw', 'has defect', 'caveat']

/** 靖形（放行之言 +1）：中文 7 ∪ 英文 8。 */
export const JING_ZH = ['无风险', '没有风险', '风险已排除', '隐患已排除', '无隐患', '无缺陷', '缺陷已排除']
export const JING_EN = [
  'no risk', 'without risk', 'risk cleared', 'risk resolved',
  'flaw fixed', 'defect fixed', 'issue resolved', 'no blocker',
]

const FAMILIES = [
  { key: 'ke', zh: KE_ZH, en: KE_EN, pol: 1 },
  { key: 'fou', zh: FOU_ZH, en: FOU_EN, pol: -1 },
  { key: 'yu', zh: YU_ZH, en: YU_EN, pol: -1 },
  { key: 'jing', zh: JING_ZH, en: JING_EN, pol: 1 },
]

const EN_RES = new Map()
for (const f of FAMILIES) {
  EN_RES.set(
    f.key,
    f.en.map((x) => new RegExp(`\\b${x.replace(/\s+/g, '\\s+')}\\b`, 'i'))
  )
}

/**
 * 行内判形首形提取：四族皆扫，取行内最先出现者（index 最小，同位取长者）。
 * 返回 { family, form, index, len, polarity }；无命中返回 null。
 */
export function findPanxing(line) {
  let best = null
  for (const f of FAMILIES) {
    for (const form of f.zh) {
      const idx = line.indexOf(form)
      if (idx === -1) continue
      if (!best || idx < best.index || (idx === best.index && form.length > best.len)) {
        best = { family: f.key, form, index: idx, len: form.length, polarity: f.pol }
      }
    }
    const res = EN_RES.get(f.key)
    for (let i = 0; i < f.en.length; i++) {
      const m = res[i].exec(line)
      if (!m) continue
      const idx = m.index
      const len = m[0].length
      if (!best || idx < best.index || (idx === best.index && len > best.len)) {
        best = { family: f.key, form: f.en[i], index: idx, len, polarity: f.pol }
      }
    }
  }
  return best
}

// ---- 褒形（赞誉副扫，谀断之「誉」件，docs/03 §8）----------------------------

/** 褒形：中文 6（子串）∪ 英文 6（词界）——不占首形、无极性。 */
export const BAO_ZH = ['完善', '成熟', '优雅', '严谨', '扎实', '可靠']
export const BAO_EN = ['excellent', 'perfect', 'flawless', 'solid', 'mature', 'elegant']

const BAO_EN_RES = BAO_EN.map((f) => new RegExp(`\\b${f}\\b`, 'i'))

/** 褒形在场（独立副扫，不与判形争位）。 */
export function hasBaoxing(line) {
  if (BAO_ZH.some((f) => line.includes(f))) return true
  return BAO_EN_RES.some((re) => re.test(line))
}

// ---- 否定卫（如实否述不入罪，行级，docs/03 §5）------------------------------

/** 中文卫词 6（形前紧邻 0–3 字符内子串命中——容三字否定词「并非/不是」）。 */
export const FOUDING_ZH = ['无', '没有', '并非', '不是', '非', '未']

/** 英文卫词 4（形前紧邻词，词界，大小写不敏感）。 */
export const FOUDING_EN = ['no', 'not', 'never', 'cannot']

const FOUDING_EN_RE = /\b(no|not|never|cannot)[\s,;:]*$/i

/** 否定卫：判形命中位之前紧邻卫词 → 整行不判（宁纵；窗口 0–3 字符）。 */
export function hasNegationGuard(line, hit) {
  const window = line.slice(Math.max(0, hit.index - 3), hit.index)
  if (FOUDING_ZH.some((w) => window.includes(w))) return true
  return FOUDING_EN_RE.test(line.slice(0, hit.index))
}

// ---- 对象词元（docs/03 §5）--------------------------------------------------

/** 英文停词 37（大小写不敏感全等）：26 基表 ∪ no/never/cannot/without/will/would/should/plan/we/our/us。 */
const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'is', 'was', 'are', 'were', 'be',
  'to', 'for', 'in', 'on', 'with', 'that', 'this', 'it', 'not', 'when',
  'but', 'as', 'at', 'by', 'from',
  'no', 'never', 'cannot', 'without', 'will', 'would', 'should', 'plan',
  'we', 'our', 'us',
])

const TOKEN_RE = /[A-Za-z0-9_\-./@]+/g

/** 把全部命中形（四族 ∪ 褒形）与卫词从行中遮蔽掉（替换为空白），保其余词面完好。 */
function maskLine(line) {
  let s = line
  for (const f of FAMILIES) {
    for (const form of f.zh) s = s.split(form).join(' ')
    const res = EN_RES.get(f.key)
    for (let i = 0; i < f.en.length; i++) s = s.replace(res[i], ' ')
  }
  for (const f of BAO_ZH) s = s.split(f).join(' ')
  for (const re of BAO_EN_RES) s = s.replace(re, ' ')
  for (const w of FOUDING_ZH) s = s.split(w).join(' ')
  s = s.replace(/\b(?:no|not|never|cannot)\b/gi, ' ')
  return s
}

/**
 * 对象词元提取（ASCII 路 only，docs/03 §5）：整行遮蔽全部命中形与卫词后按
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
