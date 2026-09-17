/**
 * 审言引擎 —— 见据记流内之见、写稿入传账、幻值判定（docs/03 §2/§6/§7/§8 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图（跨会话见据互证归离线合并审计）。
 *
 * 通道（docs/03 §2）：传账收全流（见据要目见/书见/验见三面）；判言只判写——write 族
 * p: ∧ isError !== true ∧ content 非空；isError === true 之写不入稿账（失败的写没落盘）、
 * null 按已发生；observe/exec/other 永不判言。无 content 之写（edit 族）无稿可判。
 *
 * 稿账：同径新写立稿（判词在 judge 时按当时全流见据现算——迟证是「见据在后于本笔」，
 * 后到的见据让案落为迟证注记，此为 docs/03 §6 的判定语义而非撤案）。
 *
 * 豁免（立案前）：证册 excuse glob ∪ 靶场名段 → 整稿不审不记。
 *
 * 判定序（docs/03 §7）：逐行——模态门 → 得言形 → 指物（径指物/自指/目录指物；
 * 全无 → 虚指注记）→ 逐指物对账：基径 → 见据三通道（先见清白 / 后见迟证 /
 * 无见立案：径指物幻言 +30，目录指物疑言 +15）。
 *
 * 幻值（docs/03 §8）：huan=min(60,30×幻言)+yi=min(40,15×疑言)，total=min(100)；
 * 分带 彰 0–14 / 疑 15–29 / 诞 ≥30；门默认 30——单幻言即红、双疑言即红、单疑言黄牌不咬门。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { globMatch } from './zhengce.js'
import { findDeyan, findZhiwu, isModal, djb2 } from './deyan.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '彰'
  if (total < 30) return '疑'
  return '诞'
}

/** 靶场名段（docs/03 §2，稿径含名段即豁免，立案前）：正则形 10（目录段在串首亦算段）。 */
const RANGE_FORMS = [
  /(?:^|\/)tests?\//,
  /(?:^|\/)specs?\//,
  /(?:^|\/)__tests__\//,
  /(?:^|\/)__mocks__\//,
  /(?:^|\/)fixtures\//,
  /(?:^|\/)debug\//,
  /\.test\./,
  /\.spec\./,
  /\.mock\./,
  /\.debug\./,
]

function inRange(path) {
  return RANGE_FORMS.some((re) => re.test(path))
}

/** 引擎装配：证册（免审 + 基径）→ 传账。无册（null）→ excuse/grounds 皆空——无册照判（凡言必据）。 */
export function createEngine({ book = null } = {}) {
  return {
    cfg: {
      excuse: (book?.excuse ?? []).map((g) => String(g)),
      grounds: (book?.grounds ?? []).map((g) => String(g)),
    },
    calls: [], // 全流调用（见据之源），record 序即流序
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
  if (engine.cfg.excuse.some((g) => globMatch(path, g))) return engine // 证册免审（立案前）
  if (inRange(path)) return engine // 靶场豁免（立案前）
  const lines = String(text).split(/\r?\n/)
  engine.drafts.set(path, {
    lines,
    rows: lines.filter((s) => s.trim()).length,
    writeIndex: engine.calls.length - 1, // 本笔在流内的序（见据先于本笔为据）
  }) // 新稿立撤：同径旧稿换下
  return engine
}

/** 见据对账（docs/03 §6）：流内序 < writeIndex 的成功事件为据；> 为迟证；皆无立案。 */
function evidenceOf(engine, path, writeIndex) {
  const target = normalizePath(path)
  for (let j = 0; j < engine.calls.length; j++) {
    const c = engine.calls[j]
    const fam = familyOf(c.name)
    if (fam === 'observe') {
      const k = objectKey(c.args, c.name)
      if (k.startsWith('p:') && normalizePath(k.slice(2)) === target && c.isError !== true) {
        if (j < writeIndex) return 'before'
        if (j > writeIndex) return 'after'
      }
    } else if (fam === 'write') {
      const k = objectKey(c.args, c.name)
      if (k.startsWith('p:') && normalizePath(k.slice(2)) === target && c.isError !== true) {
        if (j <= writeIndex) return 'before' // 先写为据；j === writeIndex 是本笔自身——本笔即据
        return 'after'
      }
    } else if (fam === 'exec') {
      const k = objectKey(c.args, c.name)
      if (k.startsWith('c:') && c.isError !== true && k.slice(2).includes(target)) {
        if (j < writeIndex) return 'before'
        if (j > writeIndex) return 'after'
      }
    }
  }
  return 'none'
}

/** 单稿判定（docs/03 §7 判定序）。返回 { cases, notes }；见据对账由 judge 传入引擎。 */
export function auditDraft(engine, path, draft) {
  const cases = []
  const notes = []
  for (let li = 0; li < draft.lines.length; li++) {
    const line = draft.lines[li]
    if (!line.trim()) continue
    if (isModal(line)) continue // 模态门：将然未然不判
    const deyan = findDeyan(line)
    if (deyan.length === 0) continue // 无得言形——不是断言（指路词/散文不涉）
    const { paths, dirs, self } = findZhiwu(line)
    const targets = []
    for (const p of paths) targets.push({ obj: p, kind: 'path' })
    if (self) targets.push({ obj: path, kind: 'self' })
    for (const d of dirs) targets.push({ obj: d, kind: 'dir' })
    if (targets.length === 0) {
      notes.push({ type: '虚指', line: li + 1 }) // 得言而无所指——无从对账（宁纵）
      continue
    }
    const seen = new Set()
    for (const t of targets) {
      const key = `${t.kind}:${t.obj}`
      if (seen.has(key)) continue // 同 token 重复命中只立一案
      seen.add(key)
      if (t.kind !== 'self' && engine.cfg.grounds.some((g) => globMatch(normalizePath(t.obj), g))) continue // 基径在册
      const ev = t.kind === 'self' ? 'before' : evidenceOf(engine, t.obj, draft.writeIndex)
      if (ev === 'before') continue // 先见清白（自指本笔即据）
      if (ev === 'after') {
        notes.push({ type: '迟证', line: li + 1, obj: t.obj }) // 后见补据——留痕 0 分
        continue
      }
      if (t.kind === 'dir') cases.push({ type: '疑言', line: li + 1, obj: t.obj, fp: djb2(line) })
      else cases.push({ type: '幻言', line: li + 1, obj: t.obj, fp: djb2(line) })
    }
  }
  return { cases, notes }
}

/** issues 行（锁死，docs/03 §7/§10）：案按 稿径→行→案别→指物，注记排其后（迟证 → 虚指）。 */
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
  const rank = { 幻言: 0, 疑言: 1 }
  const nrank = { 迟证: 0, 虚指: 1 }
  cases.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    if (a.line !== b.line) return a.line - b.line
    if (rank[a.type] !== rank[b.type]) return rank[a.type] - rank[b.type]
    if (a.obj !== b.obj) return a.obj < b.obj ? -1 : 1
    return 0
  })
  notes.sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1
    if (a.line !== b.line) return a.line - b.line
    if (nrank[a.type] !== nrank[b.type]) return nrank[a.type] - nrank[b.type]
    const ao = a.obj ?? ''
    const bo = b.obj ?? ''
    if (ao !== bo) return ao < bo ? -1 : 1
    return 0
  })
  const issues = []
  for (const c of cases) {
    if (c.type === '幻言') issues.push(`幻言：${c.path}:${c.line} 指物 ${c.obj}（指纹 ${c.fp}）`)
    else issues.push(`疑言：${c.path}:${c.line} 指物 ${c.obj}（指纹 ${c.fp}）`)
  }
  for (const n of notes) {
    if (n.type === '迟证') issues.push(`注记：${n.path}:${n.line} 迟证 指物 ${n.obj}（后见补据）`)
    else issues.push(`注记：${n.path}:${n.line} 虚指（得言无指物）`)
  }
  if (issues.length === 0) {
    issues.push(`言皆有据 ×${engine.drafts.size} 稿 ${rows} 行 —— 言必有据，指物在先`)
  }
  return { issues, rows }
}

/** 判定：幻值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const counts = { hy: 0, yy: 0, cz: 0, xz: 0 }
  const cases = []
  const notes = []
  let rows = 0
  for (const [path, d] of engine.drafts) {
    rows += d.rows
    const res = auditDraft(engine, path, d)
    for (const c of res.cases) {
      cases.push({ path, ...c })
      if (c.type === '幻言') counts.hy++
      else counts.yy++
    }
    for (const n of res.notes) {
      notes.push({ path, ...n })
      if (n.type === '迟证') counts.cz++
      else counts.xz++
    }
  }
  const score = {
    huan: Math.min(60, 30 * counts.hy),
    yi: Math.min(40, 15 * counts.yy),
  }
  score.total = Math.min(100, score.huan + score.yi)
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
