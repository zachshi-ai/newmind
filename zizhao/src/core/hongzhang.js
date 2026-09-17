/**
 * 红账引擎 —— 责账记流内之红与凭、责面稿入责账、照值判定（docs/03 §2/§7/§8/§9 锁死），
 * 全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图（跨会话红账与镜凭互认归离线合并审计）。
 *
 * 通道（docs/03 §2）：责账收全流（红账镜凭要 exec 面，思短要 exec 面）；判弃责只判写——
 * write 族 p: ∧ isError !== true ∧ content 非空 ∧ 规整径命中责面形；isError === true
 * 之写不入稿账（失败的写没落盘）、null 按已发生；observe/exec/other 永不判弃责。
 * 无 content 之写（edit 族）无稿可判。责面外之稿不审不记。
 *
 * 稿账：同径新写立责稿（判词在 judge 时按当时全流红账现算——思短是「更在弃后」，
 * 此为 docs/03 §7 的判定语义：弃后自更优先于护短，鼓励更）。
 *
 * 豁免（立案前）：照册 allow glob ∪ 练场名段 → 整稿不审不记。
 *
 * 判定序（docs/03 §8）：逐行——弃责形 → 否定卫（整行不判）→ 对象词元空（泛弃注记）→
 * 镜凭清白 / 思短注记 / 红账在场（护短 +30）/ 红账查无（虚弃注记；每行至多一案）。
 *
 * 照值（docs/03 §9）：hu=min(60,30×护短)，total=min(100)；
 * 分带 明 0–14 / 暗 15–29 / 盲 ≥30（暗带 v1 恒空）；门默认 30——单护短即红。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { globMatch } from './zhaoce.js'
import { isZemian, findQize, hasNegationGuard, tokensOf, isJingxing, djb2 } from './zexing.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '明'
  if (total < 30) return '暗'
  return '盲'
}

/** 练场名段（docs/03 §2，稿径含名段即豁免，立案前）：正则形 13（目录段在径首亦算段）。 */
const RANGE_FORMS = [
  /(?:^|\/)tests?\//,
  /(?:^|\/)specs?\//,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)__mocks__\//,
  /(?:^|\/)fixtures\//,
  /(?:^|\/)scratch\//,
  /(?:^|\/)drafts?\//,
  /(?:^|\/)wip\//,
  /(?:^|\/)sandbox\//,
  /(?:^|\/)demos?\//,
  /(?:^|\/)notes?\//,
  /\.test\./,
  /\.spec\./,
]

function inRange(path) {
  return RANGE_FORMS.some((re) => re.test(path))
}

/** 引擎装配：照册（免审）→ 责账。无册（null）→ allow 为空——无册照判（凡弃必凭）。 */
export function createEngine({ book = null } = {}) {
  return {
    cfg: {
      allow: (book?.allow ?? []).map((g) => String(g)),
      shapes: (book?.shapes ?? []).map((g) => String(g)),
      noDefaults: book?.noDefaults === true,
    },
    calls: [], // 全流调用（红账镜凭之源），record 序即流序
    drafts: new Map(), // 规整稿径 → { lines, rows, writeIndex }（同径最近带文之写）
  }
}

/** 记一笔调用（唯一写入口）。 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  engine.calls.push({ session, ref, name, args, isError, content })
  if (familyOf(name) !== 'write') return engine
  const key = objectKey(args, name)
  if (!key.startsWith('p:')) return engine
  if (isError === true) return engine // 失败的写没落盘
  const path = normalizePath(key.slice(2))
  const text = typeof args?.content === 'string' ? args.content : null
  if (text === null || text.length === 0) return engine // 无稿可判
  if (engine.cfg.allow.some((g) => globMatch(path, g))) return engine // 照册免审（立案前）
  if (inRange(path)) return engine // 练场豁免（立案前）
  if (!isZemian(path, engine.cfg)) return engine // 责面门：非交付文书不审不记
  const lines = String(text).split(/\r?\n/)
  engine.drafts.set(path, {
    lines,
    rows: lines.filter((s) => s.trim()).length,
    writeIndex: engine.calls.length - 1, // 本笔在流内的序（红账镜凭先于本笔为据）
  }) // 新稿立撤：同径旧稿换下
  return engine
}

/** exec 词面（红账/镜凭/思短的查证面）：命令原文 + 结果正文。 */
function execText(c) {
  const key = objectKey(c.args, c.name)
  const parts = []
  if (key.startsWith('c:')) parts.push(key.slice(2))
  if (typeof c.content === 'string' && c.content.length > 0) parts.push(c.content)
  return { command: key.startsWith('c:') ? key.slice(2) : '', text: parts.join('\n') }
}

function hitsToken(text, tokens) {
  return tokens.some((t) => text.includes(t))
}

/**
 * 凭据对账（docs/03 §7）：红账镜凭只认流内序 < writeIndex 的 exec，思短只认 > writeIndex
 * 的成功 exec。返回 { jing, si, hong }。镜凭成败皆算——基线照出的红恰是证据本身。
 */
function evidenceOf(engine, tokens, writeIndex) {
  let jing = false
  let si = false
  let hong = false
  for (let j = 0; j < engine.calls.length; j++) {
    const c = engine.calls[j]
    if (familyOf(c.name) !== 'exec') continue
    const { command, text } = execText(c)
    if (j < writeIndex) {
      if (isJingxing(command) && hitsToken(text, tokens)) jing = true
      if (c.isError === true && hitsToken(text, tokens)) hong = true
    } else if (j > writeIndex) {
      if (c.isError !== true && hitsToken(text, tokens)) si = true
    }
  }
  return { jing, si, hong }
}

/** 单责稿判定（docs/03 §8 判定序）。返回 { cases, notes }。 */
export function auditDraft(engine, path, draft) {
  const cases = []
  const notes = []
  for (let li = 0; li < draft.lines.length; li++) {
    const line = draft.lines[li]
    if (!line.trim()) continue
    const hit = findQize(line)
    if (!hit) continue // 无弃责形——不是责任切割
    if (hasNegationGuard(line, hit)) continue // 否定卫：如实否述不入罪
    const tokens = tokensOf(line)
    if (tokens.length === 0) {
      notes.push({ type: '泛弃', line: li + 1 }) // 弃之无物——无从对账（宁纵）
      continue
    }
    const ev = evidenceOf(engine, tokens, draft.writeIndex)
    if (ev.jing) notes.push({ type: '镜凭', line: li + 1 }) // 照过镜再说短——人欲自照必须明镜
    else if (ev.si) notes.push({ type: '思短', line: li + 1 }) // 弃后自更——鼓励更
    else if (ev.hong) cases.push({ type: '护短', line: li + 1, fp: djb2(line) }) // 红在而责卸
    else notes.push({ type: '虚弃', line: li + 1 }) // 红之不在场——宁纵不诬
  }
  return { cases, notes }
}

/** issues 行（锁死，docs/03 §8/§11）：案按 稿径→行→案别，注记排其后（镜凭 → 思短 → 泛弃 → 虚弃）。 */
export function issuesOf(engine) {
  const cases = []
  const notes = []
  let rows = 0
  for (const [path, d] of engine.drafts) {
    rows += d.rows
    const res = auditDraft(engine, path, d)
    for (const c of res.cases) cases.push({ path, ...c })
    for (const n of res.notes) notes.push({ path, ...n })
  }
  const rank = { 护短: 0 }
  const nrank = { 镜凭: 0, 思短: 1, 泛弃: 2, 虚弃: 3 }
  cases.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    if (a.line !== b.line) return a.line - b.line
    if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type]
    return 0
  })
  notes.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    if (a.line !== b.line) return a.line - b.line
    if (nrank[a.type] !== nrank[b.type]) return nrank[a.type] - nrank[b.type]
    return 0
  })
  const issues = []
  for (const c of cases) {
    issues.push(`${c.type}：${c.path}:${c.line}（指纹 ${c.fp}）`)
  }
  for (const n of notes) {
    if (n.type === '镜凭') issues.push(`注记：${n.path}:${n.line} 镜凭（基线在先）`)
    else if (n.type === '思短') issues.push(`注记：${n.path}:${n.line} 思短（弃后自更）`)
    else if (n.type === '泛弃') issues.push(`注记：${n.path}:${n.line} 泛弃（弃之无物）`)
    else issues.push(`注记：${n.path}:${n.line} 虚弃（红之不在场）`)
  }
  if (issues.length === 0) {
    issues.push(`责皆有凭 ×${engine.drafts.size} 稿 ${rows} 行 —— 凡弃必凭，照镜再弃`)
  }
  return { issues, rows }
}

/** 判定：照值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const counts = { hd: 0, sg: 0, fq: 0, xq: 0, mp: 0 }
  const cases = []
  const notes = []
  let rows = 0
  for (const [path, d] of engine.drafts) {
    rows += d.rows
    const res = auditDraft(engine, path, d)
    for (const c of res.cases) {
      cases.push({ path, ...c })
      counts.hd++
    }
    for (const n of res.notes) {
      notes.push({ path, ...n })
      if (n.type === '镜凭') counts.mp++
      else if (n.type === '思短') counts.sg++
      else if (n.type === '泛弃') counts.fq++
      else counts.xq++
    }
  }
  const score = {
    hu: Math.min(60, 30 * counts.hd),
  }
  score.total = Math.min(100, score.hu)
  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'
  const issued = issuesOf(engine)
  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    paths: engine.drafts.size,
    rows,
    counts,
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    issues: issued.issues,
    cases,
    notes,
  }
}
