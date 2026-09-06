/**
 * 结账引擎 —— 绳账条目 × 会话调用 → 结账报告。纯函数、不依赖 Cordis。
 *
 * 语义（docs/03-design.md）：promise 开结，revise 换结（字段继承、
 * "有凭"随链传递），abandon 解约，discharge 宣告补凭；
 * 收尾只对每条链的链尾对账：凭据在全部调用里找匹配——
 *   tool 精确 + contains 为 JSON.stringify(args) 的子串 + ok 对照 isError。
 * 咎（失诺）30/条 cap60；吝（整链无凭：无凭失诺叠加、无凭弃约单列）10/条 cap20；
 * 悔（改诺/弃约）与信（兑现）记 0 分。
 * 分带：无咎(0–14) / 吝(15–29) / 咎(≥30)。
 */

import { normalizeMarkers, countMarkerHits } from './lexicon.js'

export const GATE_DEFAULT = 30

export function bandOf(score) {
  if (score >= 30) return '咎'
  if (score >= 15) return '吝'
  return '无咎'
}

/** 凭据与一次调用是否相认：返回命中的调用序号，不中返回 null。 */
export function matchDischarge(discharge, calls) {
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i]
    if (discharge.tool !== undefined && c.name !== discharge.tool) continue
    const hay = c.args === undefined || c.args === null ? '' : JSON.stringify(c.args)
    if (!hay.includes(discharge.contains)) continue
    if (discharge.ok === true && c.isError !== false) continue
    if (discharge.ok === false && c.isError !== true) continue
    return i
  }
  return null
}

/**
 * 结账。entries 为 schema 合法的条目序列（调用方先过 parseLedger）；
 * calls 为会话流归并出的调用；opts: { gate, speech, lexicon }。
 */
export function settleLedger(entries, calls, opts = {}) {
  const gate = Number.isInteger(opts.gate) && opts.gate >= 0 ? opts.gate : GATE_DEFAULT
  const knots = new Map() // id → 结记录（链尾代表整条链）
  const order = [] // 开结序（promise 与 revise 的新结），悬结按此序报告
  const revised = []
  const abandoned = []
  const declared = []

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    if (entry.type === 'promise') {
      knots.set(entry.id, {
        id: entry.id,
        what: entry.what,
        discharge: entry.discharge ?? null,
        chainEverDischarge: entry.discharge != null,
        state: 'open',
        dischargedAt: null,
      })
      order.push(entry.id)
    } else if (entry.type === 'revise') {
      const target = knots.get(entry.supersedes)
      if (!target || target.state !== 'open') continue // schema 已拒；引擎保持全量防御
      target.state = 'revised'
      revised.push({ id: entry.id, supersedes: entry.supersedes })
      knots.set(entry.id, {
        id: entry.id,
        what: entry.what ?? target.what,
        discharge: entry.discharge ?? target.discharge,
        chainEverDischarge: target.chainEverDischarge || entry.discharge != null,
        state: 'open',
        dischargedAt: null,
      })
      order.push(entry.id)
    } else if (entry.type === 'abandon') {
      const target = knots.get(entry.supersedes)
      if (!target || target.state !== 'open') continue
      target.state = 'abandoned'
      abandoned.push({ id: entry.id, supersedes: entry.supersedes })
    } else if (entry.type === 'discharge') {
      const target = knots.get(entry.settles)
      if (!target || target.state !== 'open') continue
      target.discharge = entry.discharge
      target.chainEverDischarge = true
      declared.push({ settles: entry.settles })
    }
  }

  // 收尾：链尾逐结对账
  const breaches = []
  const lenientAbandoned = []
  let dischargedCount = 0
  for (const id of order) {
    const k = knots.get(id)
    if (k.state !== 'open') continue
    if (k.discharge) {
      const at = matchDischarge(k.discharge, calls)
      if (at !== null) {
        k.state = 'discharged'
        k.dischargedAt = at
        dischargedCount += 1
        continue
      }
    }
    k.state = 'breached'
    breaches.push(k)
  }
  for (const [, k] of knots) {
    if (k.state === 'abandoned' && !k.chainEverDischarge) lenientAbandoned.push(k)
  }

  const blame = Math.min(60, 30 * breaches.length)
  // 吝计两条来源：无凭弃约（单列）+ 无凭失诺（与咎叠加），合并封顶 20
  const leniencyCount =
    lenientAbandoned.length + breaches.filter((k) => !k.chainEverDischarge).length
  const leniency = Math.min(20, 10 * leniencyCount)
  const score = Math.min(100, blame + leniency)

  const speechEvents = Array.isArray(opts.speech) ? opts.speech : []
  const markers = normalizeMarkers(opts.lexicon ?? null)
  const markerHits = countMarkerHits(speechEvents, markers)
  const promised = entries.filter((e) => e?.type === 'promise').length

  return {
    totals: {
      promised,
      discharged: dischargedCount,
      revised: revised.length,
      abandoned: abandoned.length,
      breached: breaches.length,
    },
    breakdown: { blame, leniency },
    score,
    band: bandOf(score),
    gate,
    verdict: score >= gate ? 'fail' : 'pass',
    knots: breaches.map((k) => ({
      id: k.id,
      what: k.what,
      blame: 30,
      leniency: k.chainEverDischarge ? 0 : 10,
      cause: k.chainEverDischarge ? '凭据无匹配' : '整条链无凭据',
    })),
    lenientAbandoned: lenientAbandoned.map((k) => ({
      id: k.id,
      what: k.what,
      leniency: 10,
      cause: '无凭弃约',
    })),
    discharged: order
      .map((id) => knots.get(id))
      .filter((k) => k.state === 'discharged')
      .map((k) => ({ id: k.id, what: k.what, dischargedAt: k.dischargedAt })),
    speech: {
      events: speechEvents.length,
      markerHits,
      unaccounted:
        speechEvents.length === 0 ? null : Math.max(0, markerHits - promised),
    },
  }
}
