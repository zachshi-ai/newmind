/**
 * 归因词法 —— 诊面形、归因形、推词门、指代形、果词、因面词元（docs/03 §3–§7 锁死），
 * 全部显式词表，零 LLM。
 *
 * 判定单位是行：归因形命中方成归因行；推词门行级降档（疑而后言不入罪）；
 * 指代形走因面前缀判定（「根因如下」无从对账，泛因注记）。
 */

// ---- 诊面形（受审径法，docs/03 §3）---------------------------------------

/** 诊面形 14（规整径小写化后子串命中）。 */
export const ZHENMIAN = [
  'postmortem', 'post-mortem', 'incident', 'rca', 'root-cause', 'rootcause',
  'root_cause', 'diagnosis', 'diagnostic', 'debrief',
  '复盘', '根因', '排查', '诊断',
]

export function isZhenmian(path) {
  const s = String(path ?? '').toLowerCase()
  return ZHENMIAN.some((f) => s.includes(f))
}

// ---- 归因形（因果断言之词迹，前向——因面在形后）---------------------------

/** 中文前向形 12（子串命中）。 */
export const GUIYIN_ZH = [
  '根因', '原因在于', '原因是', '原因出在', '问题出在', '问题在于',
  '问题源于', '症结', '归因于', '成因', '诱因', '是因为',
]

/** 英文前向形 9（词界，大小写不敏感）。 */
export const GUIYIN_EN = [
  'root cause', 'caused by', 'due to', 'because of', 'the reason is',
  'resulted from', 'stemmed from', 'attributed to', 'underlying cause',
]

const GUIYIN_EN_RES = GUIYIN_EN.map((f) => new RegExp(`\\b${f.replace(/\s+/g, '\\s+')}\\b`, 'i'))

/**
 * 行内归因形提取：返回首个命中 { form, index, len }——中英皆扫，取 index 最小者，
 * 同位取长者（一行多形只取首形，行=案）。无命中返回 null。
 */
export function findGuiyin(line) {
  let best = null
  for (const f of GUIYIN_ZH) {
    const idx = line.indexOf(f)
    if (idx === -1) continue
    if (!best || idx < best.index || (idx === best.index && f.length > best.len)) {
      best = { form: f, index: idx, len: f.length }
    }
  }
  for (let i = 0; i < GUIYIN_EN.length; i++) {
    const m = GUIYIN_EN_RES[i].exec(line)
    if (!m) continue
    const idx = m.index
    const len = m[0].length
    if (!best || idx < best.index || (idx === best.index && len > best.len)) {
      best = { form: GUIYIN_EN[i], index: idx, len }
    }
  }
  return best
}

// ---- 推词门（疑而后言不入罪，行级，docs/03 §6）-----------------------------

/** 中文推词 12（子串命中）。 */
export const TUI_ZH = [
  '可能', '或许', '也许', '大概', '疑似', '怀疑', '猜测', '推测', '估计',
  '待验证', '未验证', '假设',
]

/** 英文推词 12（词界，大小写不敏感）。 */
export const TUI_EN = [
  'may', 'might', 'possibly', 'perhaps', 'probably', 'suspect', 'suspected',
  'guess', 'speculation', 'hypothesis', 'unverified', 'unconfirmed',
]

const TUI_EN_RES = TUI_EN.map((w) => new RegExp(`\\b${w}\\b`, 'i'))

/** 行级推词门：命中任一推词 → 整行降显疑注记。 */
export function hasTui(line) {
  if (TUI_ZH.some((w) => line.includes(w))) return true
  return TUI_EN_RES.some((re) => re.test(line))
}

// ---- 指代形（因面前缀判定，docs/03 §5）-------------------------------------

/** 中文指代形 4（因面前缀）。 */
export const ZHIDAI_ZH = ['见下', '如下', '下文', '上文']

/** 英文指代形 2（词界前缀，大小写不敏感）。 */
export const ZHIDAI_EN = ['see below', 'tbd']

const ZHIDAI_EN_RES = ZHIDAI_EN.map((f) => new RegExp(`^${f.replace(/\s+/g, '\\s+')}\\b`, 'i'))

const LEADING_JUNK = /^[\s:：，,。.；;、！!？?\-—>*#]+/

/** 因面前缀判定：剥前导标点空白后以指代形开头 → 泛因。 */
export function isZhidaiQianzhui(yinmian) {
  const clean = String(yinmian ?? '').replace(LEADING_JUNK, '')
  if (ZHIDAI_ZH.some((w) => clean.startsWith(w))) return true
  return ZHIDAI_EN_RES.some((re) => re.test(clean))
}

// ---- 果词（重演通道的果之词迹，docs/03 §7）---------------------------------

/** 英文果词 9（词界，大小写不敏感）。 */
export const GUO_EN = ['error', 'fail', 'failed', 'exception', 'timeout', 'crash', 'panic', 'denied', 'refused']

/** 中文果词 6（子串命中）。 */
export const GUO_ZH = ['异常', '报错', '失败', '错误', '超时', '崩溃']

const GUO_EN_RES = GUO_EN.map((w) => new RegExp(`\\b${w}\\b`, 'i'))

/** 文本内果词命中。 */
export function hasGuo(text) {
  const s = String(text ?? '')
  if (GUO_ZH.some((w) => s.includes(w))) return true
  return GUO_EN_RES.some((re) => re.test(s))
}

// ---- 因面词元（docs/03 §5）-------------------------------------------------

/** 英文停词 26（大小写不敏感全等）。 */
const STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'is', 'was', 'are', 'were', 'be',
  'to', 'for', 'in', 'on', 'with', 'that', 'this', 'it', 'not', 'when',
  'but', 'as', 'at', 'by', 'from',
])

const TOKEN_RE = /[A-Za-z0-9_\-./@]+/g
const CJK_SEG_SPLIT = /[^\u4e00-\u9fff]+/
const LEADING_PUNCT = /^[\s:：，,。.；;、！!？?\-—>、]+/

/**
 * 因面词元提取（ASCII 路 ∪ CJK 路并集去重，保序）：
 *   ASCII：token 剥尾点，过滤停词/纯数字/长 <2；
 *   CJK：挖掉 ASCII token 后余文按非汉字切段（bigram 不跨段——「缓存。重启」
 *   不出「存重」假窗），段内汉字 bigram 滑窗（段长 ≥2 方出窗）。
 */
export function tokensOf(yinmian) {
  const text = String(yinmian ?? '')
  const tokens = []
  const seen = new Set()
  const push = (t) => {
    if (t && !seen.has(t)) {
      seen.add(t)
      tokens.push(t)
    }
  }
  const pieces = []
  let last = 0
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index > last) pieces.push(text.slice(last, m.index))
    last = m.index + m[0].length
    const t = m[0].replace(/\.+$/, '')
    if (t.length < 2) continue
    if (/^\d+$/.test(t)) continue
    if (STOP.has(t.toLowerCase())) continue
    push(t)
  }
  if (last < text.length) pieces.push(text.slice(last))
  for (const seg of pieces.join(' ').split(CJK_SEG_SPLIT)) {
    for (let i = 0; i + 1 < seg.length; i++) push(seg.slice(i, i + 2))
  }
  return tokens
}

/** 因面提取：归因形之后的内容，剥前导空白与标点冒号。 */
export function extractYinmian(line, hit) {
  return line.slice(hit.index + hit.len).replace(LEADING_PUNCT, '')
}

// ---- 指纹 -----------------------------------------------------------------

/** djb2 指纹（案的断言数据，不是行原文——掩码是结构性保证）。 */
export function djb2(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}
