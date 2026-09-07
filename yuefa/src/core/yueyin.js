/**
 * 约账引擎 —— 约据登记与削值判定（docs/03 §2/§4/§6 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图，合审归并归离线合并审计。
 *
 * 入口滤（先于一切）：isError === true 一律不入账——失败的写没落盘、失败的读没
 * 看见，不生约据也不生无文之痕（等同未发生）；isError 未知（null，老流）按已发生。
 *
 * 约据唯二（docs/03 §2）：observe 族成功 ∧ content 非空 → 读据（立约，读取永不
 * 受判）；write 族成功 ∧ args.content 非空 → 写据（受判）；content 为空只记无文
 * 之痕（约改不判的隔断）；exec 是黑盒（不生据不生痕不折旧）。
 *
 * 判定序锁死（docs/03 §4.4）：无约静默 → 间有痕约改不判 → 世据折旧（约面 =
 * U ∩ S(m)，m = u 与 j 间最近写据，等文照取）→ 削名 ∅ 静默 → 弃词同行查明削
 * （有声 0 / 无声 +30/名 cap60）。
 *
 * 削值锁死（docs/03 §6）：xue = min(60, 30 × 哑削名数)；分带 坚 0–14 / 渝 15–29 /
 * 背 ≥30；门默认 30——单哑削名即红（杀人者死）。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { surfaceOf, globMatch, hasVoice } from './mianxing.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '坚'
  if (total < 30) return '渝'
  return '背'
}

/** 引擎装配：约册（allow 豁免 / forms 增形 / noDefaults）→ 约账。无册（null）→ 无豁免全账 + 默认形表。 */
export function createEngine({ book = null } = {}) {
  return {
    cfg: {
      allow: (book?.allow ?? []).map((g) => String(g)),
      forms: Array.isArray(book?.forms) ? book.forms.map((s) => String(s)) : [],
      noDefaults: book?.noDefaults === true,
    },
    calls: [],
    seq: 0,
    grips: new Map(), // 规整径 → [{seq, session, ref, kind:'read'|'write', surface:Set, content}]（seq 递增序）
    marks: new Map(), // 规整径 → [{seq}]（无文之痕）
  }
}

function allowed(cfg, path) {
  return cfg.allow.some((g) => globMatch(path, g))
}

/**
 * 记一笔调用（唯一写入口）。观察永不反噬：本函数不抛。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  engine.calls.push({ session, ref, name, args, isError, content })
  if (isError === true) return engine // 入口滤：失败的写没落盘、失败的读没看见
  const fam = familyOf(name)
  const key = objectKey(args, name)

  if (fam === 'observe' && key.startsWith('p:')) {
    if (typeof content === 'string' && content.length > 0) {
      const path = normalizePath(key.slice(2))
      if (!allowed(engine.cfg, path)) {
        const seq = ++engine.seq // seq 只数入账事件（约据与痕）
        const list = engine.grips.get(path) ?? []
        list.push({
          seq, session, ref, kind: 'read',
          surface: surfaceOf(content, { forms: engine.cfg.forms, noDefaults: engine.cfg.noDefaults }),
          content,
        })
        engine.grips.set(path, list)
      }
    }
    return engine
  }

  if (fam === 'write' && key.startsWith('p:')) {
    const path = normalizePath(key.slice(2))
    if (allowed(engine.cfg, path)) return engine
    const text = typeof args?.content === 'string' ? args.content : null
    if (text !== null && text.length > 0) {
      const seq = ++engine.seq
      const list = engine.grips.get(path) ?? []
      list.push({
        seq, session, ref, kind: 'write',
        surface: surfaceOf(text, { forms: engine.cfg.forms, noDefaults: engine.cfg.noDefaults }),
        content: text,
      })
      engine.grips.set(path, list)
    } else {
      // 无文之写：不生约据，只留无文之痕（约改不判的隔断）
      const seq = ++engine.seq
      const list = engine.marks.get(path) ?? []
      list.push({ seq })
      engine.marks.set(path, list)
    }
    return engine
  }

  return engine // observe 无文 / exec 黑盒 / other 族：n: 黑盒
}

/** 窗 (lo, hi) 内的无文之痕数（seq 严格介于其间，不含端点）。 */
function marksIn(marks, lo, hi) {
  let n = 0
  for (const mk of marks) if (mk.seq > lo && mk.seq < hi) n++
  return n
}

/** 明削声审查：削名中逐名查明削（弃词 × 名同行）。返回 { ya: [], ming: [] }。 */
function splitVoice(content, names) {
  const ya = []
  const ming = []
  for (const n of names) (hasVoice(content, n) ? ming : ya).push(n)
  return { ya, ming }
}

/**
 * 对单径逐笔判定。grips 按序（seq 递增），marks 为该径无文之痕。
 * 返回 findings：{ seq, names, total, type: '哑削'|'明削'|'约改', gap? }
 */
export function settlePath(grips, marks) {
  const findings = []
  for (let i = 0; i < grips.length; i++) {
    const j = grips[i]
    if (j.kind !== 'write') continue // 唯写据受判——读取永不判案

    // 约据：j 前最近读据（读时之约——没读过就无约可言）
    let ui = -1
    for (let t = i - 1; t >= 0; t--) {
      if (grips[t].kind === 'read') { ui = t; break }
    }
    if (ui < 0) continue // 无约静默（首笔落卷与盲写皆无约）
    const u = grips[ui]

    // 约改不判：约据与落笔间有无文之痕——其间面可能已变而不可见
    const gap = marksIn(marks, u.seq, j.seq)
    if (gap > 0) {
      findings.push({ seq: j.seq, type: '约改', gap })
      continue
    }

    // 世据折旧：m = u 与 j 间最近写据（等文照取——面等则折旧自然无效果）
    let mi = -1
    for (let t = i - 1; t >= 0; t--) {
      if (grips[t].kind === 'write') { mi = t; break }
    }
    const yue = new Set()
    if (mi >= 0) {
      for (const n of u.surface) if (grips[mi].surface.has(n)) yue.add(n)
    } else {
      for (const n of u.surface) yue.add(n)
    }

    // 削名与案别
    const cut = [...yue].filter((n) => !j.surface.has(n))
    if (cut.length === 0) continue // 守约/展约：静默
    const { ya, ming } = splitVoice(j.content, cut)
    if (ya.length > 0) findings.push({ seq: j.seq, names: ya, total: yue.size, type: '哑削' })
    if (ming.length > 0) findings.push({ seq: j.seq, names: ming, total: yue.size, type: '明削' })
  }
  return findings
}

/** issues 行（锁死，docs/03 §8）：哑削 → 明削 → 约改 → 全坚。 */
export function issuesOf(findings, paths) {
  const issues = []
  for (const t of ['哑削', '明削', '约改']) {
    for (const f of findings) {
      if (f.type !== t) continue
      if (f.type === '哑削') issues.push(`哑削：${f.path}（削 ${f.names.join('、')}——公面 ${f.total} 失 ${f.names.length}）`)
      else if (f.type === '明削') issues.push(`明削：${f.path}（削 ${f.names.join('、')}——声在码中）`)
      else issues.push(`约改：${f.path}（约据后无文之写 ${f.gap} 笔，判定不及）`)
    }
  }
  if (issues.length === 0) issues.push(`约皆坚 ×${paths ?? 0} —— 面各有其名，不作背约之削`)
  return issues
}

/** 逐径判定（唯一判定点）：按规整径字典序出 findings，行序在 issuesOf 锁死。 */
export function settleAll(engine) {
  const paths = new Set([...engine.grips.keys(), ...engine.marks.keys()])
  const sorted = [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const findings = []
  for (const path of sorted) {
    const fs = settlePath(engine.grips.get(path) ?? [], engine.marks.get(path) ?? [])
    for (const f of fs) findings.push({ ...f, path })
  }
  return { findings, paths: sorted.length }
}

/** 判定：削值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const { findings, paths } = settleAll(engine)
  let ya = 0
  let ming = 0
  let gai = 0
  for (const f of findings) {
    if (f.type === '哑削') ya += f.names.length
    else if (f.type === '明削') ming += f.names.length
    else gai++
  }
  const cases = { ya, ming, gai }

  const score = { xue: Math.min(60, 30 * ya), total: 0 }
  score.total = Math.min(100, score.xue)

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
    issues: issuesOf(findings, paths),
    findings,
  }
}
