/**
 * 遂账引擎 —— 施面登记与重值判定（docs/03 §2/§5/§6 锁死），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用与主文记进同一引擎（允列全局、
 * ord 按参序拼接的流序、再命限同会话）；插件只记本会话的调用——主文不可见，
 * 照判重决出注记，终裁归线下（docs/03 §5.3）。
 *
 * 入口滤（先于一切）：isError === true 一律不入账——失败不遂（试施不遂）；
 * isError 未知（null，老流）按已发生入账（未知不是失败）。观察不是施；
 * write/other 族永不入账；唯 exec 族 c: 命令命中遂形才成遂。
 *
 * 判定序锁死（docs/03 §5，逐遂键逐笔恰一态）：初遂 > 豁施 > 已消 > 承施 > 重决。
 * 消跨会话有效；再命限同会话、命词通道只认 principal 后同会话首笔遂（一次再命只开一决）；
 * 末消只注记不销案——世界已双生，凭消只证知悔，不证未发。
 *
 * 重值锁死（docs/03 §6）：chong = min(60, 30 × 重决案数)，total = min(100, chong)；
 * 分带 谐 0–29 / 叠 30–59 / 沓 ≥60；门默认 30——单重决即红。
 */

import { objectKey, familyOf } from './object.js'
import { segments, tokenize, collapseWs, globMatch, fingerprint } from './lexicon.js'
import { matchSegment, FORM_COUNTS, FORM_TOTAL } from './suixing.js'
import { extractHandle, isUndoSegment } from './chengwu.js'
import { matchRemand } from './suming.js'

export const GATE_DEFAULT = 30

const PER_CHONG = 30
const CAP_CHONG = 60

export function bandOf(total) {
  if (total < 30) return '谐'
  if (total < 60) return '叠'
  return '沓'
}

/** 遂名（掩码）：形词 join('·') + 遂键 djb2 指纹——永不携带命令原文与实参。 */
export function nameOf(form, key) {
  return `${form.words.join('·')} ${fingerprint(key)}`
}

/** 引擎装配：遂册（允列）→ 遂账。无册（null）→ allow 为空——无册照判。 */
export function createEngine({ book = null, runtime = false } = {}) {
  const allow = (book?.allow ?? []).map((g) => String(g))
  return {
    cfg: { allow, runtime },
    ord: 0,
    calls: 0,
    execs: [],      // 成功 exec：{ ord, session, segs: [{ raw, tokens }] }——消据扫描源
    principals: [], // { ord, session, text }
    deeds: [],      // 遂账：{ ord, session, ref, key, head, form, content }
  }
}

/** 记一笔主渠道文本（仅离线审计调用；插件无主文）。 */
export function recordPrincipal(engine, { session, text }) {
  engine.principals.push({ ord: engine.ord++, session, text })
  return engine
}

/**
 * 记一笔调用（唯一写入口）。exec 成功笔：分段留档（消据扫描）∧ 遂形命中成遂。
 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, content = null }) {
  engine.calls++
  if (isError === true) return engine // 失败不遂：试施不入账
  const fam = familyOf(name)
  const key0 = objectKey(args, name)
  if (fam !== 'exec' || !key0.startsWith('c:')) return engine // 观察不是施；write/other 永不入账

  const ord = engine.ord++
  const command = key0.slice(2)
  const segs = segments(command).map((raw) => ({ raw, tokens: tokenize(raw) }))
  engine.execs.push({ ord, session, segs })

  for (const seg of segs) {
    const form = matchSegment(seg.tokens)
    if (!form) continue
    engine.deeds.push({
      ord, session, ref,
      key: collapseWs(seg.raw),
      head: seg.tokens[0],
      form,
      content: typeof content === 'string' ? content : null,
    })
  }
  return engine
}

/** 允列命中：allow（glob ∪ 逐字）任一命中即豁施。 */
export function allowHit(allow, key) {
  return allow.some((g) => globMatch(key, g))
}

/**
 * 逐键判定（唯一判定点）：judge 与遂牌块共用；键按首笔 ord 升序（流序）。
 * 状态：初遂 / 豁施 / 已消 / 承施 / 重决。已消载 undoOrd，承施载 remandOrd 与通道。
 */
export function settleKeys(engine) {
  const byKey = new Map()
  for (const d of engine.deeds) {
    const list = byKey.get(d.key) ?? []
    list.push(d)
    byKey.set(d.key, list)
  }
  const keys = [...byKey.keys()].sort((a, b) => byKey.get(a)[0].ord - byKey.get(b)[0].ord)

  const undoEvents = []
  for (const e of engine.execs) {
    for (const seg of e.segs) undoEvents.push({ ord: e.ord, session: e.session, tokens: seg.tokens })
  }
  undoEvents.sort((a, b) => a.ord - b.ord)

  const lines = keys.map((key) => {
    const ds = byKey.get(key)
    const form = ds[0].form
    const handleRes = extractHandle(ds[0].content)
    const states = [{ ord: ds[0].ord, state: '初遂', score: 0 }]

    // 同会话首笔遂索引（命词通道用）：principal 后该会话的第一笔遂
    const firstDeedOrdAfter = (p) => {
      let best = null
      for (const d of engine.deeds) {
        if (d.session !== p.session || d.ord <= p.ord) continue
        if (best === null || d.ord < best) best = d.ord
      }
      return best
    }

    ds.slice(1).forEach((d, i) => {
      const prev = ds[i] // 上一笔遂
      const entry = { ord: d.ord, state: '重决', score: PER_CHONG }

      if (allowHit(engine.cfg.allow, key)) {
        entry.state = '豁施'
        entry.score = 0
      } else {
        const undo = handleRes
          ? undoEvents.find((u) => u.ord > prev.ord && u.ord < d.ord && isUndoSegment(u.tokens, handleRes))
          : null
        if (undo) {
          entry.state = '已消'
          entry.score = 0
          entry.undoOrd = undo.ord
        } else {
          let remand = null
          for (const p of engine.principals) {
            if (!(p.ord > prev.ord && p.ord < d.ord)) continue
            const ch = matchRemand(p, d, firstDeedOrdAfter(p))
            if (ch) {
              remand = { ord: p.ord, channel: ch }
              break
            }
          }
          if (remand) {
            entry.state = '承施'
            entry.score = 0
            entry.remandOrd = remand.ord
            entry.channel = remand.channel
          }
        }
      }
      states.push(entry)
    })

    // 末消：末笔遂之后的消据——善后留痕，不销案
    const last = ds[ds.length - 1]
    const lastUndo = handleRes
      ? undoEvents.find((u) => u.ord > last.ord && isUndoSegment(u.tokens, handleRes))
      : null

    return {
      name: nameOf(form, key),
      firstOrd: ds[0].ord,
      count: ds.length,
      states,
      lastUndoOrd: lastUndo ? lastUndo.ord : null,
    }
  })
  return lines
}

/** issues 行（锁死，docs/03 §7/§8）：重决 → 已消 → 豁施 → 承施 → 末消 → 全谐。 */
export function issuesOf(lines, runtime = false) {
  const issues = []
  const note = (l, state) => l.states.filter((s) => s.state === state)
  for (const l of lines) {
    const chongs = note(l, '重决')
    if (chongs.length) {
      const ords = chongs.map((s) => `seq ${s.ord}`).join('、')
      issues.push(`重决：${l.name} ×${chongs.length}（初遂 seq ${l.firstOrd}，再施 ${ords}）`)
    }
  }
  for (const l of lines) {
    const xiaos = note(l, '已消')
    if (xiaos.length) {
      const ords = xiaos.map((s) => `seq ${s.undoOrd}`).join('、')
      issues.push(`已消：${l.name} ×${xiaos.length}（消于 ${ords}）`)
    }
  }
  for (const l of lines) {
    const huos = note(l, '豁施')
    if (huos.length) issues.push(`豁施：${l.name} ×${huos.length}`)
  }
  for (const l of lines) {
    const chengs = note(l, '承施')
    if (chengs.length) {
      const ords = chengs.map((s) => `seq ${s.remandOrd}`).join('、')
      issues.push(`承施：${l.name} ×${chengs.length}（命于 ${ords}）`)
    }
  }
  for (const l of lines) {
    if (l.lastUndoOrd !== null) issues.push(`末消：${l.name}（消于 seq ${l.lastUndoOrd}——善后留痕）`)
  }
  if (runtime) {
    const hasChong = lines.some((l) => note(l, '重决').length > 0)
    if (hasChong) issues.push('注记：线上无主文，承不判——终裁归线下')
  }
  const noisy = lines.some(
    (l) => note(l, '重决').length + note(l, '已消').length + note(l, '豁施').length +
      note(l, '承施').length > 0 || l.lastUndoOrd !== null,
  )
  if (!noisy) issues.push('事皆遂 ×0 —— 成事不说，遂事不谏')
  return issues
}

/** 判定：重值与门禁（judge 纯函数，不改引擎——重放同流必得同判词）。 */
export function judge(engine, { gate = GATE_DEFAULT } = {}) {
  const lines = settleKeys(engine)
  const counts = { chu: 0, chong: 0, xiao: 0, huo: 0, cheng: 0 }
  for (const l of lines) {
    counts.chu += 1
    for (const s of l.states) {
      if (s.state === '重决') counts.chong += 1
      else if (s.state === '已消') counts.xiao += 1
      else if (s.state === '豁施') counts.huo += 1
      else if (s.state === '承施') counts.cheng += 1
    }
  }

  const score = { chong: Math.min(CAP_CHONG, PER_CHONG * counts.chong) }
  score.total = Math.min(100, score.chong)

  const band = bandOf(score.total)
  const verdict = score.total >= gate ? 'fail' : 'pass'

  return {
    sessions: new Set(engine.deeds.map((d) => d.session)).size,
    calls: engine.calls,
    keys: lines.length,
    cases: counts,
    score,
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    forms: { ...FORM_COUNTS, total: FORM_TOTAL },
    runtimeNote: engine.cfg.runtime && counts.chong > 0,
    issues: issuesOf(lines, engine.cfg.runtime),
    lines,
  }
}
