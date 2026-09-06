/**
 * 稽问引擎 —— 问账与案别判定（谋及 / 空疑 / 迟问 / 独谋 / 未见 / 无动），全部确定性，零 LLM。
 *
 * 引擎是统一入口：CLI 多流审计把所有会话的调用记进同一引擎（问凭据全流皆采，合并审计
 * 跨会话）；插件只记本会话——单会话视图，跨会话之问归离线合并审计。
 *
 * 判定序锁死（docs/03 §4，对每条触发之疑条）：
 *   谋及（首触发之前或同笔有问凭据）→ 空疑（失败读取，环境答无）→ 迟问（首触发之后有凭据）
 *   → 独谋（显式档，任务方作保 +15）→ 未见（默认档全流无踪，只点名）→ 独谋（默认档有痕 +5）。
 *   触发域内全流无调用 → 无动（不判）。
 * 分值锁死（docs/03 §5）：
 *   迟问 +5/条 cap 15；独谋显式 +15/条 cap 45；独谋默认 +5/条 cap 15；
 *   total = min(100, late + blind)。
 * 分带：谋 0–14 / 疏 15–29 / 独 ≥30。门默认 30——两条显式独谋即红。
 */

import { mergeAsks } from './askfile.js'
import { isFulfil, isEmptyAsk, hasTrace, domainHit } from './wen.js'

export const GATE_DEFAULT = 30

export function bandOf(total) {
  if (total < 15) return '谋'
  if (total < 30) return '疏'
  return '独'
}

export function createEngine() {
  return { calls: [] }
}

/** 记一笔调用（流序即序；at 原样保留，不参与判定）。 */
export function recordCall(engine, { session, ref = null, name, args, isError = null, at = null }) {
  engine.calls.push({ session, ref, name, args, isError, at: at ?? null })
  return engine
}

/**
 * 收工总稽。askfile 为 null 或归并后无条 → 无册不判，counts 全零。
 * 返回报告对象（字段序锁死，docs/03 §6）。
 */
export function judge(engine, { askfile = null, gate = GATE_DEFAULT } = {}) {
  const merged = mergeAsks(askfile)

  if (!askfile || merged.length === 0) {
    return {
      sessions: new Set(engine.calls.map((c) => c.session)).size,
      calls: engine.calls.length,
      asks: 0,
      score: { total: 0, late: 0, blind: 0 },
      band: bandOf(0),
      gate,
      verdict: 'pass',
      ok: true,
      counts: {
        triggered: 0, fulfilled: 0, late: 0, blind: 0, emptyAsk: 0, unseen: 0, askCount: 0,
      },
      issues: ['无稽疑册——声明权在任务方，先立册再审计'],
    }
  }

  const calls = engine.calls
  const cases = { fulfilled: [], late: [], blindExplicit: [], blindDefault: [], emptyAsk: [], unseen: [], noaction: [] }

  for (const ask of merged) {
    let firstInvoke = -1
    let fulfilIdx = -1
    let emptyAsk = false
    let trace = false
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i]
      if (firstInvoke === -1 && domainHit(call, ask.on)) firstInvoke = i
      if (isFulfil(call, ask) && fulfilIdx === -1) fulfilIdx = i
      if (isEmptyAsk(call, ask)) emptyAsk = true
      if (hasTrace(call, ask)) trace = true
    }
    // 判定序锁死：谋及（凭据先于首触发，动即问同笔从宽）→ 空疑 → 迟问 → 独谋/未见
    if (firstInvoke === -1) {
      cases.noaction.push(ask)
    } else if (fulfilIdx !== -1 && fulfilIdx <= firstInvoke) {
      cases.fulfilled.push(ask)
    } else if (emptyAsk) {
      cases.emptyAsk.push(ask)
    } else if (fulfilIdx !== -1) {
      cases.late.push(ask)
    } else if (ask.tier === 'explicit') {
      cases.blindExplicit.push(ask)
    } else if (trace) {
      cases.blindDefault.push(ask)
    } else {
      cases.unseen.push(ask)
    }
  }

  // ---- 分值（先于实现锁死）---------------------------------------------------
  const late = Math.min(15, 5 * cases.late.length)
  const blindExplicit = Math.min(45, 15 * cases.blindExplicit.length)
  const blindDefault = Math.min(15, 5 * cases.blindDefault.length)
  const blind = blindExplicit + blindDefault
  const total = Math.min(100, late + blind)
  const band = bandOf(total)
  const verdict = total >= gate ? 'fail' : 'pass'

  // ---- issues 行序：独谋（显式）→ 独谋（默认）→ 迟问 → 空疑 → 未见 → 谋及 --------
  const issues = []
  const uniq = (asks) => [...new Set(asks.map((a) => a.path))]
  if (cases.blindExplicit.length) {
    issues.push(
      `独谋（显式）×${cases.blindExplicit.length}（+15/条）：${uniq(cases.blindExplicit).join('、')} —— 谋不及物：首动之前流内无问凭据`
    )
  }
  if (cases.blindDefault.length) {
    issues.push(
      `独谋（默认）×${cases.blindDefault.length}（+5/条）：${uniq(cases.blindDefault).join('、')} —— 谋不及物：默认条有痕无问`
    )
  }
  if (cases.late.length) {
    issues.push(
      `迟问 ×${cases.late.length}（+5/条）：${uniq(cases.late).join('、')} —— 先动后问：首触发之后才有问凭据`
    )
  }
  if (cases.emptyAsk.length) {
    issues.push(
      `空疑 ×${cases.emptyAsk.length}（不计分）：${uniq(cases.emptyAsk).join('、')} —— 问而环境答无：读取失败，疑自解`
    )
  }
  if (cases.unseen.length) {
    issues.push(
      `未见 ×${cases.unseen.length}（不计分）：${uniq(cases.unseen).join('、')} —— 默认条全流无踪：疑而不罚`
    )
  }
  if (cases.fulfilled.length) {
    issues.push(
      `谋及 ×${cases.fulfilled.length}：${uniq(cases.fulfilled).join('、')} —— 先问后动：首触发之前已有问凭据`
    )
  }

  return {
    sessions: new Set(calls.map((c) => c.session)).size,
    calls: calls.length,
    asks: merged.length,
    score: { total, late, blind },
    band,
    gate,
    verdict,
    ok: verdict === 'pass',
    counts: {
      triggered: merged.length - cases.noaction.length,
      fulfilled: cases.fulfilled.length,
      late: cases.late.length,
      blind: cases.blindExplicit.length + cases.blindDefault.length,
      emptyAsk: cases.emptyAsk.length,
      unseen: cases.unseen.length,
      askCount: merged.length,
    },
    issues,
  }
}
