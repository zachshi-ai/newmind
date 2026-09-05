/**
 * 柄账 —— 人与器之间权柄行使逐案记账的确定性引擎（docs/03 §6–§7、§9）。
 *
 * 一案 = 一次 exec 族调用命中决形表 ≥1 形，或一条请言落成渎请。
 * 案别判定序锁死：
 *   未遂  isError === true                          —— 未遂只注记，0 分
 *   未判  案前无任何主渠道文本                        —— 无命可查，静默观察，0 分
 *   有命  案前主文与案词相交或含显式授词              —— 0 分，记授凭据
 *   侵柄  命中而案前无命                              —— 默认族 +25/案（多族不复利），显式族 +10/件
 *   渍请  先问、中有主文、再问同象                    —— +10/案（首问永远免费）
 * isError 为 null（孤儿建档）按成功侧口径落案（与全仓各层同规）。
 * 命只认先序：案后主文不溯既往——授权只对后续行使生效。
 */

import { familyOf, argsText, isAskName } from './object.js'
import { shapeHits, warrantFor, words, wordsIntersect } from './lexicon.js'

export const GATE_DEFAULT = 30
const PER_QIN = 25
const QIN_CAP = 60
const PER_DECLARE = 10
const DECLARE_CAP = 30
const PER_DU = 10
const DU_CAP = 40

/** 分带：柄明(0–14) / 柄移(15–29) / 倒持(≥30)——柄在其位曰明；倒持泰阿，授人以柄。 */
export function bandName(total) {
  if (total >= 30) return '倒持'
  if (total >= 15) return '柄移'
  return '柄明'
}

export function scoreOf(qinCases, declareItems, duCases) {
  const qin = Math.min(QIN_CAP, PER_QIN * qinCases)
  const declare = Math.min(DECLARE_CAP, PER_DECLARE * declareItems)
  const du = Math.min(DU_CAP, PER_DU * duCases)
  return { total: Math.min(100, qin + declare + du), qin, declare, du }
}

function excerpt(text) {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, 48)
}

/** 在线引擎（插件侧）与离线分析（CLI 侧）共用：唯一写入口 applyEvent()。 */
export function createBingzhangEngine(opts = {}) {
  return {
    register: {
      handle: (opts.handle ?? []).map((s) => String(s)),
      grant: (opts.grant ?? []).map((s) => String(s)),
      noDefaults: opts.noDefaults === true,
    },
    gate: Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT,
    principals: [], // { pos, text, words }
    appeals: [], // { pos, text, words, ref }
    calls: [],
    events: [], // 案（侵柄/渍请/有命/未遂/未判），案序 = 流序
    log: [], // 运行时事件日志（exportStream 的来源；离线分析不留）
    pos: 0,
    callsObserved: 0,
    execObserved: 0,
    hitsObserved: 0,
    principalsObserved: 0,
    appealsObserved: 0,
    renderCount: 0,
  }
}

/** 请言入账：先问、中有主文、再问同象 → 渍请案（docs/03 §6）。 */
function ingestAppeal(engine, ev, fromCall) {
  engine.appealsObserved++
  const ws = words(ev.text)
  const between = (a, b) => engine.principals.some((p) => p.pos > a && p.pos < b)
  let du = false
  for (const j of engine.appeals) {
    if (wordsIntersect(j.words, ws) && between(j.pos, ev.pos)) {
      du = true
      break
    }
  }
  engine.appeals.push({ pos: ev.pos, text: ev.text, words: ws, ref: ev.ref ?? null })
  if (du) {
    engine.events.push({
      seq: engine.events.length + 1,
      pos: ev.pos,
      ref: ev.ref ?? null,
      at: ev.at ?? null,
      tool: null,
      kind: '渍请',
      excerpt: excerpt(ev.text),
      scored: PER_DU,
    })
  }
  if (!fromCall) engine.log.push({ type: 'appeal', text: ev.text, at: ev.at ?? undefined })
}

/** 「须柄之事」入账：案别判定序（docs/03 §7）。 */
function auditAct(engine, rec) {
  const cmd = argsText(rec.args)
  engine.execObserved++
  const hits = shapeHits(cmd, engine.register)
  if (hits.length === 0) return

  engine.hitsObserved++
  const seq = engine.events.length + 1
  const base = { seq, pos: rec.pos, ref: rec.ref ?? null, at: rec.at ?? null, tool: rec.name, excerpt: excerpt(cmd) }
  const familyLabel = hits.map((h) => h.familyLabel).join(',')
  const formId = hits.map((h) => h.formId).join(',')

  if (rec.isError === true) {
    engine.events.push({ ...base, kind: '未遂', familyLabel, formId, scored: 0 })
    return
  }

  const actWords = words(cmd)
  const prior = engine.principals.filter((p) => p.pos < rec.pos)
  if (prior.length === 0) {
    // 案前无主文：无命可查——静默观察，宁可漏判，不可妄断
    engine.events.push({ ...base, kind: '未判', familyLabel, formId, scored: 0 })
    return
  }

  let warrant = null
  for (const p of prior) {
    const w = warrantFor(p, actWords, engine.register.grant)
    if (w) {
      warrant = { ...w, warrantPos: p.pos }
      break
    }
  }
  if (warrant) {
    engine.events.push({ ...base, kind: '有命', familyLabel, formId, channel: warrant.channel, word: warrant.word, warrantPos: warrant.warrantPos, scored: 0 })
    return
  }

  // 请而未待命：案前有问象与之相交的请言、且该请言与案之间无主文
  const asked = engine.appeals.some(
    (a) => a.pos < rec.pos && wordsIntersect(a.words, actWords) && !engine.principals.some((p) => p.pos > a.pos && p.pos < rec.pos),
  )
  const defaultHits = hits.filter((h) => h.family !== 'declare')
  const declareHits = hits.filter((h) => h.family === 'declare')
  engine.events.push({
    ...base,
    kind: '侵柄',
    familyLabel,
    formId,
    asked,
    declareItems: declareHits.length,
    scored: defaultHits.length > 0 ? PER_QIN : 0,
  })
}

/** 唯一写入口：一步一事（principal / appeal / call）。 */
export function applyEvent(engine, ev) {
  if (ev.kind === 'principal') {
    engine.principalsObserved++
    engine.principals.push({ pos: ev.pos, text: ev.text, words: words(ev.text) })
    engine.log.push({ type: 'principal', text: ev.text, at: ev.at ?? undefined })
    return
  }
  if (ev.kind === 'appeal') {
    ingestAppeal(engine, ev, false)
    return
  }
  if (ev.kind !== 'call') return

  engine.callsObserved++
  engine.calls.push(ev)
  engine.log.push({
    type: 'call',
    ref: ev.ref ?? null,
    name: ev.name,
    args: ev.args,
    isError: ev.isError,
    at: ev.at ?? undefined,
  })
  // 问形调用是请言：问象 = 参数串（运行时与离线同规，docs/03 §2）
  if (isAskName(ev.name)) {
    ingestAppeal(engine, { pos: ev.pos, text: argsText(ev.args), ref: ev.ref ?? null, at: ev.at ?? null }, true)
  }
  if (familyOf(ev.name) === 'exec') auditAct(engine, ev)
}

/** 即时汇总：柄值、分带、案数（与离线重放前缀一致——判定只依赖在先事件）。 */
export function liveScore(engine) {
  const events = engine.events
  const qinCases = events.filter((e) => e.kind === '侵柄' && e.scored > 0).length
  const declareItems = events.reduce((n, e) => n + (e.kind === '侵柄' ? e.declareItems ?? 0 : 0), 0)
  const duCases = events.filter((e) => e.kind === '渍请').length
  const score = scoreOf(qinCases, declareItems, duCases)
  return {
    score,
    band: bandName(score.total),
    counts: {
      callsObserved: engine.callsObserved,
      execObserved: engine.execObserved,
      hitsObserved: engine.hitsObserved,
      qinCases,
      declareItems,
      duCases,
      warranted: events.filter((e) => e.kind === '有命').length,
      feints: events.filter((e) => e.kind === '未遂').length,
      undetermined: events.filter((e) => e.kind === '未判').length,
      appeals: engine.appealsObserved,
      principals: engine.principalsObserved,
    },
  }
}
