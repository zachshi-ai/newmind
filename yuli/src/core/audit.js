/**
 * 离线审计 —— 会话流文本 → 险账报告（契约无关，任何历史会话可直接验尸）。
 */

import { parseStream, buildCalls } from './stream.js'
import { analyze, liveScore, GATE_DEFAULT } from './yuzhang.js'

/**
 * @param {string} streamText 会话流全文（JSONL，# 注释）
 * @param {{ gate?: number, risk?: string[], exempt?: string[], noDefaults?: boolean }} opts
 */
export function auditStream(streamText, opts = {}) {
  const gate = Number.isFinite(opts.gate) ? opts.gate : GATE_DEFAULT
  const { calls } = buildCalls(parseStream(streamText))
  const engine = analyze(calls, opts)
  const live = liveScore(engine)

  const issues = []
  if (live.counts.nakedCases > 0) {
    const tools = engine.events
      .filter((e) => e.kind === '裸险' && e.scored > 0)
      .map((e) => `#${e.seq} ${e.tool}`)
      .join('、')
    issues.push(
      `裸险 ×${live.counts.nakedCases} 案（+${live.score.naked}）：${tools} 行前无备，物已不可追`,
    )
  }
  if (live.counts.declareItems > 0) {
    issues.push(
      `显式险词裸行 ×${live.counts.declareItems} 件（+${live.score.declare}）：册上之词行前缺备`,
    )
  }
  if (live.counts.feints > 0) {
    issues.push(`虚险 ×${live.counts.feints}（不计分，点名）：未遂——半伤不可辨，宁纵勿诬`)
  }
  if (live.counts.nettedCases > 0) {
    issues.push(`有备 ×${live.counts.nettedCases}（不计分）：行前有影/有史/有演，险而不疚`)
  }

  const ok = live.score.total < gate
  return {
    calls: calls.length,
    execObserved: live.counts.execObserved,
    risksObserved: live.counts.risksObserved,
    score: live.score,
    band: live.band,
    gate,
    verdict: ok ? 'pass' : 'fail',
    ok,
    counts: live.counts,
    issues,
    caseList: engine.events.map((e) => ({
      seq: e.seq,
      ref: e.ref,
      tool: e.tool,
      kind: e.kind,
      familyLabel: e.familyLabel,
      formId: e.formId,
      scored: e.scored,
      declareItems: e.declareItems ?? 0,
      excerpt: e.excerpt,
    })),
  }
}
