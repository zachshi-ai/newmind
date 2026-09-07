/**
 * 据账引擎 —— 文据登记与陈值判定（docs/03 §2/§3/§5 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流合审把所有会话的调用记进同一引擎（归并序见 audit.js）；
 * 插件只记本会话——单会话视图（覆世唯合审可见，运行时诚实看不见他手）。
 *
 * 入口滤（先于一切）：isError === true 一律不入账——失败的写没落盘、失败的读没看见，
 * 不生文据也不生无文之痕（等同未发生）；isError 未知（null，老流）按已发生入账。
 *
 * 文据唯二（docs/03 §2）：observe 族成功 ∧ content 非空 → 读据；write 族成功 ∧
 * args.content 非空 → 写据；content 为空只记无文之痕（隔断判定）；exec 是黑盒
 * （落盘文面流内不可见，不生据不生痕）；观察不是写（读取永不判案，只供旧据）。
 *
 * 判定序锁死（docs/03 §3.4）：无文据静默 → 隔断陈改不判 → 无变写无旧据静默 →
 * 覆世/覆己 → 失鲜 → 保新线不罚。
 *
 * 陈值锁死（docs/03 §5）：shi=min(60,30×覆世)+ji=min(40,15×覆己)，total=min(100)；
 * 分带 活 0–14 / 滞 15–29 / 腐 ≥30；门默认 30——单覆世即红、双覆己即红、
 * 单覆己黄牌不咬门。
 */

import { objectKey, familyOf, normalizePath } from './object.js'
import { lineSet, settlePath, globMatch } from './sanxu.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '活'
  if (total < 30) return '滞'
  return '腐'
}

/** 引擎装配：水册（许复）→ 据账。无册（null）→ 许复为空——无册 = 全账。 */
export function createEngine({ book = null } = {}) {
  const excuse = (book?.excuse ?? []).map((g) => String(g))
  return {
    cfg: { excuse },
    calls: [],
    seq: 0,
    grips: new Map(), // 规整径 → [{seq, session, ref, kind:'read'|'write', lines:Set}]（seq 递增序）
    marks: new Map(), // 规整径 → [{seq}]（无文之痕）
  }
}

function excused(cfg, path) {
  return cfg.excuse.some((g) => globMatch(path, g))
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
      if (!excused(engine.cfg, path)) {
        const seq = ++engine.seq // seq 只数入账事件（文据与痕）
        const list = engine.grips.get(path) ?? []
        list.push({ seq, session, ref, kind: 'read', lines: lineSet(content) })
        engine.grips.set(path, list)
      }
    }
    return engine
  }

  if (fam === 'write' && key.startsWith('p:')) {
    const path = normalizePath(key.slice(2))
    if (excused(engine.cfg, path)) return engine
    const text = typeof args?.content === 'string' ? args.content : null
    if (text !== null && text.length > 0) {
      const seq = ++engine.seq
      const list = engine.grips.get(path) ?? []
      list.push({ seq, session, ref, kind: 'write', lines: lineSet(text) })
      engine.grips.set(path, list)
    } else {
      // 无文之写：不生文据，只留无文之痕（隔断判定）
      const seq = ++engine.seq
      const list = engine.marks.get(path) ?? []
      list.push({ seq })
      engine.marks.set(path, list)
    }
    return engine
  }

  return engine // observe 无文 / exec 黑盒 / other 族：n: 黑盒
}

/** issues 行（锁死，docs/03 §7）：覆世 → 覆己 → 失鲜 → 陈改 → 全活。 */
export function issuesOf(findings, paths) {
  const issues = []
  const line = (f) => {
    if (f.type === '覆世' || f.type === '覆己') {
      const reread = f.reread ? ' · 案前曾重读' : ''
      return `${f.type}：${f.path}（seq ${f.seq} 覆 seq ${f.mSeq}——陈线 ${f.chen} · 新线 ${f.xin}${reread}）`
    }
    if (f.type === '失鲜') return `失鲜：${f.path}（seq ${f.seq}——陈线 ${f.chen} · 新线 ${f.xin}）`
    return `陈改：${f.path}（最近文据后无文之写 ${f.gap} 笔，判定不及）`
  }
  for (const t of ['覆世', '覆己', '失鲜', '陈改']) {
    for (const f of findings) if (f.type === t) issues.push(line(f))
  }
  if (issues.length === 0) issues.push(`水皆活 ×${paths ?? 0} —— 见新乃写，不作画水之记`)
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

/** 判定：陈值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const { findings, paths } = settleAll(engine)
  const cases = { shi: 0, ji: 0, xian: 0, gai: 0 }
  for (const f of findings) {
    if (f.type === '覆世') cases.shi++
    else if (f.type === '覆己') cases.ji++
    else if (f.type === '失鲜') cases.xian++
    else if (f.type === '陈改') cases.gai++
  }

  const score = {
    shi: Math.min(60, 30 * cases.shi),
    ji: Math.min(40, 15 * cases.ji),
  }
  score.total = Math.min(100, score.shi + score.ji)

  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'

  const issues = issuesOf(findings, paths)

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
    issues,
    findings,
  }
}
