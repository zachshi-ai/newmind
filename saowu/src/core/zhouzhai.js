/**
 * 帚账引擎 —— 落笔入账与垢值判定（docs/03 §2/§6/§7 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图，合审归并归离线合并审计。
 *
 * 入口滤（先于一切）：isError === true 一律不入账——失败的写没落盘，不生帚账
 * 也不生无文之痕（等同未发生）；isError 未知（null，老流）按已发生。
 *
 * 帚账唯写（docs/03 §2）：write 族成功 ∧ args.content 非空 → 帚账（每径末笔为
 * 末卷，扫末卷出案）；content 为空只记无文之痕（帚账不前的凭据）；观察不入账
 * （读取不撒垢）；exec 是黑盒。
 *
 * 判定序锁死（docs/03 §6）：立案前豁免（留册 retain ∪ 试验场名段）→ 无末卷
 * 静默 → 扫末卷（一处一行，针优先）→ 已扫注记（末卷 0 处 ∧ 先前帚账 ≥1 处）
 * → 帚账不前注记（末卷后无文之痕，案照出账止于末卷）→ 全洁。
 *
 * 垢值锁死（docs/03 §7）：gou = min(60, 30 × 遗针处) + min(40, 15 × 遗屑处)；
 * 分带 洁 0–14 / 蒙 15–29 / 垢 ≥30；门默认 30——单针即红、双屑即红、单屑黄牌。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { scanContent, globMatch, grounded } from './gouxing.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '洁'
  if (total < 30) return '蒙'
  return '垢'
}

/** 引擎装配：留册（retain 豁免 / forms 增形 / noDefaults）→ 帚账。无册（null）→ 无豁免全扫 + 默认形表。 */
export function createEngine({ book = null } = {}) {
  return {
    cfg: {
      retain: (book?.retain ?? []).map((g) => String(g)),
      forms: Array.isArray(book?.forms) ? book.forms.map((s) => String(s)) : [],
      noDefaults: book?.noDefaults === true,
    },
    calls: [],
    seq: 0,
    scans: new Map(), // 规整径 → [{seq, session, ref, content}]（seq 递增序）
    marks: new Map(), // 规整径 → [{seq}]（无文之痕）
  }
}

function allowed(cfg, path) {
  if (cfg.retain.some((g) => globMatch(path, g))) return true
  if (grounded(path)) return true
  return false
}

/**
 * 记一笔调用（唯一写入口）。观察永不反噬：本函数不抛。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  engine.calls.push({ session, ref, name, args, isError, content })
  if (isError === true) return engine // 入口滤：失败的写没落盘
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'write' && key.startsWith('p:')) {
    const path = normalizePath(key.slice(2))
    if (allowed(engine.cfg, path)) return engine // 立案前豁免：留册许留 ∪ 试验场
    const text = typeof args?.content === 'string' ? args.content : null
    if (text !== null && text.length > 0) {
      const seq = ++engine.seq
      const list = engine.scans.get(path) ?? []
      list.push({ seq, session, ref, content: text })
      engine.scans.set(path, list)
    } else {
      // 无文之写：不生末卷，只留无文之痕（帚账不前的凭据）
      const seq = ++engine.seq
      const list = engine.marks.get(path) ?? []
      list.push({ seq })
      engine.marks.set(path, list)
    }
    return engine
  }

  return engine // observe（读取不撒垢）/ exec 黑盒 / other 族：不入账
}

/**
 * 对单径判定（docs/03 §6 判定序）。scans 按序（seq 递增），marks 为该径无文之痕。
 * 返回 { findings: [{seq, line, kind, name}], sao: {count} | null, qian: {gap} | null }。
 */
export function settlePath(scans, marks, engine) {
  if (scans.length === 0) return { findings: [], sao: null, qian: null }
  const last = scans[scans.length - 1] // 末卷：末笔帚账
  const findings = []
  for (const hit of scanHits(last.content, engine)) findings.push({ seq: last.seq, ...hit })
  let sao = null
  if (findings.length === 0) {
    let hist = 0
    for (let t = 0; t < scans.length - 1; t++) hist += scanHits(scans[t].content, engine).length
    if (hist > 0) sao = { count: hist } // 已扫：曾撒今扫，净向注记
  }
  let qian = null
  const gap = marks.filter((mk) => mk.seq > last.seq).length
  if (gap > 0) qian = { gap } // 帚账不前：判定止于末卷
  return { findings, sao, qian }
}

/** 扫卷助手（引擎 cfg 注入的形表口径）。 */
function scanHits(content, engine) {
  const cfg = engine?.cfg ?? {}
  return scanContent(content, { forms: cfg.forms, noDefaults: cfg.noDefaults })
}

/** issues 行序（锁死，docs/03 §9）：遗针 → 遗屑 → 已扫 → 帚账不前 → 全洁。 */
export function issuesOf(findings, notes, paths) {
  const issues = []
  const order = ['zhen', 'xie']
  const label = { zhen: '遗针', xie: '遗屑' }
  for (const kind of order) {
    for (const f of findings) {
      if (f.kind !== kind) continue
      issues.push(`${label[kind]}：${f.path}:${f.line}（${f.name}）`)
    }
  }
  for (const n of notes) {
    if (n.sao) issues.push(`已扫：${n.path}（曾撒 ${n.sao.count} 处，末卷已净）`)
  }
  for (const n of notes) {
    if (n.qian) issues.push(`帚账不前：${n.path}（末卷后无文之写 ${n.qian.gap} 笔，判定止于末卷）`)
  }
  if (issues.length === 0) issues.push(`帚过皆洁 ×${paths ?? 0} —— 末卷无垢，帚下留净`)
  return issues
}

/** 逐径判定（唯一判定点）：按规整径字典序出 findings 与注记，行序在 issuesOf 锁死。 */
export function settleAll(engine) {
  const pathsSet = new Set([...engine.scans.keys(), ...engine.marks.keys()])
  const sorted = [...pathsSet].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const findings = []
  const notes = []
  for (const path of sorted) {
    const r = settlePath(engine.scans.get(path) ?? [], engine.marks.get(path) ?? [], engine)
    for (const f of r.findings) findings.push({ ...f, path })
    if (r.sao || r.qian) notes.push({ path, sao: r.sao, qian: r.qian })
  }
  return { findings, notes, paths: sorted.length }
}

/** 判定：垢值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const { findings, notes, paths } = settleAll(engine)
  let zhen = 0
  let xie = 0
  let sao = 0
  let qian = 0
  for (const f of findings) {
    if (f.kind === 'zhen') zhen++
    else xie++
  }
  for (const n of notes) {
    if (n.sao) sao++
    if (n.qian) qian++
  }
  const cases = { zhen, xie, sao, qian }

  const score = { gou: Math.min(60, 30 * zhen) + Math.min(40, 15 * xie), total: 0 }
  score.total = Math.min(100, score.gou)

  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'

  return {
    sessions: new Set(engine.calls.map((c) => c.session)).size,
    calls: engine.calls.length,
    paths,
    cases,
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    issues: issuesOf(findings, notes, paths),
    findings,
    notes,
  }
}
